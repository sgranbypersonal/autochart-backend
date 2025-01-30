# import os
# import httpx
# from fastapi import HTTPException
# from model.transcript_request import TranscriptionRequest
# from model.transcript_response import TranscriptionResponse
# from service.gcp_service import upload_to_gcs, transcribe_audio_gcp, extract_fields_from_transcript

# async def handle_gcp_transcription(request: TranscriptionRequest) -> TranscriptionResponse:
#     temp_file_path = "temp_audio.wav"
#     bucket_name = "autochart"
#     destination_blob_name = "uploaded_audio.wav"
#     try:
#         async with httpx.AsyncClient(timeout=30.0) as client:
#             response = await client.get(request.audio_url)
#             if response.status_code != 200:
#                 raise HTTPException(status_code=400, detail="Could not download audio file")
#             with open(temp_file_path, "wb") as f:
#                 f.write(response.content)
#         gcs_uri = upload_to_gcs(temp_file_path, bucket_name, destination_blob_name)
#         transcript = transcribe_audio_gcp(gcs_uri, request.language)
#         return TranscriptionResponse(transcript=transcript)
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
#     finally:
#         if os.path.exists(temp_file_path):
#             os.remove(temp_file_path)
            
            
# async def handle_field_extraction(transcript: str):
#     try:
#         extracted_fields = extract_fields_from_transcript(transcript)
#         return extracted_fields
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Field extraction failed: {str(e)}")