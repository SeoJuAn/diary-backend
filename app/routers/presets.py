from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from app.dependencies import get_current_user
from app.database import query, query_one, execute, Transaction

router = APIRouter(prefix="/api/advanced-presets", tags=["presets"])


class CreatePresetRequest(BaseModel):
    endpoint: str = "realtime"
    presetName: str
    temperature: float = 0.8
    speed: float = 1.0
    threshold: float = 0.5
    prefixPaddingMs: int = 300
    silenceDurationMs: int = 200
    idleTimeoutMs: int | None = None
    maxOutputTokens: str = "inf"
    noiseReduction: bool | None = None
    truncation: str = "auto"


class SwitchPresetRequest(BaseModel):
    endpoint: str = "realtime"
    presetId: str


class DeletePresetRequest(BaseModel):
    presetId: str


def _fmt(row) -> dict:
    r = dict(row)
    r["id"] = str(r["id"])
    if r.get("user_id"):
        r["user_id"] = str(r["user_id"])
    return r


@router.get("")
async def list_presets(
    endpoint: str = Query("realtime"),
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["userId"]
    rows = await query(
        """SELECT id, endpoint, preset_name, temperature, speed, threshold,
                  prefix_padding_ms, silence_duration_ms, idle_timeout_ms,
                  max_output_tokens, noise_reduction, truncation,
                  is_system, is_current, user_id, created_at
           FROM advanced_presets
           WHERE endpoint = $1
             AND (user_id = $2::uuid OR user_id IS NULL)
           ORDER BY is_system DESC, created_at ASC""",
        endpoint, user_id,
    )
    return {"success": True, "presets": [_fmt(r) for r in rows]}


@router.post("")
async def create_preset(body: CreatePresetRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["userId"]

    # 이름 중복 확인 (같은 유저 내에서)
    existing = await query_one(
        "SELECT id FROM advanced_presets WHERE endpoint = $1 AND preset_name = $2 AND user_id = $3::uuid",
        body.endpoint, body.presetName, user_id,
    )
    if existing:
        raise HTTPException(status_code=409, detail="같은 이름의 프리셋이 이미 존재합니다.")

    row = await query_one(
        """INSERT INTO advanced_presets (
             endpoint, preset_name, temperature, speed, threshold,
             prefix_padding_ms, silence_duration_ms, idle_timeout_ms,
             max_output_tokens, noise_reduction, truncation,
             is_system, is_current, user_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,false,$12::uuid)
           RETURNING *""",
        body.endpoint, body.presetName, body.temperature, body.speed, body.threshold,
        body.prefixPaddingMs, body.silenceDurationMs, body.idleTimeoutMs,
        body.maxOutputTokens, body.noiseReduction, body.truncation,
        user_id,
    )
    return {"success": True, "preset": _fmt(row)}


@router.put("")
async def switch_preset(body: SwitchPresetRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["userId"]

    target = await query_one(
        "SELECT id, endpoint, user_id FROM advanced_presets WHERE id = $1::uuid",
        body.presetId,
    )
    if not target:
        raise HTTPException(status_code=404, detail="프리셋을 찾을 수 없습니다.")

    async with Transaction() as conn:
        # 해당 유저의 현재 프리셋 비활성화
        await conn.execute(
            """UPDATE advanced_presets SET is_current = false
               WHERE endpoint = $1
                 AND (user_id = $2::uuid OR (user_id IS NULL AND is_current = true))""",
            target["endpoint"], user_id,
        )
        await conn.execute(
            "UPDATE advanced_presets SET is_current = true WHERE id = $1::uuid",
            body.presetId,
        )

    return {"success": True, "message": "프리셋이 활성화되었습니다."}


@router.delete("")
async def delete_preset(body: DeletePresetRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["userId"]

    row = await query_one(
        "SELECT id, is_system, is_current, user_id FROM advanced_presets WHERE id = $1::uuid",
        body.presetId,
    )
    if not row:
        raise HTTPException(status_code=404, detail="프리셋을 찾을 수 없습니다.")
    if row["is_system"]:
        raise HTTPException(status_code=403, detail="시스템 프리셋은 삭제할 수 없습니다.")
    if str(row["user_id"]) != user_id:
        raise HTTPException(status_code=403, detail="본인의 프리셋만 삭제할 수 있습니다.")
    if row["is_current"]:
        raise HTTPException(status_code=400, detail="현재 활성화된 프리셋은 삭제할 수 없습니다.")

    await execute("DELETE FROM advanced_presets WHERE id = $1::uuid", body.presetId)
    return {"success": True, "message": "프리셋이 삭제되었습니다."}
