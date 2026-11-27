#!/usr/bin/env python3
"""Local KB-Whisper and Piper. The process keeps both loaded and never sees the API key."""

import base64
import json
import sys
import tempfile
import wave
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
        from faster_whisper import WhisperModel
        from piper import PiperVoice
    except ImportError:
        fail("missing-python-packages")
    if not VOICE_PATH.is_file():
        fail("missing-piper-voice")
    whisper = WhisperModel(
        WHISPER_MODEL,
        device="cpu",
        compute_type="int8",
        download_root=str(MODEL_DIR / "whisper"),
    )
    voice = PiperVoice.load(str(VOICE_PATH))
    return whisper, voice


def pcm_to_wav(pcm, sample_rate):
    handle = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    path = Path(handle.name)
    handle.close()
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return path


def transcribe(whisper, pcm, sample_rate):
    path = pcm_to_wav(pcm, sample_rate)
    try:
        segments, _info = whisper.transcribe(str(path), language="sv")
        return "".join(segment.text for segment in segments).strip()
    finally:
        path.unlink(missing_ok=True)


def speak(voice, text):
    handle = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    path = Path(handle.name)
    handle.close()
    try:
        with wave.open(str(path), "wb") as wav:
            voice.synthesize_wav(text, wav)
        with wave.open(str(path), "rb") as wav:
            rate = wav.getframerate()
            pcm = wav.readframes(wav.getnframes())
        return base64.b64encode(pcm).decode("ascii"), rate
    finally:
        path.unlink(missing_ok=True)


def main():
    whisper, voice = load_models()
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
            rate = int(request.get("sampleRateHz", 16000))
            emit({"op": "transcript", "text": transcribe(whisper, pcm, rate)})
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
