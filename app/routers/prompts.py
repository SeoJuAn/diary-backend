from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.dependencies import get_current_user
from app.database import query, query_one, execute, Transaction

router = APIRouter(prefix="/api/prompts", tags=["prompts"])

VALID_ENDPOINTS = {"organize-diary", "context-extract", "tts", "realtime"}


def _fmt(row) -> dict:
    r = dict(row)
    r["id"] = str(r["id"])
    if r.get("user_id"):
        r["user_id"] = str(r["user_id"])
    return r


@router.get("/{endpoint}")
async def get_prompt(
    endpoint: str,
    action: str = Query("current"),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["userId"]
    if endpoint not in VALID_ENDPOINTS:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 endpoint: {endpoint}")

    if action == "current":
        row = await query_one(
            """SELECT * FROM prompt_versions
               WHERE endpoint = $1 AND is_current = true
                 AND (user_id = $2::uuid OR user_id IS NULL)
               ORDER BY CASE WHEN user_id = $2::uuid THEN 0 ELSE 1 END
               LIMIT 1""",
            endpoint, user_id,
        )
        return {"success": True, "prompt": _fmt(row) if row else None}

    if action == "versions":
        rows = await query(
            """SELECT * FROM prompt_versions
               WHERE endpoint = $1
                 AND (user_id = $2::uuid OR user_id IS NULL)
               ORDER BY created_at DESC""",
            endpoint, user_id,
        )
        return {"success": True, "versions": [_fmt(r) for r in rows]}

    raise HTTPException(status_code=400, detail="action은 'current' 또는 'versions'이어야 합니다.")


class CreatePromptRequest(BaseModel):
    name: str
    prompt: str
    description: str | None = None
    advancedConfig: dict = {}


@router.post("/{endpoint}")
async def create_prompt(
    endpoint: str,
    body: CreatePromptRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["userId"]
    if endpoint not in VALID_ENDPOINTS:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 endpoint: {endpoint}")

    # 다음 버전 번호 계산 (해당 유저 기준)
    rows = await query(
        """SELECT version FROM prompt_versions
           WHERE endpoint = $1 AND (user_id = $2::uuid OR user_id IS NULL)
           ORDER BY created_at DESC""",
        endpoint, user_id,
    )
    versions = [r["version"] for r in rows]
    # v0, v1, v2 ... 형태에서 다음 번호
    nums = []
    for v in versions:
        try:
            nums.append(int(v.lstrip("v")))
        except ValueError:
            pass
    next_num = max(nums) + 1 if nums else 0
    next_version = f"v{next_num}"

    import json
    row = await query_one(
        """INSERT INTO prompt_versions (endpoint, version, name, prompt, description, advanced_config, is_default, is_current, user_id)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, false, false, $7::uuid)
           RETURNING *""",
        endpoint, next_version, body.name, body.prompt,
        body.description, json.dumps(body.advancedConfig), user_id,
    )
    return {"success": True, "version": _fmt(row)}


class SwitchPromptRequest(BaseModel):
    versionId: str


@router.put("/{endpoint}")
async def switch_prompt(
    endpoint: str,
    body: SwitchPromptRequest,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["userId"]

    target = await query_one(
        "SELECT id, endpoint, user_id FROM prompt_versions WHERE id = $1::uuid",
        body.versionId,
    )
    if not target:
        raise HTTPException(status_code=404, detail="프롬프트 버전을 찾을 수 없습니다.")

    async with Transaction() as conn:
        # 해당 유저의 현재 프롬프트 비활성화
        await conn.execute(
            """UPDATE prompt_versions SET is_current = false
               WHERE endpoint = $1
                 AND (user_id = $2::uuid OR (user_id IS NULL AND is_current = true))""",
            endpoint, user_id,
        )
        await conn.execute(
            "UPDATE prompt_versions SET is_current = true WHERE id = $1::uuid",
            body.versionId,
        )

    return {"success": True, "message": "프롬프트가 활성화되었습니다."}


@router.delete("/versions/{version_id}")
async def delete_prompt_version(
    version_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["userId"]

    row = await query_one(
        "SELECT id, is_default, is_current, user_id FROM prompt_versions WHERE id = $1::uuid",
        version_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="프롬프트 버전을 찾을 수 없습니다.")
    if row["is_default"]:
        raise HTTPException(status_code=403, detail="기본 프롬프트는 삭제할 수 없습니다.")
    if row["user_id"] is None or str(row["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="본인의 프롬프트만 삭제할 수 있습니다.")
    if row["is_current"]:
        raise HTTPException(status_code=400, detail="현재 활성화된 프롬프트는 삭제할 수 없습니다.")

    await execute("DELETE FROM prompt_versions WHERE id = $1::uuid", version_id)
    return {"success": True, "message": "프롬프트 버전이 삭제되었습니다."}
