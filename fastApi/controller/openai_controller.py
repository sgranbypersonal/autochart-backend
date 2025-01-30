import httpx
from fastapi import HTTPException
from fastApi.model.transcript_request import TranscriptionRequest
from fastApi.model.transcript_response import TranscriptionResponse
from fastApi.service.openai_service import transcribe_audio_openai, extract_fields_from_transcript,transcribe_dialogue_audio,extract_fields_from_dialogue,transcribe_and_extract

async def handle_transcription(request: TranscriptionRequest, api_key: str) -> TranscriptionResponse:
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(request.audio_url)
            # print(request.audio_url)
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Could not download audio file")
            file_extension = request.audio_url.split('.')[-1].lower()
            if file_extension not in ['wav', 'webm']:
                raise HTTPException(status_code=400, detail="Unsupported audio format")
            temp_file_path = f"temp_audio.{file_extension}"
            with open(temp_file_path, "wb") as f:
                f.write(response.content)
        transcript = transcribe_audio_openai(temp_file_path, request.language, api_key)
        return TranscriptionResponse(transcript=transcript)
        # return transcript
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    
    
async def handle_field_extraction(transcript: str, api_key: str):
    try:
        extracted_fields = extract_fields_from_transcript(transcript, api_key)
        return extracted_fields
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Field extraction failed: {str(e)}")
    

async def handle_dialogue_transcription(request: TranscriptionRequest, api_key: str) -> TranscriptionResponse:
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(request.audio_url)
            # print(request.audio_url)
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Could not download audio file")
            file_extension = request.audio_url.split('.')[-1].lower()
            if file_extension not in ['wav', 'webm']:
                raise HTTPException(status_code=400, detail="Unsupported audio format")
            temp_file_path = f"temp_audio.{file_extension}"
            with open(temp_file_path, "wb") as f:
                f.write(response.content)
        transcript = transcribe_dialogue_audio(temp_file_path, request.language, api_key)
        return TranscriptionResponse(transcript=transcript)
        # return transcript
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

async def handle_dialogue_field_extraction(transcript: str, api_key: str):
    try:
        extracted_fields = extract_fields_from_dialogue(transcript, api_key)
        return extracted_fields
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Field extraction failed: {str(e)}")
    
    
async def handle_extraction(request: TranscriptionRequest, api_key: str) -> TranscriptionResponse:
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(request.audio_url)
            # print(request.audio_url)
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Could not download audio file")
            file_extension = request.audio_url.split('.')[-1].lower()
            if file_extension not in ['wav', 'webm']:
                raise HTTPException(status_code=400, detail="Unsupported audio format")
            temp_file_path = f"temp_audio.{file_extension}"
            with open(temp_file_path, "wb") as f:
                f.write(response.content)
        transcript = transcribe_and_extract(temp_file_path, request.language, api_key)
        return TranscriptionResponse(transcript=transcript)
        # return transcript
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")