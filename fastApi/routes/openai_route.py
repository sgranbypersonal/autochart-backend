from fastapi import APIRouter, HTTPException
from fastApi.model.transcript_request import TranscriptionRequest
from fastApi.model.transcript_response import TranscriptionResponse
from fastApi.model.transcript_extraction_request import TranscriptExtractionRequest
from fastApi.controller.openai_controller import handle_transcription, handle_field_extraction,handle_dialogue_transcription,handle_dialogue_field_extraction,handle_extraction
import os

router = APIRouter()


# START Testing Routes (Paragraph Transcription)

@router.post("/api/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(request: TranscriptionRequest):
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not found in environment variables")
    return await handle_transcription(request, OPENAI_API_KEY)

@router.post("/api/extract_fields")
async def extract_fields(request: TranscriptExtractionRequest):
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not found in environment variables")
    return await handle_field_extraction(request.transcript, OPENAI_API_KEY)

# END Testing Routes (Paragraph Transcription)


# START DIALOGUE Routes (Dialogue Transcription)

@router.post("/api/dialogue/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(request: TranscriptionRequest):
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not found in environment variables")
    return await handle_dialogue_transcription(request, OPENAI_API_KEY)


@router.post("/api/dialogue/extract_fields")
async def extract_fields(request: TranscriptExtractionRequest):
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not found in environment variables")
    return await handle_dialogue_field_extraction(request.transcript, OPENAI_API_KEY)

# END DIALOGUE Routes (Dialogue Transcription)


# Production Routes

@router.post("/api/extract_all" )
async def transcribe_audio(request: TranscriptionRequest):
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not found in environment variables")
    return await handle_extraction(request, OPENAI_API_KEY)