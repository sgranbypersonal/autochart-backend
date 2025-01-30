# import os
# import json
# import boto3
# from google.cloud import speech, storage
# from fastapi import HTTPException

# def upload_to_gcs(file_path: str, bucket_name: str, destination_blob_name: str):
#     try:
#         storage_client = storage.Client()
#         bucket = storage_client.bucket(bucket_name)
#         blob = bucket.blob(destination_blob_name)
#         blob.upload_from_filename(file_path)
#         return f"gs://{bucket_name}/{destination_blob_name}"
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"GCS upload failed: {str(e)}")

# def transcribe_audio_gcp(gcs_uri: str, language: str):
#     try:
#         client = speech.SpeechClient()
#         audio = speech.RecognitionAudio(uri=gcs_uri)
#         config = speech.RecognitionConfig(
#             encoding=speech.RecognitionConfig.AudioEncoding.LINEAR16,
#             language_code=language,
#             audio_channel_count=2,
#         )
#         response = client.recognize(config=config, audio=audio)
#         transcript = " ".join(result.alternatives[0].transcript for result in response.results)
#         return transcript.strip()
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

# def extract_fields_from_transcript(transcript: str):
#     try:
#         # Load field descriptions from a JSON file
#         try:
#             with open("prompt/FailFields.json", "r") as f:
#                 field_descriptions = json.load(f)
#         except (FileNotFoundError, json.JSONDecodeError) as e:
#             print(f"Error loading JSON file: {e}")
#             return {"error": "Failed to load field descriptions."}

#         extracted_fields = {}

#         # AWS credentials and region
#         aws_access_key_id = os.getenv('AWS_ACCESS_KEY_ID')
#         aws_secret_access_key = os.getenv('AWS_SECRET_ACCESS_KEY')
#         aws_region = os.getenv('AWS_DEFAULT_REGION')

#         if not all([aws_access_key_id, aws_secret_access_key, aws_region]):
#             raise ValueError("AWS credentials or region are not set in the .env file.")

#         # Initialize Amazon Comprehend client
#         comprehend = boto3.client('comprehend', region_name=aws_region)

#         # Iterate through each group and extract fields
#         for group_name, fields in field_descriptions.items():
#             prompt = f"""
#                 Extract structured medical data for these fields from the following description. For each field:
#                 - If the information is completely absent or cannot be determined, use "-"
#                 - If information is available, select the most appropriate value from the provided options
#                 - For dropdown fields, choose the single most appropriate option that matches the description
#                 - For multiselect fields, select all applicable options that match the description
#                 Fields to extract:
#                 {fields}
#                 Medical description: {transcript}
#                 Important guidelines:
#                 1. Use "-" ONLY when:
#                    - The information is completely absent from the description
#                    - There is no way to determine an appropriate value
#                 2. When information is available:
#                    - Select the most appropriate option(s) from the valid values
#                    - Use "-" only if there is no relevant information for the field
#                 3. Value selection:
#                    - For dropdown fields: Choose the single best matching option, or "-" if no related information exists
#                    - For multiselect fields: Select all relevant options
#                    - For number fields: Use values within the specified ranges

#                 For each field, extract:
#                 1. The field value
#                 2. The exact position start and end index from transcript string in the original text
#                 3. If information is absent, use "-" for all fields

#                 Output format must strictly follow this JSON structure:
#                 {{
#                 "{group_name}": [
#                     {{
#                     "Field Name": "field_name",
#                     "Extracted Information": "value",
#                     "Starting Index": number_or_dash,
#                     "Ending Index": number_or_dash
#                     }}
#                 ]
#                 }}
#                 Guidelines:
#                 1. Use "-" when information is absent or cannot be determined
#                 2. For numeric fields: Use exact numbers
#                 3. For categorical fields: Use exact matching option
#                 4. All positions must be numbers or "-"
#                 5. Include all fields in response, even if value is "-"
#                 """

#             try:
#                 response = comprehend.detect_entities(
#                     Text=prompt,
#                     LanguageCode='en'
#                 )
#             except Exception as e:
#                 print(f"Error with AWS Comprehend API Call: {e}")
#                 raise HTTPException(status_code=500, detail="AWS Comprehend API call failed.")

#             response_content = response['Entities']

#             try:
#                 group_extracted_fields = json.loads(response_content)
#             except json.JSONDecodeError as e:
#                 raise HTTPException(status_code=500, detail=f"Failed to load fields: {str(e)}")

#             # Update the extracted_fields dictionary with the new data
#             extracted_fields.update(group_extracted_fields)

#             print("response_content", response_content)

#         return extracted_fields

#     except Exception as e:
#         print(f"Error: {e}")
#         raise HTTPException(status_code=500, detail=f"Field extraction failed: {str(e)}")