import os
import json
import re
from typing import List, Dict
import math
# rom langchain_community.chat_models import ChatOpenAI
import openai
from pydub import AudioSegment
from fastapi import HTTPException
# from langchain_openai import ChatOpenAI
# from langchain_community.chat_models import ChatOpenAI
from langchain_community.chat_models import ChatOpenAI
from pydantic import BaseModel, ConfigDict
from langchain.chat_models import ChatOpenAI
from langchain.prompts import ChatPromptTemplate


# Load the OpenAI API key from environment variables
openai.api_key = os.getenv("OPENAI_API_KEY")

# Generation settings
generation_config = {
    "max_tokens": 4096,
    "temperature": 0.3,
}

def transcribe_audio_openai(file_path: str, language: str, api_key: str):
    try:
        client = openai.Client(api_key=api_key)
        audio = AudioSegment.from_file(file_path)
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        if file_size_mb <= 25.0:
            with open(file_path, "rb") as audio_file:
                transcript = client.audio.transcriptions.create(
                    file=audio_file,
                    model="whisper-1",
                    language=language,
                    response_format="text"
                )
        else:
            num_chunks = math.ceil(file_size_mb / 25.0)
            chunk_duration = len(audio) // num_chunks
            transcripts = []
            for i in range(num_chunks):
                start_time = i * chunk_duration
                end_time = (i + 1) * chunk_duration if i < num_chunks - 1 else len(audio)
                chunk = audio[start_time:end_time]
                chunk_path = f"temp_chunk_{i}.{file_path.split('.')[-1]}"
                chunk.export(chunk_path, format=file_path.split('.')[-1])
                try:
                    with open(chunk_path, "rb") as chunk_file:
                        chunk_transcript = client.audio.transcriptions.create(
                            file=chunk_file,
                            model="whisper-1",
                            language=language,
                            response_format="text"
                        )
                        transcripts.append(chunk_transcript)
                finally:
                    if os.path.exists(chunk_path):
                        os.remove(chunk_path)
            transcript = " ".join(transcripts)
        return transcript
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        if os.path.exists(file_path):
             os.remove(file_path)


def extract_fields_from_transcript(transcript: str, api_key: str):
    try:
        # Load field descriptions
        try:
            # with open("fastApi/prompt/FailFields.json", "r") as f:
            with open("fastApi/prompt/WithoutPrompt.json", "r") as f:
                field_descriptions = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"Error loading JSON file: {e}")
            return {"error": "Failed to load field descriptions."}

        # Initialize LangChain chat model
        model = ChatOpenAI(
            model_name="gpt-4o",
            temperature=0.5,
            api_key=api_key
        )

        # Process each group
        extracted_data = {}
        for group_name, fields in field_descriptions.items():
            # Create the prompt with explicit schema
            output_schema = create_output_schema({group_name: fields})
            
            
            prompt = ChatPromptTemplate.from_template("""
                Extract structured medical data for these fields from the following description, focusing on the most recent values.
                Include the exact start and end character positions (indices) for each extracted piece of information.
                
                Fields to extract (with their requirements):
                {fields}

                Medical description: {transcript}

                Guidelines:
                1. For each field:
                   - ALWAYS prioritize the most recent/latest value mentioned in the text
                   - If multiple values exist, use only the most recent one
                   - If the information is completely absent or cannot be determined, use "-" for the value and -1 for both indices
                   - If information is available:
                     * Provide the exact text as found
                     * Include the start_index (first character position of the extracted text)
                     * Include the end_index (last character position of the extracted text)
                   - For fields with options, choose from the provided options only
                2. For numeric fields: 
                   - Extract only the most recent measurement
                   - Use exact numbers found in the text
                   - Include the position of the entire numeric value
                   - If multiple measurements exist, select the latest one only
                3. For categorical fields:
                   - Use exact matching option from the provided list
                   - Include the position where this value appears in the text
                   - For multiple occurrences, use only the most recent one
                4. Include all fields in response, even if value is "-"
                5. For repeated measurements (like vital signs):
                   - Extract ONLY the most recent measurement
                   - Look for temporal indicators like dates, times, or sequence markers
                   - If no temporal indicators exist, assume later mentions are more recent
                6. Ensure the output is strictly valid JSON
                7. For multiple-choice fields:
                   - Select all applicable options from the most recent assessment
                   - Do not mix options from different time points
                8. For free-text fields:
                    - Focus on the most recent information
                    - Provide a brief, focused summary (2-3 lines max)
                    - Extract only the most critical and relevant information
                    - Do NOT include the entire transcript
                    - Summarize key points succinctly
                    - Prioritize the specific context or request of the field
                    - Ensure the extracted text is minimal and directly answers the field's intent

                {output_schema}
                
                Critical Instructions:
                    - ALWAYS prioritize the most recent values for every field
                    - Look for temporal indicators to determine recency
                    - Extract minimal text snippets
                    - Include precise positions for the exact extracted text
                    - Ensure the output is strictly valid JSON. Avoid trailing commas, and do not include extra whitespace or non-JSON text.
                    - If multiple values exist for a field, only return the most recent one
            """)


            # Format the prompt
            formatted_prompt = prompt.format_messages(
                fields=json.dumps(fields, indent=2),
                transcript=transcript,
                output_schema=output_schema
            )

            try:
                # Get response from the model
                response = model.invoke(formatted_prompt)
                # print(f"Response: {response}")
                try:
                    # Clean and parse the JSON response
                    cleaned_response = clean_json_response(response.content)
                    parsed_response = json.loads(cleaned_response)
                    # print(f"Parsed response: {parsed_response}")
                    # Validate the structure
                    # print(f"Group name: {group_name}")
                    # if group_name not in parsed_response:
                    #     raise ValueError(f"Response missing {group_name} group")
                        
                    group_data = parsed_response[group_name]
                    if not isinstance(group_data, list):
                        raise ValueError(f"Expected list for {group_name} group")
                        
                    # Add to extracted data
                    extracted_data[group_name] = group_data
                    # print(f"Extracted data for group {group_name}: {group_data}")
                except json.JSONDecodeError as e:
                    print(f"Error parsing JSON response: {e}")
                    print(f"Raw response: {response.content}")
                    print(f"Cleaned response: {cleaned_response}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to parse response for group {group_name}"
                    )

            except Exception as e:
                print(f"Error processing group {group_name}: {e}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to process group {group_name}: {str(e)}"
                )

        return extracted_data

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Field extraction failed: {str(e)}"
        )

# def clean_json_response(response: str) -> str:
#     """Clean the response by removing markdown code blocks and other artifacts"""
#     # Remove markdown code blocks
#     cleaned = re.sub(r'```json\s*|\s*```', '', response)
#     # Remove any leading/trailing whitespace
#     cleaned = cleaned.strip()
#     return cleaned

# def clean_json_response(response: str) -> str:
#     """Clean the response by removing markdown code blocks and other artifacts"""
#     # Remove markdown code blocks
#     cleaned = re.sub(r'```json\s*|\s*```', '', response)
#     # Remove trailing commas before closing braces/brackets
#     cleaned = re.sub(r',\s*(\]|\})', r'\1', cleaned)
#     # Remove any leading/trailing whitespace
#     cleaned = cleaned.strip()
#     return cleaned

def clean_json_response(response: str) -> str:
    """Clean the response by removing markdown code blocks and formatting artifacts."""
    cleaned = re.sub(r'```json\s*|\s*```', '', response)  # Remove markdown
    cleaned = re.sub(r',\s*(\]|\})', r'\1', cleaned)  # Remove trailing commas
    return cleaned.strip()


def create_output_schema(field_descriptions: Dict) -> str:
    """Creates a schema description for the LLM."""
    schema_parts = []
    for group_name, fields in field_descriptions.items():
        group = [f'    {{"field_name": "{field["Field Name"]}", "extracted_information": '
                 f'"{field.get("Options", field.get("Desired Format", "any value"))} or - if not found"}}'
                 for field in fields]
        schema_parts.append(f'"{group_name}": [\n' + ",\n".join(group) + "\n    ]")
        # print("{\n" + ",\n".join(schema_parts) + "\n}")
    return "{\n" + ",\n".join(schema_parts) + "\n}"


def transcribe_dialogue_audio(file_path: str, language: str, api_key: str):
    try:
        client = openai.Client(api_key=api_key)
        audio = AudioSegment.from_file(file_path)
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        if file_size_mb <= 25.0:
            with open(file_path, "rb") as audio_file:
                transcript = client.audio.transcriptions.create(
                    file=audio_file,
                    model="whisper-1",
                    language=language,
                    response_format="text"
                )
        else:
            num_chunks = math.ceil(file_size_mb / 25.0)
            chunk_duration = len(audio) // num_chunks
            transcripts = []
            for i in range(num_chunks):
                start_time = i * chunk_duration
                end_time = (i + 1) * chunk_duration if i < num_chunks - 1 else len(audio)
                chunk = audio[start_time:end_time]
                chunk_path = f"temp_chunk_{i}.{file_path.split('.')[-1]}"
                chunk.export(chunk_path, format=file_path.split('.')[-1])
                try:
                    with open(chunk_path, "rb") as chunk_file:
                        chunk_transcript = client.audio.transcriptions.create(
                            file=chunk_file,
                            model="whisper-1",
                            language=language,
                            response_format="text"
                        )
                        transcripts.append(chunk_transcript)
                finally:
                    if os.path.exists(chunk_path):
                        os.remove(chunk_path)
            transcript = " ".join(transcripts)
            dialogue = transcript_to_dialogue(transcript, api_key)
        return dialogue
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        if os.path.exists(file_path):
             os.remove(file_path)


def transcript_to_dialogue(transcript: str, api_key: str):
    try:
        model = ChatOpenAI(
            model_name="gpt-4o",
            temperature=0.5,
            api_key=api_key
        )

        prompt_template = """
        Given the following medical transcript, format it as a structured dialogue between the Nurse and the Patient.
        Ensure to use proper roles where mentioned, and format it clearly as:
        
        Nurse: [dialogue]
        Patient: [dialogue]
        
        Transcript:
        """

        prompt = ChatPromptTemplate.from_template(prompt_template + transcript)
        response = model.predict(prompt.format())
        formatted_response = response.replace("\n\n", "\n").strip()
        return formatted_response
    
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Dialogue formatting failed: {str(e)}"
        )



def extract_fields_from_dialogue(transcript: str, api_key: str):
    try:
        # Load field descriptions
        try:
            # with open("fastApi/prompt/FailFields.json", "r") as f:
            with open("fastApi/prompt/WithoutPrompt.json", "r") as f:
                field_descriptions = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"Error loading JSON file: {e}")
            return {"error": "Failed to load field descriptions."}

        # Initialize LangChain chat model
        model = ChatOpenAI(
            model_name="gpt-4o",
            temperature=0.5,
            api_key=api_key
        )

        # Process each group
        extracted_data = {}
        for group_name, fields in field_descriptions.items():
            # Create the prompt with explicit schema
            output_schema = create_output_schema({group_name: fields})
            
            
            prompt = ChatPromptTemplate.from_template("""
                Extract structured medical data for these fields from the following description, focusing on the most recent values.
                Include the exact start and end character positions (indices) for each extracted piece of information.
                
                Fields to extract (with their requirements):
                {fields}

                Medical description: {transcript}

                Guidelines:
                1. For each field:
                   - ALWAYS prioritize the most recent/latest value mentioned in the text
                   - If multiple values exist, use only the most recent one
                   - If the information is completely absent or cannot be determined, use "-" for the value and -1 for both indices
                   - If information is available:
                     * Provide the exact text as found
                     * Include the start_index (first character position of the extracted text)
                     * Include the end_index (last character position of the extracted text)
                   - For fields with options, choose from the provided options only
                2. For numeric fields: 
                   - Extract only the most recent measurement
                   - Use exact numbers found in the text
                   - Include the position of the entire numeric value
                   - If multiple measurements exist, select the latest one only
                3. For categorical fields:
                   - Use exact matching option from the provided list
                   - Include the position where this value appears in the text
                   - For multiple occurrences, use only the most recent one
                4. Include all fields in response, even if value is "-"
                5. For repeated measurements (like vital signs):
                   - Extract ONLY the most recent measurement
                   - Look for temporal indicators like dates, times, or sequence markers
                   - If no temporal indicators exist, assume later mentions are more recent
                6. Ensure the output is strictly valid JSON
                7. For multiple-choice fields:
                   - Select all applicable options from the most recent assessment
                   - Do not mix options from different time points
                8. For free-text fields:
                    - Focus on the most recent information
                    - Provide a brief, focused summary (2-3 lines max)
                    - Extract only the most critical and relevant information
                    - Do NOT include the entire transcript
                    - Summarize key points succinctly
                    - Prioritize the specific context or request of the field
                    - Ensure the extracted text is minimal and directly answers the field's intent

                {output_schema}
                
                Critical Instructions:
                    - ALWAYS prioritize the most recent values for every field
                    - Look for temporal indicators to determine recency
                    - Extract minimal text snippets
                    - Include precise positions for the exact extracted text
                    - Ensure the output is strictly valid JSON. Avoid trailing commas, and do not include extra whitespace or non-JSON text.
                    - If multiple values exist for a field, only return the most recent one
            """)


            # Format the prompt
            formatted_prompt = prompt.format_messages(
                fields=json.dumps(fields, indent=2),
                transcript=transcript,
                output_schema=output_schema
            )

            try:
                # Get response from the model
                response = model.invoke(formatted_prompt)
                # print(f"Response: {response}")
                try:
                    # Clean and parse the JSON response
                    cleaned_response = clean_json_response(response.content)
                    parsed_response = json.loads(cleaned_response)
                    # print(f"Parsed response: {parsed_response}")
                    # Validate the structure
                    # print(f"Group name: {group_name}")
                    # if group_name not in parsed_response:
                    #     raise ValueError(f"Response missing {group_name} group")
                        
                    group_data = parsed_response[group_name]
                    if not isinstance(group_data, list):
                        raise ValueError(f"Expected list for {group_name} group")
                        
                    # Add to extracted data
                    extracted_data[group_name] = group_data
                    # print(f"Extracted data for group {group_name}: {group_data}")
                except json.JSONDecodeError as e:
                    print(f"Error parsing JSON response: {e}")
                    print(f"Raw response: {response.content}")
                    print(f"Cleaned response: {cleaned_response}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to parse response for group {group_name}"
                    )

            except Exception as e:
                print(f"Error processing group {group_name}: {e}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to process group {group_name}: {str(e)}"
                )

        return extracted_data

    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Field extraction failed: {str(e)}"
        )
        

def transcribe_and_extract(file_path: str, language: str, api_key: str):
    try:
        client = openai.Client(api_key=api_key)
        audio = AudioSegment.from_file(file_path)
        file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
        if file_size_mb <= 25.0:
            with open(file_path, "rb") as audio_file:
                transcript = client.audio.transcriptions.create(
                    file=audio_file,
                    model="whisper-1",
                    language=language,
                    response_format="text"
                )
        else:
            num_chunks = math.ceil(file_size_mb / 25.0)
            chunk_duration = len(audio) // num_chunks
            transcripts = []
            for i in range(num_chunks):
                start_time = i * chunk_duration
                end_time = (i + 1) * chunk_duration if i < num_chunks - 1 else len(audio)
                chunk = audio[start_time:end_time]
                chunk_path = f"temp_chunk_{i}.{file_path.split('.')[-1]}"
                chunk.export(chunk_path, format=file_path.split('.')[-1])
                try:
                    with open(chunk_path, "rb") as chunk_file:
                        chunk_transcript = client.audio.transcriptions.create(
                            file=chunk_file,
                            model="whisper-1",
                            language=language,
                            response_format="text"
                        )
                        transcripts.append(chunk_transcript)
                finally:
                    if os.path.exists(chunk_path):
                        os.remove(chunk_path)
            transcript = " ".join(transcripts)
        return transcript
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")
    finally:
        if os.path.exists(file_path):
             os.remove(file_path)