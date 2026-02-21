import io
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from openai import AsyncOpenAI
from app.dependencies import get_current_user
from app.config import settings

router = APIRouter(prefix="/api/audio", tags=["audio"])


@router.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("ko"),
    current_user: dict = Depends(get_current_user),
):
    client = AsyncOpenAI(api_key=settings.openai_api_key)
    content = await file.read()

    # OpenAI SDK는 파일명/타입이 필요함
    file_tuple = (file.filename or "audio.m4a", io.BytesIO(content), file.content_type or "audio/m4a")

    resp = await client.audio.transcriptions.create(
        model="gpt-4o-transcribe",
        file=file_tuple,
        language=language,
        response_format="verbose_json",
    )

    return {
        "success": True,
        "text": resp.text,
        "language": getattr(resp, "language", language),
        "duration": getattr(resp, "duration", None),
    }


class SpeechRequest(BaseModel):
    text: str
    voice: str = "alloy"
    model: str = "gpt-4o-mini-tts"
    response_format: str = "mp3"
    speed: float = 1.0
    instructions: str | None = None


@router.post("/speech")
async def speech(body: SpeechRequest, current_user: dict = Depends(get_current_user)):
    client = AsyncOpenAI(api_key=settings.openai_api_key)

    kwargs = dict(
        model=body.model,
        voice=body.voice,
        input=body.text,
        response_format=body.response_format,
        speed=body.speed,
    )
    if body.instructions:
        kwargs["instructions"] = body.instructions

    resp = await client.audio.speech.create(**kwargs)
    audio_bytes = resp.read()

    content_type_map = {
        "mp3": "audio/mpeg",
        "opus": "audio/opus",
        "aac": "audio/aac",
        "flac": "audio/flac",
        "wav": "audio/wav",
        "pcm": "audio/pcm",
    }
    content_type = content_type_map.get(body.response_format, "audio/mpeg")

    return StreamingResponse(io.BytesIO(audio_bytes), media_type=content_type)
