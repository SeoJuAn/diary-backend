from datetime import datetime, timezone, timedelta
from typing import Any
import jwt
import bcrypt
from app.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def _make_token(payload: dict[str, Any], secret: str, expires_in: int) -> str:
    data = payload.copy()
    data["exp"] = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
    return jwt.encode(data, secret, algorithm="HS256")


def sign_access_token(user_id: str, email: str, nickname: str | None = None) -> str:
    return _make_token(
        {"userId": user_id, "email": email, "nickname": nickname},
        settings.jwt_access_secret,
        settings.jwt_access_expires_in,
    )


def sign_refresh_token(user_id: str, email: str, nickname: str | None = None) -> str:
    return _make_token(
        {"userId": user_id, "email": email, "nickname": nickname},
        settings.jwt_refresh_secret,
        settings.jwt_refresh_expires_in,
    )


def verify_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_access_secret, algorithms=["HS256"])


def verify_refresh_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.jwt_refresh_secret, algorithms=["HS256"])
