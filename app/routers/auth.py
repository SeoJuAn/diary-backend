import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from app.database import query_one, execute
from app.auth_utils import (
    hash_password, verify_password, sign_access_token, sign_refresh_token,
    verify_refresh_token, hash_refresh_token,
)
from app.rate_limit import limiter
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger("auth")


class RegisterRequest(BaseModel):
    username: str
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class RefreshRequest(BaseModel):
    refreshToken: str


def _user_response(row) -> dict:
    return {
        "id": str(row["id"]),
        "email": row["email"],
        "nickname": row["nickname"],
    }


def _mask(username: str) -> str:
    """로그용 부분 마스킹 — 앞 2글자만 노출."""
    if not username:
        return ""
    return username[:2] + "*" * max(len(username) - 2, 1)


async def _track_refresh_token(user_id: str, token: str) -> None:
    """
    refresh_tokens 테이블에 새 토큰의 해시를 기록한다 (폐기/재사용 감지용).
    테이블이 아직 마이그레이션되지 않았어도 로그인/회원가입 자체는 실패하지
    않도록 best-effort로 처리한다 (하위호환).
    """
    try:
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.jwt_refresh_expires_in)
        await execute(
            """INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
               VALUES ($1::uuid, $2, $3)
               ON CONFLICT (token_hash) DO NOTHING""",
            user_id, hash_refresh_token(token), expires_at,
        )
    except Exception as e:
        logger.debug(f"refresh_tokens 기록 스킵 (마이그레이션 미적용 가능): {e}")


@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def register(request: Request, body: RegisterRequest):
    logger.info(f"📋 회원가입 요청 — username={_mask(body.username)}")
    if not body.username or len(body.username.strip()) == 0:
        raise HTTPException(status_code=400, detail="아이디를 입력해주세요.")

    existing = await query_one(
        "SELECT id FROM users WHERE email = $1", body.username.strip()
    )
    if existing:
        raise HTTPException(status_code=409, detail="이미 사용 중인 아이디입니다.")

    hashed = hash_password(body.password)
    row = await query_one(
        """INSERT INTO users (email, password_hash, nickname)
           VALUES ($1, $2, $3)
           RETURNING id, email, nickname""",
        body.username.strip(), hashed, body.username.strip(),
    )

    user = _user_response(row)
    access_token = sign_access_token(user["id"], user["email"], user["nickname"])
    refresh_token = sign_refresh_token(user["id"], user["email"], user["nickname"])
    await _track_refresh_token(user["id"], refresh_token)
    logger.info(f"✅ 회원가입 완료 — userId={user['id']}, username={_mask(body.username)}")

    return {"success": True, "user": user, "accessToken": access_token, "refreshToken": refresh_token}


@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest):
    logger.info(f"🔑 로그인 요청 — username={_mask(body.username)}")
    row = await query_one(
        "SELECT id, email, nickname, password_hash FROM users WHERE email = $1",
        body.username.strip(),
    )
    if not row or not verify_password(body.password, row["password_hash"]):
        logger.warning(f"⚠️  로그인 실패 — username={_mask(body.username)} (잘못된 자격증명)")
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")

    user = _user_response(row)
    access_token = sign_access_token(user["id"], user["email"], user["nickname"])
    refresh_token = sign_refresh_token(user["id"], user["email"], user["nickname"])
    await _track_refresh_token(user["id"], refresh_token)
    logger.info(f"✅ 로그인 성공 — userId={user['id']}, username={_mask(body.username)}")

    return {"success": True, "user": user, "accessToken": access_token, "refreshToken": refresh_token}


@router.post("/refresh")
@limiter.limit("30/minute")
async def refresh(request: Request, body: RefreshRequest):
    try:
        payload = verify_refresh_token(body.refreshToken)
    except Exception:
        raise HTTPException(status_code=401, detail="유효하지 않은 refresh token입니다.")

    user_id = payload.get("userId")
    row = await query_one(
        "SELECT id, email, nickname FROM users WHERE id = $1", user_id
    )
    if not row:
        raise HTTPException(status_code=401, detail="사용자를 찾을 수 없습니다.")

    # ── 폐기/재사용 감지 (refresh_tokens 테이블이 있을 때만 동작 — 하위호환) ──
    try:
        token_hash = hash_refresh_token(body.refreshToken)
        existing = await query_one(
            "SELECT id, revoked FROM refresh_tokens WHERE token_hash = $1", token_hash
        )
        if existing and existing["revoked"]:
            # 이미 폐기된(=한 번 사용된) refresh token 재사용 시도 — 탈취 의심,
            # 해당 유저의 모든 refresh token을 폐기해 세션을 강제 종료한다.
            await execute(
                "UPDATE refresh_tokens SET revoked = true WHERE user_id = $1::uuid", user_id
            )
            logger.warning(f"⚠️  폐기된 refresh token 재사용 시도 — userId={user_id}")
            raise HTTPException(status_code=401, detail="이미 사용된 refresh token입니다. 다시 로그인해주세요.")
        if existing:
            await execute("UPDATE refresh_tokens SET revoked = true WHERE id = $1::uuid", existing["id"])
    except HTTPException:
        raise
    except Exception as e:
        logger.debug(f"refresh_tokens 조회 스킵 (마이그레이션 미적용 가능): {e}")

    user = _user_response(row)
    access_token = sign_access_token(user["id"], user["email"], user["nickname"])
    refresh_token = sign_refresh_token(user["id"], user["email"], user["nickname"])
    await _track_refresh_token(user["id"], refresh_token)

    return {"success": True, "user": user, "accessToken": access_token, "refreshToken": refresh_token}


@router.post("/logout")
async def logout(body: RefreshRequest):
    try:
        await execute(
            "UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1",
            hash_refresh_token(body.refreshToken),
        )
    except Exception as e:
        logger.debug(f"logout 시 refresh_tokens 갱신 스킵: {e}")
    return {"success": True, "message": "로그아웃되었습니다."}
