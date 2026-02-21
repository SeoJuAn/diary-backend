import logging
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from app.database import query_one, execute
from app.auth_utils import hash_password, verify_password, sign_access_token, sign_refresh_token, verify_refresh_token

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


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest):
    logger.info(f"📋 회원가입 요청 — username={body.username}")
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
    logger.info(f"✅ 회원가입 완료 — userId={user['id']}, username={body.username}")

    return {"success": True, "user": user, "accessToken": access_token, "refreshToken": refresh_token}


@router.post("/login")
async def login(body: LoginRequest):
    logger.info(f"🔑 로그인 요청 — username={body.username}")
    row = await query_one(
        "SELECT id, email, nickname, password_hash FROM users WHERE email = $1",
        body.username.strip(),
    )
    if not row or not verify_password(body.password, row["password_hash"]):
        logger.warning(f"⚠️  로그인 실패 — username={body.username} (잘못된 자격증명)")
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 올바르지 않습니다.")

    user = _user_response(row)
    access_token = sign_access_token(user["id"], user["email"], user["nickname"])
    refresh_token = sign_refresh_token(user["id"], user["email"], user["nickname"])
    logger.info(f"✅ 로그인 성공 — userId={user['id']}, username={body.username}")

    return {"success": True, "user": user, "accessToken": access_token, "refreshToken": refresh_token}


@router.post("/refresh")
async def refresh(body: RefreshRequest):
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

    user = _user_response(row)
    access_token = sign_access_token(user["id"], user["email"], user["nickname"])
    refresh_token = sign_refresh_token(user["id"], user["email"], user["nickname"])

    return {"success": True, "user": user, "accessToken": access_token, "refreshToken": refresh_token}
