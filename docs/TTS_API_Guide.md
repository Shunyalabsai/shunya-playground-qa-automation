# Shunya TTS API - Comprehensive User Guide

**Base URL**: `https://tts.shunyalabs.ai`

**OpenAI-Compatible**: This API follows the OpenAI TTS API conventions. Authentication is via `Authorization: Bearer` header. The HTTP response returns raw audio bytes (not JSON).

---

## Table of Contents

1. [Authentication](#1-authentication)
2. [HTTP API](#2-http-api)
3. [WebSocket API](#3-websocket-api)
4. [Request Parameters](#4-request-parameters)
5. [Response Format](#5-response-format)
6. [Output Audio Formats](#6-output-audio-formats)
7. [Speakers](#7-speakers)
8. [Voice Cloning](#8-voice-cloning)
9. [Expression Tags](#9-expression-tags)
10. [Supported Languages](#10-supported-languages)
11. [Error Handling](#11-error-handling)
12. [Python Examples](#12-python-examples)
13. [Upcoming Features](#13-upcoming-features)

---

## 1. Authentication

All API requests require a valid API key passed in the `Authorization` header as a Bearer token:

```
Authorization: Bearer YOUR_API_KEY
```

Invalid or missing keys return HTTP 401 (HTTP) or WebSocket close code 1008.

---

## 2. HTTP API

### Endpoints

The API is available at three equivalent endpoints:

```
POST /v1/audio/speech    # OpenAI-compatible path
POST /tts                # Legacy path
POST /                   # Root path
```

Content-Type: `application/json`

### Minimal Example (curl)

```bash
curl -X POST https://tts.shunyalabs.ai/v1/audio/speech \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "zero-indic", "input": "Hello, how are you today?", "voice": "Varun"}' \
  --output output.mp3
```

### Minimal Example (Python - urllib)

```python
import json
import urllib.request

payload = json.dumps({
    "model": "zero-indic",
    "input": "Hello, how are you today?",
    "voice": "Varun",
}).encode()

req = urllib.request.Request(
    "https://tts.shunyalabs.ai/v1/audio/speech",
    data=payload,
    headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer YOUR_API_KEY",
    },
)
resp = urllib.request.urlopen(req, timeout=120)

# Response is raw audio bytes (MP3 by default)
with open("output.mp3", "wb") as f:
    f.write(resp.read())
```

### Using `requests` Library

```python
import requests

response = requests.post(
    "https://tts.shunyalabs.ai/v1/audio/speech",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "zero-indic",
        "input": "Hello, how are you today?",
        "voice": "Varun",
        "response_format": "wav",
        "speed": 1.0,
    },
    timeout=120,
)
response.raise_for_status()

# Response body is raw audio bytes
with open("output.wav", "wb") as f:
    f.write(response.content)
```

### Using OpenAI Python SDK

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_API_KEY",
    base_url="https://tts.shunyalabs.ai/v1",
)

response = client.audio.speech.create(
    model="zero-indic",
    input="Hello, how are you today?",
    voice="Varun",
    response_format="mp3",
)

response.stream_to_file("output.mp3")
```

### Health Check

```
GET /health
```

Response:
```json
{
    "status": "healthy",
    "triton_ready": true,
    "auth_ready": true
}
```

---

## 3. WebSocket API

### Endpoints

The WebSocket API is available at three equivalent endpoints:

```
wss://tts.shunyalabs.ai/ws/v1/audio/speech    # OpenAI-compatible path
wss://tts.shunyalabs.ai/ws/tts                # Legacy path
wss://tts.shunyalabs.ai/ws                     # Root path
```

Authentication is via the `Authorization` header during the WebSocket handshake:

```python
headers = {"Authorization": "Bearer YOUR_API_KEY"}
async with websockets.connect(uri, additional_headers=headers) as ws:
    ...
```

### Streaming Mode

In streaming mode, audio chunks are sent as they are generated, enabling real-time playback.

```python
import asyncio
import json
import wave
import websockets

async def tts_streaming():
    uri = "wss://tts.shunyalabs.ai/ws/v1/audio/speech"
    headers = {"Authorization": "Bearer YOUR_API_KEY"}

    async with websockets.connect(uri, additional_headers=headers) as ws:
        # Send request
        await ws.send(json.dumps({
            "model": "zero-indic",
            "input": "Hello, this is a streaming test.",
            "voice": "Varun",
            "response_format": "pcm",
        }))

        # Receive chunks
        audio_chunks = []
        while True:
            msg = await ws.recv()

            if isinstance(msg, bytes):
                # Binary frame = audio data
                audio_chunks.append(msg)
                # Play chunk here for real-time audio...

            else:
                # JSON frame = metadata
                data = json.loads(msg)

                if data["type"] == "chunk":
                    print(f"Chunk {data['chunk_index']}, "
                          f"format={data['format']}, "
                          f"sample_rate={data['sample_rate']}")

                elif data["type"] == "completion":
                    print(f"Done! {data['total_chunks']} chunks, "
                          f"{data['total_duration_seconds']}s")
                    break

                elif data["type"] == "error":
                    print(f"Error: {data['error']}")
                    break

        # Save concatenated audio
        all_audio = b"".join(audio_chunks)
        with wave.open("streaming_output.wav", "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(16000)
            wf.writeframes(all_audio)

asyncio.run(tts_streaming())
```

### WebSocket Message Flow

```
Client                          Server
  |                                |
  |--- JSON (request) ----------->|
  |                                |
  |<-- JSON (chunk metadata) -----|  \
  |<-- BINARY (audio chunk) ------|   } repeated per chunk
  |                                |  /
  |<-- JSON (completion) ---------|
  |                                |
```

---

## 4. Request Parameters

### Required

| Parameter | Type | Description |
|-----------|------|-------------|
| `model` | string | Model name. Must be `"zero-indic"`. |
| `input` | string | Text to synthesize (1-10,000 characters) |
| `voice` | string | Speaker voice name (see [Speakers](#7-speakers)). Optional when `reference_wav` is provided. |
| `language` | string | ISO 639 language code for text preprocessing (e.g. `"en"`, `"hi"`, `"ta"`). |

### Optional

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `response_format` | string | `"wav"` | Audio output format (see [Formats](#6-output-audio-formats)) |
| `speed` | float | 1.0 | Speaking speed (0.25 - 4.0) |
| `trim_silence` | bool | false | Trim leading/trailing silence |
| `reference_wav` | string | None | Base64-encoded reference audio for voice cloning (see [Voice Cloning](#8-voice-cloning)) |
| `reference_text` | string | "" | Transcript of reference audio. Improves cloning quality. Max 500 chars. |
| `word_timestamps` | bool | false | Return word-level timestamps (batch mode only) |
| `background_audio` | string | None | Background audio: preset name (`office`, `cafe`, `rain`, `street`) or base64-encoded WAV/MP3 |
| `background_volume` | float | 0.1 | Background audio volume (0.0 - 1.0) |
| `max_tokens` | int | 2048 | Maximum tokens for LLM generation (1 - 8192) |

### Full Example (all parameters)

```python
import requests

response = requests.post(
    "https://tts.shunyalabs.ai/v1/audio/speech",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "zero-indic",
        "input": "<Happy>Hello, this is a comprehensive example!",
        "voice": "Varun",
        "response_format": "mp3",
        "language": "en",
        "speed": 1.2,
        "trim_silence": True,
    },
    timeout=120,
)

with open("output.mp3", "wb") as f:
    f.write(response.content)
```

---

## 5. Response Format

### HTTP Response

The HTTP response body contains **raw audio bytes** in the requested format (default: MP3). The `Content-Type` header indicates the audio format:

| Format | Content-Type |
|--------|-------------|
| `mp3` | `audio/mpeg` |
| `wav` | `audio/wav` |
| `pcm` | `audio/pcm` |
| `ogg_opus` | `audio/ogg` |
| `flac` | `audio/flac` |
| `mulaw` | `audio/basic` |
| `alaw` | `audio/x-alaw` |

Simply write `response.content` to a file:

```python
response = requests.post(url, headers=headers, json=payload)
with open("output.mp3", "wb") as f:
    f.write(response.content)
```

### WebSocket Messages

**Chunk metadata** (JSON, followed by binary audio frame):
```json
{
    "type": "chunk",
    "request_id": "uuid",
    "chunk_index": 0,
    "is_final": false,
    "format": "pcm",
    "sample_rate": 16000
}
```

**Completion** (JSON):
```json
{
    "type": "completion",
    "request_id": "uuid",
    "status": "complete",
    "total_chunks": 3,
    "total_duration_seconds": 2.48,
    "format": "pcm",
    "sample_rate": 16000,
    "audio_data": "<base64, batch mode only>"
}
```

**Error** (JSON):
```json
{
    "type": "error",
    "request_id": "uuid",
    "error": "Error description"
}
```

---

## 6. Output Audio Formats

| Format | Content-Type | Sample Rate | Description |
|--------|-------------|-------------|-------------|
| `mp3` | audio/mpeg | 16,000 Hz | MP3 128 kbps (default) |
| `pcm` | audio/pcm | 16,000 Hz | Raw 16-bit signed PCM |
| `wav` | audio/wav | 16,000 Hz | WAV container with PCM data |
| `ogg_opus` | audio/ogg | 16,000 Hz | OGG Opus 64 kbps |
| `flac` | audio/flac | 16,000 Hz | FLAC lossless |
| `mulaw` | audio/basic | 8,000 Hz | 8-bit mu-law (telephony) |
| `alaw` | audio/x-alaw | 8,000 Hz | 8-bit A-law (telephony) |

**Note**: For `pcm` format, audio is raw bytes without a header. Wrap in a WAV container for playback:

```python
import wave

with wave.open("output.wav", "wb") as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)  # 16-bit = 2 bytes
    wf.setframerate(16000)
    wf.writeframes(pcm_bytes)
```

For `wav`, `mp3`, `ogg_opus`, `flac` formats, just write the bytes directly to a file.

---

## 7. Speakers

46 pre-built speakers across 23 languages, one male and one female per language.

| Language | Male | Female |
|----------|------|--------|
| Assamese | Bimal | Anjana |
| Bengali | Arjun | Priyanka |
| Bodo | Daimalu | Hasina |
| Dogri | Vishal | Neelam |
| English | Varun | Nisha |
| Gujarati | Rakesh | Pooja |
| Hindi | Rajesh | Sunita |
| Kannada | Kiran | Shreya |
| Kashmiri | Farooq | Habba |
| Konkani | Mohan | Sarita |
| Maithili | Suresh | Meera |
| Malayalam | Krishnan | Deepa |
| Manipuri | Tomba | Ibemhal |
| Marathi | Siddharth | Ananya |
| Nepali | Bikash | Sapana |
| Odia | Bijay | Sujata |
| Punjabi | Gurpreet | Simran |
| Sanskrit | Vedant | Gayatri |
| Santali | Chandu | Roshni |
| Sindhi | Amjad | Kavita |
| Tamil | Murugan | Thangam |
| Telugu | Vishnu | Lakshmi |
| Urdu | Salman | Fatima |

The `voice` parameter is **required**. The server uses the speaker name to generate voice-appropriate audio.

---

## 8. Voice Cloning

Clone any voice by providing a reference audio sample. Two modes are available depending on whether you include a transcript of the reference audio.

### Mode 1: Audio + Transcript (recommended)

Higher quality cloning — the model uses both speaker identity and speaking style from the reference audio. The transcript helps the model understand the alignment between the reference speech and the text to synthesize.

```python
response = requests.post(
    "https://tts.shunyalabs.ai/v1/audio/speech",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "zero-indic",
        "input": "Text to synthesize in the cloned voice.",
        "voice": "Varun",
        "reference_wav": "<base64-encoded-audio>",
        "reference_text": "Exact transcript of the reference audio.",
    },
    timeout=120,
)
with open("cloned_output.wav", "wb") as f:
    f.write(response.content)
```

### Mode 2: Audio Only

Speaker identity only — simpler but slightly lower quality. No transcript needed.

```python
response = requests.post(
    "https://tts.shunyalabs.ai/v1/audio/speech",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "zero-indic",
        "input": "Text to synthesize in the cloned voice.",
        "voice": "Varun",
        "reference_wav": "<base64-encoded-audio>",
    },
    timeout=120,
)
```

### Reference Audio Requirements

| Requirement | Details |
|-------------|---------|
| **Format** | WAV only (auto-converted to 16kHz mono if different sample rate or stereo) |
| **Duration** | 1–6 seconds recommended. Audio shorter than 1 second is rejected. Audio longer than 6 seconds is accepted but only the first 6 seconds are used for speaker embedding. |
| **Sample rate** | 16kHz mono recommended. Other sample rates (≥ 8kHz) are auto-resampled. |
| **Content** | Clear speech with minimal background noise. Avoid music, noise, or multiple speakers. |
| **Size** | Maximum 10MB (base64-encoded) |
| **Encoding** | Base64-encoded string in the `reference_wav` field |

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reference_wav` | string | Yes (for cloning) | Base64-encoded WAV reference audio file. Max 10MB. |
| `reference_text` | string | No | Transcript of the reference audio. Improves cloning quality by providing semantic context. Max 500 characters. |
| `voice` | string | No (when cloning) | Not required when `reference_wav` is provided. Speaker identity comes from the reference audio. |

### Tips for Best Results

- Use **3–6 seconds** of clean, clear speech as your reference audio.
- Provide an **accurate transcript** (`reference_text`) that matches the reference audio exactly — this significantly improves voice similarity.
- The `voice` parameter is optional when `reference_wav` is provided — the cloned voice identity comes from the reference audio.
- Avoid reference audio with background music, noise, echo, or multiple speakers.
- For consistent results across multiple requests, use the same reference audio.

### Error Responses

| Error | Status | Description |
|-------|--------|-------------|
| Missing voice and reference_wav | 422 | Either `voice` or `reference_wav` must be provided |
| Reference audio too short | 400 | Audio must be at least 1 second long |
| Invalid base64 encoding | 400 | `reference_wav` contains invalid base64 data |
| Not WAV format | 400 | `reference_wav` must be in WAV format |
| reference_wav too large | 422 | Maximum 10MB (base64-encoded) |
| Sample rate too low | 400 | Minimum 8kHz sample rate required |
| Silent audio | 400 | Reference audio appears to be silent |
| reference_text without reference_wav | 422 | Cannot provide transcript without reference audio |
| reference_text too long | 422 | Maximum 500 characters |

---

## 9. Expression Tags

Prefix your text with expression tags to control the speaking style:

| Tag | Style |
|-----|-------|
| `<Happy>` | Happy, cheerful tone |
| `<Sad>` | Sad, somber tone |
| `<Angry>` | Angry, intense tone |
| `<Fearful>` | Fearful, anxious tone |
| `<Surprised>` | Surprised, excited tone |
| `<Disgust>` | Disgusted tone |
| `<News>` | News anchor style |
| `<Conversational>` | Casual, conversational tone |
| `<Narrative>` | Storytelling, narrative style |
| `<Enthusiastic>` | Enthusiastic, energetic tone |
| `<Neutral>` | Neutral, default tone |

### Usage

Expression tags go at the start of `input`:

```python
# Happy expression with a specific speaker
{
    "model": "zero-indic",
    "input": "<Happy>Today is a wonderful day!",
    "voice": "Varun"
}

# News anchor style
{
    "model": "zero-indic",
    "input": "<News>Breaking news from the capital today.",
    "voice": "Nisha"
}
```

---

## 10. Supported Languages

The `language` parameter controls text preprocessing (normalization, number expansion, etc.). The model itself is multilingual and handles Devanagari, Kannada, Tamil, and other scripts natively.

### Indic Languages

| Code | Language | Script |
|------|----------|--------|
| `hi` | Hindi | Devanagari |
| `bn` | Bengali | Bengali |
| `ta` | Tamil | Tamil |
| `te` | Telugu | Telugu |
| `kn` | Kannada | Kannada |
| `ml` | Malayalam | Malayalam |
| `mr` | Marathi | Devanagari |
| `gu` | Gujarati | Gujarati |
| `pa` | Punjabi | Gurmukhi |
| `or` | Odia | Odia |
| `as` | Assamese | Bengali |
| `ur` | Urdu | Arabic |
| `sa` | Sanskrit | Devanagari |
| `ne` | Nepali | Devanagari |
| `sd` | Sindhi | Devanagari |
| `ks` | Kashmiri | Arabic |
| `kok` | Konkani | Devanagari |
| `doi` | Dogri | Devanagari |
| `mai` | Maithili | Devanagari |
| `bho` | Bhojpuri | Devanagari |
| `mni` | Manipuri | Meitei Mayek |
| `sat` | Santali | Ol Chiki |
| `brx` | Bodo | Devanagari |
| `hne` | Chhattisgarhi | Devanagari |
| `mag` | Magahi | Devanagari |

### Mixed-Language Text

The model supports mixed-script text natively. No special configuration needed:

```python
{
    "model": "zero-indic",
    "input": "नमस्ते! My name is Varun और मैं आपसे बात कर रहा हूँ।",
    "voice": "Varun"
}
```

---

## 11. Error Handling

### HTTP Error Codes

| Code | Meaning |
|------|---------|
| 400 | Invalid request (missing/malformed fields) |
| 401 | Invalid or missing API key |
| 500 | Internal server error |
| 503 | Backend unavailable (Triton or Redis down) |
| 504 | Request timeout |

### Error Response Format

```json
{"detail": "Invalid API key"}
{"detail": "Missing API key. Use Authorization: Bearer <key> header."}
```

### Example Error Handling

```python
import requests

try:
    resp = requests.post(
        "https://tts.shunyalabs.ai/v1/audio/speech",
        headers={"Authorization": "Bearer YOUR_API_KEY"},
        json={
            "model": "zero-indic",
            "input": "Hello",
            "voice": "Varun",
        },
        timeout=120,
    )
    resp.raise_for_status()
    with open("output.mp3", "wb") as f:
        f.write(resp.content)
except requests.exceptions.HTTPError as e:
    print(f"HTTP {e.response.status_code}: {e.response.json().get('detail')}")
except requests.exceptions.Timeout:
    print("Request timed out")
except Exception as e:
    print(f"Error: {e}")
```

### WebSocket Error Handling

```python
headers = {"Authorization": "Bearer YOUR_API_KEY"}

async with websockets.connect(
    "wss://tts.shunyalabs.ai/ws/v1/audio/speech",
    additional_headers=headers,
) as ws:
    await ws.send(json.dumps(request))

    while True:
        msg = await ws.recv()
        if isinstance(msg, str):
            data = json.loads(msg)
            if data["type"] == "error":
                print(f"Server error: {data['error']}")
                break
```

---

## 12. Python Examples

### Simple TTS (HTTP)

```python
import requests

resp = requests.post(
    "https://tts.shunyalabs.ai/v1/audio/speech",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "zero-indic",
        "input": "Hello world!",
        "voice": "Varun",
    },
    timeout=120,
)

with open("hello.mp3", "wb") as f:
    f.write(resp.content)
```

### Hindi + English Mixed Text

```python
resp = requests.post(
    "https://tts.shunyalabs.ai/v1/audio/speech",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "zero-indic",
        "input": "नमस्ते! My name is Rajesh और मैं हिंदी और English दोनों बोल सकता हूँ।",
        "voice": "Rajesh",
        "response_format": "wav",
    },
    timeout=120,
)

with open("mixed.wav", "wb") as f:
    f.write(resp.content)
```

### Expressive Speech

```python
resp = requests.post(
    "https://tts.shunyalabs.ai/v1/audio/speech",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "zero-indic",
        "input": "<Happy>Today is an absolutely wonderful day! I'm so excited!",
        "voice": "Nisha",
    },
    timeout=120,
)

with open("happy.mp3", "wb") as f:
    f.write(resp.content)
```

### MP3 Output with Speed Control

```python
resp = requests.post(
    "https://tts.shunyalabs.ai/v1/audio/speech",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "zero-indic",
        "input": "This is faster speech in MP3 format.",
        "voice": "Varun",
        "response_format": "mp3",
        "speed": 1.3,
    },
    timeout=120,
)

with open("fast_speech.mp3", "wb") as f:
    f.write(resp.content)
```

### Telephony Format (mu-law 8kHz)

```python
resp = requests.post(
    "https://tts.shunyalabs.ai/v1/audio/speech",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "zero-indic",
        "input": "This is telephony-grade audio.",
        "voice": "Varun",
        "response_format": "mulaw",
    },
    timeout=120,
)
# Returns 8kHz 8-bit mu-law audio
```

### Real-Time Streaming Playback (WebSocket)

```python
import asyncio
import json
import pyaudio
import websockets

async def realtime_tts():
    p = pyaudio.PyAudio()
    stream = p.open(format=pyaudio.paInt16, channels=1, rate=16000, output=True)

    headers = {"Authorization": "Bearer YOUR_API_KEY"}

    async with websockets.connect(
        "wss://tts.shunyalabs.ai/ws/v1/audio/speech",
        additional_headers=headers,
    ) as ws:
        await ws.send(json.dumps({
            "model": "zero-indic",
            "input": "This plays in real-time as chunks arrive.",
            "voice": "Varun",
        }))

        while True:
            msg = await ws.recv()
            if isinstance(msg, bytes):
                stream.write(msg)  # Play immediately
            else:
                data = json.loads(msg)
                if data["type"] in ("completion", "error"):
                    break

    stream.close()
    p.terminate()

asyncio.run(realtime_tts())
```

### Multilingual: Hindi + Kannada

```python
resp = requests.post(
    "https://tts.shunyalabs.ai/v1/audio/speech",
    headers={"Authorization": "Bearer YOUR_API_KEY"},
    json={
        "model": "zero-indic",
        "input": "नमस्ते! ನನ್ನ ಹೆಸರು Kiran. मैं हिंदी और ಕನ್ನಡ बोल सकता हूँ।",
        "voice": "Kiran",
    },
    timeout=120,
)

with open("multilingual.mp3", "wb") as f:
    f.write(resp.content)
```

---

## 13. Upcoming Features

The following features are planned for future releases:

- **Background Audio** - Mix ambient background audio (presets: office, cafe, rain, street) or custom audio with generated speech.
- **Volume Normalization** - Peak normalization and loudness normalization (ITU-R BS.1770).
- **Word Timestamps** - Word-level timing information for subtitle generation.

---

## Rate Limits & Best Practices

- **Text length**: Keep under 500 characters per request for best quality. For longer text, split into sentences and make multiple requests.
- **Timeouts**: Set HTTP timeout to at least 120 seconds for long text.
- **Streaming**: Use WebSocket streaming mode for real-time applications to get first audio chunk in ~1-2 seconds.
- **Format selection**: Use `pcm` or `wav` for lowest latency; use `mp3` or `ogg_opus` for smaller file sizes. Default is `mp3`.
- **Speaker consistency**: Always specify `voice` for consistent voice across requests.
- **OpenAI SDK**: You can use the official OpenAI Python SDK by pointing `base_url` to `https://tts.shunyalabs.ai/v1`.
