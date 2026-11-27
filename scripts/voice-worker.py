#!/usr/bin/env python3
"""Local KB-Whisper and Piper. Audio stays in memory. The process never sees the API key."""

import base64
import json
import os
import sys
from pathlib import Path

WHISPER_MODEL = "KBLab/kb-whisper-base"
VOICE_ID = "sv_SE-nst-medium"
ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = ROOT / "models"
VOICE_PATH = MODEL_DIR / f"{VOICE_ID}.onnx"


def emit(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def fail(code):
    emit({"op": "error", "code": code})
    raise SystemExit(1)


def load_models():
    try:
        import numpy as np
        from faster_whisper import WhisperModel
        from piper import PiperVoice
    except ImportError:
        fail("missing-python-packages")
    if not VOICE_PATH.is_file():
        fail("missing-piper-voice")
    offline = os.environ.get("HF_HUB_OFFLINE") == "1"
    whisper = WhisperModel(
        WHISPER_MODEL,
        device="cpu",
        compute_type="int8",
        download_root=str(MODEL_DIR / "whisper"),
        local_files_only=offline,
    )
    voice = PiperVoice.load(str(VOICE_PATH))
    return np, whisper, voice


def transcribe(np, whisper, pcm):
    audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
    segments, _info = whisper.transcribe(audio, language="sv", vad_filter=True)
    return "".join(segment.text for segment in segments).strip()


def speak(voice, text):
    chunks = list(voice.synthesize(text))
    if not chunks:
        return "", 22050
    pcm = b"".join(chunk.audio_int16_bytes for chunk in chunks)
    return base64.b64encode(pcm).decode("ascii"), chunks[0].sample_rate


def main():
    np, whisper, voice = load_models()
    emit({"op": "ready", "whisper": WHISPER_MODEL, "voice": VOICE_ID})
    for line in sys.stdin:
        if line.strip() == "":
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            emit({"op": "error", "code": "bad-request"})
            continue
        op = request.get("op")
        if op == "stop":
            break
        if op == "transcribe":
            pcm = base64.b64decode(request.get("pcmBase64", ""))
            emit({"op": "transcript", "text": transcribe(np, whisper, pcm)})
            continue
        if op == "speak":
            encoded, rate = speak(voice, str(request.get("text", "")))
            emit({"op": "audio", "pcmBase64": encoded, "sampleRateHz": rate})
            continue
        emit({"op": "error", "code": "bad-request"})


if __name__ == "__main__":
    try:
        main()
    except BrokenPipeError:
        raise SystemExit(0)
    except SystemExit:
        raise
    except Exception:
        fail("worker-failed")
