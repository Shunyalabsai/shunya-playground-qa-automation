# Shunya ASR — Comprehensive User Guide

> **Model:** Qwen3-ASR 1.7B (`vak-v3-1.7B`)
> **Inference:** NVIDIA Triton Inference Server + vLLM
> **Gateway:** FastAPI (HTTP + WebSocket)
> **Base URL:** `https://asr.shunyalabs.ai`

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Quick Start](#2-quick-start)
3. [Architecture](#3-architecture)
4. [Authentication](#4-authentication)
5. [Language Support](#5-language-support)
6. [API Reference — HTTP](#6-api-reference--http)
   - [Health Check](#61-get-health)
   - [List Languages](#62-get-languages)
   - [Batch Transcription](#63-post-v1transcriptions)
7. [API Reference — Speakers](#7-api-reference--speakers)
   - [Register Speaker](#71-post-v1speakersregister)
   - [Identify Speaker](#72-post-v1speakersidentify)
   - [List Speakers](#73-get-v1speakerslist)
   - [Delete Speaker](#74-delete-v1speakersdelete)
   - [Diarize Audio](#75-post-v1speakersdiarize)
8. [WebSocket Streaming API](#8-websocket-streaming-api)
   - [Protocol Overview](#81-protocol-overview)
   - [Binary Mode](#82-binary-mode)
   - [JSON Frame Mode](#83-json-frame-mode)
   - [Message Reference](#84-message-reference)
   - [Session Lifecycle](#85-session-lifecycle)
9. [Audio Requirements](#9-audio-requirements)
10. [Configuration Reference](#10-configuration-reference)
11. [Code Examples](#11-code-examples)
12. [Error Reference](#12-error-reference)
13. [Performance & Limits](#13-performance--limits)
14. [Internal Architecture (Technical Deep-Dive)](#14-internal-architecture-technical-deep-dive)

---

## 1. System Overview

The ASR system provides real-time and batch speech-to-text transcription for **55 Indian and English languages**. It is composed of two services:

| Service | Port | Technology | Role |
|---------|------|-----------|------|
| **ASR Gateway** | `8080` | FastAPI + Uvicorn | HTTP/WebSocket API, audio processing, NLP |
| **Triton Inference Server** | `8050–8052` | NVIDIA Triton + vLLM | Model serving, inference |

Two transcription modes are available:

| Mode | Latency | Use Case |
|------|---------|---------|
| **Batch** (`POST /v1/transcriptions`) | Seconds | Pre-recorded files, uploaded audio |
| **Streaming** (`WebSocket /ws`) | Sub-second partials | Live microphone, real-time feeds |

---

## 2. Quick Start

Transcribe audio in 5 lines using the OpenAI Python SDK:

```bash
pip install openai
```

```python
from openai import OpenAI

client = OpenAI(
    api_key="your_api_key",
    base_url="https://asr.shunyalabs.ai/v1",
)

with open("audio.wav", "rb") as f:
    result = client.audio.transcriptions.create(
        model="zero-indic",
        file=f,
        language="Hindi",           # optional — omit for auto-detection
        response_format="json",     # or "verbose_json" for segments + metadata
    )

print(result.text)
```

**Or with cURL:**

```bash
curl -X POST "https://asr.shunyalabs.ai/v1/audio/transcriptions" \
  -H "Authorization: Bearer your_api_key" \
  -F "file=@audio.wav" \
  -F "model=zero-indic" \
  -F "language=Hindi"
```

**Response (`json` format):**
```json
{"text": "यह मेरी आवाज़ है मैं आपसे बात करना चाहता हूँ"}
```

**Response (`verbose_json` format):**
```json
{
  "success": true,
  "request_id": "eb61436a-3a9a-4087-9efc-c45c7a97350e",
  "text": "यह मेरी आवाज़ है मैं आपसे बात करना चाहता हूँ",
  "segments": [
    {"start": 0.0, "end": 12.3, "text": "यह मेरी आवाज़ है मैं आपसे बात करना चाहता हूँ"}
  ],
  "detected_language": "Hindi",
  "audio_duration": 12.288,
  "inference_time_ms": 413.9
}
```

> The OpenAI-compatible endpoint is `POST /v1/audio/transcriptions`. The `model` parameter is required and must be `"zero-indic"`. All standard OpenAI SDK parameters (`language`, `response_format`, `temperature`) are accepted.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Client Applications                       │
└────────────────┬─────────────────────────────┬───────────────────┘
                 │ HTTP/REST                    │ WebSocket
                 ▼                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                      ASR Gateway  :8080                          │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  HTTP Routes    │  │  WebSocket      │  │  NLP Service    │  │
│  │  /v1/transcribe │  │  Handler        │  │  (Groq API)     │  │
│  │  /v1/speech*    │  │  ClientSession  │  │                 │  │
│  └────────┬────────┘  └────────┬────────┘  └─────────────────┘  │
│           │                   │                                  │
│  ┌────────▼───────────────────▼────────┐                         │
│  │     Audio Processing Pipeline       │                         │
│  │  load → resample(16kHz) →           │                         │
│  │  VAD → chunk → send to Triton       │                         │
│  └────────────────┬────────────────────┘                         │
│                   │  gRPC pool (8 clients)                       │
└───────────────────┼──────────────────────────────────────────────┘
                    │
                    ▼ gRPC :8051
┌──────────────────────────────────────────────────────────────────┐
│                  Triton Inference Server  :8050-8052              │
│                                                                  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  qwen3_asr_bls   │  │ qwen3_asr_stream │  │ qwen3_decoder │  │
│  │  (Batch BLS)     │  │ (Streaming, 300  │  │ (vLLM engine) │  │
│  │                  │  │  concurrent seqs)│  │               │  │
│  └──────────────────┘  └──────────────────┘  └───────┬───────┘  │
│                                                       │          │
│                                           ┌───────────▼───────┐  │
│                                           │  Qwen3-ASR 1.7B   │  │
│                                           │  (vak-v3-1.7B)    │  │
│                                           │  GPU: 30% memory  │  │
│                                           └───────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Triton Models

| Model | Backend | Policy | Max Concurrent | Role |
|-------|---------|--------|---------------|------|
| `qwen3_asr_bls` | Python | Decoupled | — | Batch orchestrator; builds prompts, calls decoder |
| `qwen3_asr_streaming` | Python | Decoupled + Sequence Batching | 300 sequences | Stateful streaming; accumulates audio per session |
| `qwen3_decoder` | Python + vLLM | Decoupled | vLLM-managed | Core inference; audio encoder + text decoder |

---

## 4. Authentication

Authentication is **optional** and controlled by the `AUTH_ENABLED` environment variable.

### When auth is disabled (default)
All endpoints are open. No `api-key` header is required.

### When auth is enabled — HTTP
Pass the API key in the `api-key` header:

```http
POST /v1/transcriptions
api-key: your-api-key-here
```

### When auth is enabled — WebSocket
Include `api_key` in the initial JSON config message:

```json
{
  "language": "Hindi",
  "api_key": "your-api-key-here"
}
```

### Error responses

| HTTP Code | WS Close Code | Reason |
|-----------|--------------|--------|
| `401` | `4001` | Invalid or missing API key |
| — | `4002` | Insufficient account balance |
| `503` | — | Server at capacity |

---

## 5. Language Support

The system supports **55 languages** — 45 direct (natively transcribed) and 10 proxied (mapped to the closest supported language).

### Direct Languages (45)

| Family | Languages |
|--------|-----------|
| **Indo-Aryan** | Hindi, Bengali, Marathi, Gujarati, Punjabi, Odia, Assamese, Maithili, Bhojpuri, Rajasthani, Magahi, Chhattisgarhi, Urdu, Kashmiri, Nepali, Sindhi, Dogri, Konkani, Sanskrit, Marwadi, Awadhi, Bundeli, Braj, Haryanvi, Garhwali, Kumaoni, Kangri, Pahari Mahasui, Nimadi, Bhili, Harouti, Bagri, Wagdi, Surgujia |
| **Dravidian** | Telugu, Tamil, Kannada, Malayalam, Tulu, Kurukh |
| **Sino-Tibetan** | Manipuri, Bodo, Garo |
| **Austroasiatic** | Santali |
| **Indo-European** | English |

### Proxied Languages (10)

These are automatically mapped to the closest supported language:

| Language | Mapped To |
|----------|-----------|
| Ahirani | Marathi |
| Bagheli | Hindi |
| Banjari | Rajasthani |
| Kachchhi | Gujarati |
| Khortha | Magahi |
| Kodava | Kannada |
| Lambadi | Hindi |
| Meitei | Bengali |
| Mewari | Rajasthani |
| Sambalpuri | Odia |

### Using languages in API calls

Language names are **case-insensitive** and must match the names in the table above. Pass `"auto"` to enable automatic language detection.

```
language_code=Hindi
language_code=auto        # auto-detect
language_code=pahari mahasui   # case-insensitive, spaces OK
```

To retrieve the full language list at runtime:

```bash
curl https://asr.shunyalabs.ai/languages
```

---

## 6. API Reference — HTTP

### 6.1 `GET /health`

Returns service status. Useful for readiness/liveness probes.

**Response**

```json
{
  "status": "ok",
  "services": {
    "triton": "ready",
    "qwen3_asr_streaming": "ready",
    "qwen3_asr_bls": "ready",
    "auth": "connected",
    "s3": "configured",
    "database": "connected"
  }
}
```

`status` is `"ok"` when Triton is ready, `"degraded"` otherwise. Optional services appear only when enabled.

---

### 6.2 `GET /languages`

Returns all supported languages grouped by type and family.

**Response**

```json
{
  "direct_languages": ["Assamese", "Awadhi", ...],
  "proxied_languages": {
    "Ahirani": "Marathi",
    "Bagheli": "Hindi",
    ...
  },
  "families": {
    "Indo-Aryan": ["Hindi", "Bengali", ...],
    "Dravidian": ["Telugu", "Tamil", ...],
    ...
  },
  "total": 55
}
```

---

### 6.3 `POST /v1/transcriptions`

Batch transcription for pre-recorded audio files. Accepts `multipart/form-data`.

**Request — Form Fields**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `file` | file | — | Audio file upload (mutually exclusive with `url`) |
| `url` | string | — | HTTP URL of a remote audio file |
| `language_code` | string | `"auto"` | Language name or `"auto"` for detection |
| `output_script` | string | `"auto"` | Target script for transliteration (e.g., `"Devanagari"`, `"Latin"`) |
| `enable_diarization` | bool | `false` | Identify speakers in audio |
| `enable_transliteration` | bool | `false` | Transliterate text to another script |
| `project` | string | — | Optional project tag for speaker ID |
| `api-key` | header | — | API key (required only when `AUTH_ENABLED=true`) |

**Response**

```json
{
  "success": true,
  "request_id": "uuid-v4",
  "text": "Full concatenated transcript",
  "segments": [
    {
      "start": 0.0,
      "end": 12.4,
      "text": "Segment text here",
      "speaker": "SPEAKER_00",
      "emotion": "neutral"
    }
  ],
  "detected_language": "Hindi",
  "speakers": ["SPEAKER_00", "SPEAKER_01"],
  "audio_duration": 45.2,
  "inference_time_ms": 3821.5,
  "transliteration": "सेवा बहुत खराब थी।"
}
```

**Notes**

- Audio is automatically resampled to **16 kHz mono** before processing.
- The VAD automatically splits audio at silence boundaries (max 15s chunks, 2s overlap).
- All chunks are transcribed **concurrently** (up to `batch_max_workers=4` threads).

---

## 7. API Reference — Speakers

Speaker endpoints require the speaker ID service to be enabled (`SPEAKER_ID_ENABLED=true` / `DIARIZATION_ENABLED=true`).

All endpoints use `multipart/form-data` where a file is required.

---

### 7.1 `POST /v1/speakers/register`

Register a speaker's voice profile.

| Field | Type | Description |
|-------|------|-------------|
| `name` | form string | Speaker name |
| `file` | upload | Audio file with speaker's voice |
| `project` | form string | Optional project namespace |

**Response**

```json
{ "success": true, "speaker": "Rahul", "message": "Speaker registered." }
```

---

### 7.2 `POST /v1/speakers/identify`

Identify which registered speaker is in an audio file.

| Field | Type | Description |
|-------|------|-------------|
| `file` | upload | Audio file |
| `project` | form string | Optional project namespace |

**Response**

```json
{ "speaker": "Rahul", "confidence": 0.94 }
```

---

### 7.3 `GET /v1/speakers/list`

List all registered speakers.

| Query Param | Type | Description |
|-------------|------|-------------|
| `project` | string | Filter by project |

**Response**

```json
{
  "speakers": [
    { "name": "Rahul", "project": "call-center", "registered_at": "2025-01-15T10:00:00" }
  ]
}
```

---

### 7.4 `DELETE /v1/speakers/delete`

Delete a speaker profile.

| Field | Type | Description |
|-------|------|-------------|
| `name` | form string | Speaker name |
| `project` | form string | Optional project namespace |

**Response**

```json
{ "success": true }
```

---

### 7.5 `POST /v1/speakers/diarize`

Identify speaker segments in audio (who spoke when).

| Field | Type | Description |
|-------|------|-------------|
| `file` | upload | Audio file |
| `num_speakers` | form int | Optional hint for number of speakers |
| `project` | form string | Optional project namespace |

**Response**

```json
{
  "segments": [
    { "start": 0.0, "end": 5.2, "speaker": "SPEAKER_00", "speaker_confidence": 0.92 },
    { "start": 5.2, "end": 11.8, "speaker": "SPEAKER_01", "speaker_confidence": 0.87 }
  ],
  "total_segments": 2,
  "unique_speakers": ["SPEAKER_00", "SPEAKER_01"]
}
```

---

## 8. WebSocket Streaming API

The WebSocket endpoint enables real-time speech-to-text with sub-second latency.

**Endpoint:** `wss://asr.shunyalabs.ai/ws`

### 8.1 Protocol Overview

```
Client                              Server
  |                                    |
  |──── WebSocket Connect ────────────►|
  |◄─── Connection Accepted ───────────|
  |                                    |
  |──── JSON Config (first message) ──►|
  |◄─── {"type":"ready","session_id":…}|
  |                                    |
  |──── Audio Chunk 1 (bytes) ────────►|
  |◄─── {"type":"partial","text":…} ──|
  |──── Audio Chunk 2 (bytes) ────────►|
  |◄─── {"type":"partial","text":…} ──|
  |                                    |  (silence detected)
  |◄─── {"type":"final_segment",…} ───|
  |──── Audio Chunk N (bytes) ────────►|
  |◄─── {"type":"partial","text":…} ──|
  |                                    |
  |──── "END" (text) ─────────────────►|
  |◄─── {"type":"final",…} ───────────|
  |◄─── {"type":"done",…} ────────────|
  |                                    |
  |──── WebSocket Close ──────────────►|
```

---

### 8.2 Binary Mode

**Step 1 — Send JSON config as the first text message:**

```json
{
  "language": "Hindi",
  "context": "customer support call",
  "sample_rate": 16000,
  "chunk_size_sec": 1.0,
  "silence_threshold_sec": 0.8,
  "api_key": "optional-key"
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `language` | string | auto | Language name (`null` for auto-detect) |
| `context` | string | — | Hint to improve accuracy (domain, topic) |
| `sample_rate` | int | `16000` | PCM sample rate of audio chunks you will send |
| `chunk_size_sec` | float | `1.0` | How often the model re-transcribes (seconds) |
| `silence_threshold_sec` | float | `0.8` | Silence duration to finalize a segment |
| `api_key` | string | — | Required only when auth is enabled |

**Step 2 — Receive `ready` message:**

```json
{ "type": "ready", "session_id": "550e8400-e29b-41d4-a716-446655440000" }
```

**Step 3 — Stream binary audio chunks:**

Send raw PCM float32 bytes continuously. Each chunk should match the declared `sample_rate`. The server auto-resamples to 16 kHz if needed.

```python
# Python example
audio_chunk = np.zeros(16000, dtype=np.float32)  # 1 second of audio
ws.send(audio_chunk.tobytes())
```

**Step 4 — End the stream:**

Send the text string `"END"` or a JSON `{"type": "end"}` to finalize.

---

### 8.3 JSON Frame Mode

Use JSON mode when binary WebSocket is not available (e.g., browser restrictions).

**Step 1 — Send init config:**

```json
{
  "type": "init",
  "language": "Tamil",
  "sample_rate": 16000
}
```

**Step 2 — Receive `ready`.**

**Step 3 — Send audio as base64 frames:**

```json
{
  "type": "frame",
  "audio": "<base64-encoded float32 PCM>",
  "sr": 16000,
  "dtype": "float32",
  "seq": 0
}
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Must be `"frame"` |
| `audio` | string | Base64-encoded raw PCM data |
| `sr` | int | Sample rate of this frame |
| `dtype` | string | `"float32"` (default) or `"int16"` |
| `seq` | int | Frame sequence number (optional, for ordering) |

**Step 4 — End the stream:**

```json
{ "type": "end" }
```

---

### 8.4 Message Reference

#### Server → Client Messages

**`ready`** — Session started successfully:
```json
{ "type": "ready", "session_id": "uuid" }
```

**`partial`** — Interim transcription update (text may change):
```json
{
  "type": "partial",
  "text": "नमस्ते मेरा नाम",
  "language": "Hindi",
  "segment_id": 0,
  "audio_duration_sec": 2.048,
  "latency_ms": 312.5
}
```

**`final_segment`** — A segment finalized due to silence:
```json
{
  "type": "final_segment",
  "text": "नमस्ते मेरा नाम राहुल है।",
  "language": "Hindi",
  "segment_id": 0,
  "silence_duration_ms": 850.0,
  "audio_duration_sec": 5.12
}
```

**`final`** — Last segment, emitted when client sends END:
```json
{
  "type": "final",
  "text": "मुझे मदद चाहिए।",
  "language": "Hindi",
  "segment_id": 1,
  "audio_duration_sec": 35.84,
  "inference_time_ms": 28500.0,
  "connection_duration_sec": 42.1
}
```

**`done`** — Session complete summary:
```json
{
  "type": "done",
  "total_segments": 2,
  "total_audio_duration_sec": 35.84,
  "connection_duration_sec": 42.1
}
```

**`error`** — Error occurred:
```json
{
  "type": "error",
  "message": "Inactivity timeout",
  "code": "TIMEOUT"
}
```

---

### 8.5 Session Lifecycle

| Event | Behavior |
|-------|---------|
| No audio for **300s** (default) | Session closed with `TIMEOUT` error |
| Session open for **3600s** (1 hour) | Session closed with `TIMEOUT` error |
| Audio buffer exceeds **120s** without segment flush | Force-finalize current segment |
| Silence ≥ `silence_threshold_sec` | Finalize current segment, start fresh |
| Server at 200 concurrent sessions | New connection rejected with `CAPACITY_FULL` |

**Segment guards** — A segment is only finalized when:
1. It has received at least **2 revision cycles** (`min_segment_revisions=2`)
2. It contains at least **2 characters** (`min_segment_chars=2`)
3. It is not too similar to a recent segment (similarity < 80%)

---

## 9. Audio Requirements

| Property | Requirement |
|----------|-------------|
| **Format** | WAV, MP3, FLAC, OGG, M4A, MP4, and most formats supported by `librosa`/`ffmpeg` |
| **Sample Rate** | Any — automatically resampled to **16 kHz** |
| **Channels** | Any — automatically converted to **mono** |
| **Bit Depth** | 16-bit or 32-bit PCM |
| **Maximum Duration** | No hard limit (chunked automatically) |
| **WebSocket PCM dtype** | `float32` (default) or `int16` |
| **WebSocket max message size** | 16 MB per message |

---

## 10. Configuration Reference

The gateway is configured via **environment variables**. All variables are case-insensitive.

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8080` | HTTP/WebSocket port |
| `LOG_LEVEL` | `INFO` | Logging verbosity |
| `TRITON_GRPC_URL` | `localhost:8051` | Triton gRPC endpoint |
| `TRITON_STREAMING_MODEL` | `qwen3_asr_streaming` | Streaming model name |
| `TRITON_BLS_MODEL` | `qwen3_asr_bls` | Batch BLS model name |
| `GRPC_POOL_SIZE` | `8` | Number of gRPC client connections |

### Batch Transcription

| Variable | Default | Description |
|----------|---------|-------------|
| `BATCH_CHUNK_SIZE_SEC` | `30.0` | Fixed chunk size in seconds |
| `VAD_CHUNK_SIZE_SEC` | `15.0` | Max VAD chunk duration |
| `VAD_OVERLAP_SEC` | `2.0` | Overlap between VAD chunks |
| `BATCH_MAX_WORKERS` | `4` | Parallel chunk transcription threads |

### WebSocket / Streaming

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_CONCURRENT_SESSIONS` | `200` | Max simultaneous WebSocket connections |
| `DEFAULT_CHUNK_SIZE_SEC` | `1.0` | How often model re-transcribes |
| `WS_INACTIVITY_TIMEOUT_SEC` | `300.0` | Close session after N seconds without audio |
| `MAX_CONNECTION_DURATION_SEC` | `3600.0` | Max session length (1 hour) |
| `SILENCE_THRESHOLD_SEC` | `0.8` | Silence to trigger segment finalization |
| `MIN_SEGMENT_REVISIONS` | `2` | Min revision cycles before finalizing |
| `MIN_SEGMENT_CHARS` | `2` | Min chars before finalizing |
| `AUDIO_BUFFER_CAP_SEC` | `120.0` | Force-finalize after this buffer duration |
| `USE_VAD` | `true` | Enable VAD for silence detection |
| `VAD_THRESHOLD` | `0.5` | VAD speech probability threshold |

### NLP Service

| Variable | Default | Description |
|----------|---------|-------------|
| `NLP_ENABLED` | `true` | Enable LLM post-processing |
| `LLM_API_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible endpoint |
| `LLM_API_KEY` | `""` | API key for LLM service |
| `LLM_MODEL` | `llama-3.1-70b-versatile` | Model to use for NLP |

### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_ENABLED` | `false` | Enable API key authentication |
| `WS_API_KEY` | `""` | Static API key fallback |
| `REDIS_HOST` | `localhost` | Redis host for key validation |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | — | Redis password |

### Storage & Tracking

| Variable | Default | Description |
|----------|---------|-------------|
| `ARCHIVE_ENABLED` | `false` | Enable S3 result archival |
| `S3_BUCKET` | `""` | S3 bucket name |
| `S3_REGION` | `us-east-1` | AWS region |
| `S3_PREFIX` | `results` | S3 key prefix |
| `USAGE_TRACKING_ENABLED` | `false` | Track usage to Redis stream |
| `REDIS_USAGE_STREAM` | `api_usage_stream` | Redis stream name |
| `MONGO_URI` | `""` | MongoDB connection string |
| `RDS_HOST` | `""` | PostgreSQL host |
| `REQUEST_LOGS_ENABLED` | `false` | Write request logs to disk |
| `REQUEST_LOG_DIR` | `/tmp/asr-request-logs` | Log directory |

### Speaker Services

| Variable | Default | Description |
|----------|---------|-------------|
| `DIARIZATION_ENABLED` | `false` | Enable pyannote diarization |
| `DIAR_MODEL_ID` | `pyannote/speaker-diarization-3.1` | Diarization model |
| `EMOTION_MODEL_NAME` | `superb/wav2vec2-base-superb-er` | Emotion model |
| `SPEAKER_ID_ENABLED` | `false` | Enable speaker identification |

---

## 11. Code Examples

### Batch Transcription — Python

```python
import requests

with open("audio.wav", "rb") as f:
    response = requests.post(
        "https://asr.shunyalabs.ai/v1/transcriptions",
        files={"file": ("audio.wav", f, "audio/wav")},
        data={
            "language_code": "Hindi",
        },
        headers={"api-key": "your-key"},  # omit if auth disabled
    )

result = response.json()
print(result["text"])
print(result["detected_language"])
for seg in result["segments"]:
    print(f"[{seg['start']:.2f}s → {seg['end']:.2f}s] {seg['text']}")
```

### Batch Transcription — cURL

```bash
curl -X POST https://asr.shunyalabs.ai/v1/transcriptions \
  -F "file=@audio.wav" \
  -F "language_code=Tamil"
```

### Transcription from URL

```bash
curl -X POST https://asr.shunyalabs.ai/v1/transcriptions \
  -F "url=https://example.com/recording.mp3" \
  -F "language_code=auto"
```

### WebSocket Streaming — Python

```python
import asyncio
import json
import numpy as np
import websockets

async def stream_audio():
    uri = "wss://asr.shunyalabs.ai/ws"
    async with websockets.connect(uri) as ws:
        # Step 1: Send config
        await ws.send(json.dumps({
            "language": "Hindi",
            "context": "customer support",
            "sample_rate": 16000,
            "chunk_size_sec": 1.0,
            "silence_threshold_sec": 0.8,
        }))

        # Step 2: Wait for ready
        ready = json.loads(await ws.recv())
        assert ready["type"] == "ready"
        print(f"Session ID: {ready['session_id']}")

        # Step 3: Stream audio (replace with real mic input)
        async def send_audio():
            for _ in range(30):  # 30 seconds of audio
                chunk = np.random.randn(16000).astype(np.float32)
                await ws.send(chunk.tobytes())
                await asyncio.sleep(1.0)
            await ws.send("END")

        # Step 4: Receive results concurrently
        async def receive_results():
            async for message in ws:
                msg = json.loads(message)
                t = msg["type"]
                if t == "partial":
                    print(f"\r[partial] {msg['text']}", end="", flush=True)
                elif t == "final_segment":
                    print(f"\n[segment {msg['segment_id']}] {msg['text']}")
                elif t == "final":
                    print(f"\n[final] {msg['text']}")
                elif t == "done":
                    print(f"\n[done] {msg['total_segments']} segments, "
                          f"{msg['total_audio_duration_sec']:.1f}s audio")
                    break
                elif t == "error":
                    print(f"\n[error] {msg['code']}: {msg['message']}")
                    break

        await asyncio.gather(send_audio(), receive_results())

asyncio.run(stream_audio())
```

### WebSocket Streaming — JavaScript (Browser)

```javascript
const ws = new WebSocket("wss://asr.shunyalabs.ai/ws");

ws.onopen = () => {
  // Step 1: Send config
  ws.send(JSON.stringify({
    language: "English",
    sample_rate: 16000,
    chunk_size_sec: 1.0,
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === "ready") {
    console.log("Session ready:", msg.session_id);
    startMicrophone();
  } else if (msg.type === "partial") {
    document.getElementById("transcript").innerText = msg.text;
  } else if (msg.type === "final_segment") {
    console.log("Segment:", msg.text);
  } else if (msg.type === "done") {
    console.log("Done. Total audio:", msg.total_audio_duration_sec, "s");
  }
};

function startMicrophone() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    const ctx = new AudioContext({ sampleRate: 16000 });
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(16000, 1, 1);

    processor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0);
      ws.send(float32.buffer);  // Send raw PCM bytes
    };

    source.connect(processor);
    processor.connect(ctx.destination);
  });
}

// Stop and finalize
function stopStreaming() {
  ws.send("END");
}
```


### Upload to S3 then Transcribe

```python
import requests

# Step 1: Get presigned URL
presign_resp = requests.post(
    "https://asr.shunyalabs.ai/presign",
    json={"filename": "meeting.wav", "content_type": "audio/wav"}
)
presign = presign_resp.json()

# Step 2: Upload audio to S3
with open("meeting.wav", "rb") as f:
    requests.put(presign["upload_url"], data=f, headers={"Content-Type": "audio/wav"})

# Step 3: Transcribe from S3
s3_url = f"https://{presign['bucket']}.s3.amazonaws.com/{presign['key']}"
response = requests.post(
    "https://asr.shunyalabs.ai/v1/transcriptions",
    data={"url": s3_url, "language_code": "auto"}
)
print(response.json()["text"])
```

---

## 12. Error Reference

### HTTP Errors

| Code | Meaning | Common Cause |
|------|---------|-------------|
| `400` | Bad Request | Missing audio source, unsupported language, audio load failure |
| `401` | Unauthorized | Invalid or missing API key |
| `503` | Service Unavailable | NLP/diarization service not configured, S3 not configured |
| `500` | Internal Server Error | Triton error, unexpected processing failure |

### WebSocket Error Codes

| Code Field | Meaning |
|-----------|---------|
| `CAPACITY_FULL` | Server has reached max concurrent sessions |
| `PROTOCOL_ERROR` | First message was not JSON, or invalid frame |
| `AUTH_FAILED` | Invalid API key |
| `TIMEOUT` | Inactivity or max connection duration reached |
| `TRITON_ERROR` | Error sending audio chunk to Triton |
| `INTERNAL_ERROR` | Unexpected server error |

### WebSocket Close Codes

| Code | Meaning |
|------|---------|
| `4001` | Invalid API key |
| `4002` | Insufficient balance |

---

## 13. Performance & Limits

| Parameter | Value | Configurable |
|-----------|-------|-------------|
| Max WebSocket sessions | 200 | `MAX_CONCURRENT_SESSIONS` |
| Max Triton streaming sequences | 300 | Triton config |
| gRPC pool size (batch) | 8 | `GRPC_POOL_SIZE` |
| Batch parallel workers | 4 | `BATCH_MAX_WORKERS` |
| Max session duration | 3600s (1 hr) | `MAX_CONNECTION_DURATION_SEC` |
| Inactivity timeout | 300s | `WS_INACTIVITY_TIMEOUT_SEC` |
| Audio buffer cap per session | 120s | `AUDIO_BUFFER_CAP_SEC` |
| Max batch transcription timeout | 300s | Triton gRPC stream timeout |
| Default VAD chunk size | 15s | `VAD_CHUNK_SIZE_SEC` |
| Streaming chunk re-transcription | Every 1s | `DEFAULT_CHUNK_SIZE_SEC` |
| GPU memory allocation | 30% | Triton model parameter |
| Max WebSocket message size | 16 MB | Uvicorn config |

### Throughput Notes

- **Batch mode**: All audio chunks are transcribed concurrently. A 5-minute audio file is typically split into ~20 VAD chunks (≤15s each), all sent to Triton simultaneously.
- **Streaming mode**: vLLM's AsyncLLM engine batches concurrent decode requests internally, so 300 simultaneous sessions share GPU time efficiently.

---

## 14. Internal Architecture (Technical Deep-Dive)

### Audio Pipeline (Batch)

```
File / URL
    │
    ▼ librosa.load() / httpx fetch
float32 numpy array (original sample rate)
    │
    ▼ resample to 16 kHz mono
float32 numpy array @ 16 kHz
    │
    ├─ vad_chunk()
    │    ├─ Scan 32ms windows with Silero VAD
    │    ├─ Find speech→silence transitions
    │    └─ Split at boundaries, max 15s, 2s overlap
    │
    ▼ asyncio.gather() — all chunks concurrently
batch_transcribe(pool, chunk.audio, model, language)
    │
    ▼ gRPC stream → qwen3_asr_bls
    │    ├─ Build chat template with language/context
    │    ├─ Call qwen3_decoder internally (BLS)
    │    │    └─ vLLM AsyncLLM inference
    │    └─ Parse output: text + detected_language
    │
    ▼ Assemble segments
TranscriptionResponse → Final response
```

### Audio Pipeline (Streaming)

```
WebSocket binary chunks
    │
    ▼ bytes_to_float32() → resample to 16 kHz
float32 chunk (e.g., 1 second)
    │
    ▼ VoiceActivityDetector.is_speech()
    │    └─ Silero VAD ONNX model, threshold=0.5
    │
    ▼ StreamingSession.send_chunk(audio, is_last=False)
    │    └─ gRPC async_stream_infer → qwen3_asr_streaming
    │         ├─ Accumulates ALL audio since last segment flush
    │         ├─ Prefix rollback: keeps last K tokens + new audio
    │         ├─ Calls qwen3_decoder (vLLM)
    │         └─ Returns partial TEXT + DETECTED_LANGUAGE
    │
    ▼ StreamingResult (text, language, done)
    │
    ▼ ClientSession._check_finalization()
    │    ├─ silence ≥ threshold? → _finalize_segment()
    │    └─ buffer ≥ cap? → _finalize_segment(force=True)
    │
    ▼ outbox queue → WebSocket sender task → Client
```

### Triton Sequence Batching (Streaming)

Each streaming WebSocket session gets a **unique sequence ID** (monotonically incrementing counter shared across all sessions). Triton's `sequence_batching` scheduler routes requests with the same sequence ID to the same model instance, maintaining per-session state (accumulated audio buffer).

```
Session A: seq_id=1001 ──► Triton slot 0 (state for A)
Session B: seq_id=1002 ──► Triton slot 1 (state for B)
Session C: seq_id=1003 ──► Triton slot 2 (state for C)
...up to 300 concurrent sequences
```

Sequence control inputs:
- `START=true` on first chunk → allocate slot, initialize state
- `END=true` on last chunk → release slot
- `CORRID` carries the sequence ID for routing

### Decoupled Transaction Policy

All three Triton models use `transaction_policy: decoupled: true`. This means:

- The model's `execute()` method can send **multiple responses** for one request, or **zero responses** and return control, sending responses later.
- The Triton scheduler is not blocked waiting for a response. This is essential for long inference tasks (LLM generation can take seconds).
- Responses are sent via `response_sender.send(response, flags=TRITONSERVER_RESPONSE_COMPLETE)`.

### vLLM Shared AsyncLLM Engine

The `qwen3_decoder` model runs 8 Python stub processes (Triton instances). All 8 share a **single vLLM AsyncLLM singleton**:

```python
# Initialized once on first use (double-checked locking)
_ENGINE_LOCK = threading.Lock()
_SHARED_ENGINE: Optional[AsyncLLM] = None

# Each of 8 instances calls:
engine = AsyncLLM.from_engine_args(engine_args)
```

vLLM's internal scheduler batches decode steps from all 8 instances together, maximizing GPU utilization. Requests are submitted via `asyncio` event loop running in a background thread.

### Prefix Rollback (Streaming)

To minimize transcription jitter at chunk boundaries:

1. When a new audio chunk arrives, the streaming model **prepends the last K decoded tokens** from the previous chunk as a "hint."
2. The model re-transcribes from this prefix + new audio.
3. The output prefix tokens are stripped from the response, keeping only new content.

This ensures words split across chunk boundaries are transcribed correctly and consistently.

---

---

## Upcoming Features

The following NLP / Speech Intelligence features are planned for future releases:

| Feature | Parameter | Description |
|---------|-----------|-------------|
| Intent Detection | `enable_intent_detection`, `intent_choices` | Classify transcript intent from a set of labels |
| Summarization | `enable_summarization`, `summary_max_length` | Generate a summary of the transcript |
| Sentiment Analysis | `enable_sentiment_analysis` | Positive / negative / neutral sentiment scoring |
| Emotion Diarization | `enable_emotion_diarization` | Per-segment emotion detection |
| Profanity Hashing | `enable_profanity_hashing`, `hash_keywords` | Replace profanity or custom keywords with `****` |
| Keyterm Normalization | `enable_keyterm_normalization` | Normalize domain-specific terms |
| Translation | `enable_translation`, `target_language` | Translate transcript to a target language |

---

*Generated on 2026-03-03. Reflects the deployed system state at time of generation.*
