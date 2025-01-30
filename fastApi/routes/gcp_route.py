# from fastapi import APIRouter
# from model.transcript_request import TranscriptionRequest
# from model.transcript_response import TranscriptionResponse
# from controller.gcp_controller import handle_gcp_transcription, handle_field_extraction
# from model.transcript_extraction_request import TranscriptExtractionRequest


# router = APIRouter()

# @router.post("/gcp/transcribe", response_model=TranscriptionResponse)
# async def transcribe_audio_gcp_route(request: TranscriptionRequest):
#     return await handle_gcp_transcription(request)

# @router.post("/api/aws/extract_fields")
# async def extract_fields(request: TranscriptExtractionRequest):
#     return await handle_field_extraction(request.transcript)
