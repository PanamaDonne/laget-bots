#!/bin/sh
# Rough latency report in a 4 CPU / 2 GB limit. Local KB-Whisper and Piper run.
# The chat model is not called. This is not the PAN-300 3 second gate.
set -eu
cd "$(dirname "$0")/.."
ROOT=$PWD

prepare() {
  if [ ! -x .venv/bin/python3 ]; then
    python3 -m venv .venv
    .venv/bin/pip install --disable-pip-version-check -r requirements.txt
  fi
  mkdir -p models
  voice=models/sv_SE-nst-medium.onnx
  voice_json=models/sv_SE-nst-medium.onnx.json
  if [ -L "$voice" ] || [ -L "$voice_json" ]; then
    echo "Röstfilen är en länk." >&2
    exit 1
  fi
  base=https://huggingface.co/rhasspy/piper-voices/resolve/main/sv/sv_SE/nst/medium
  if [ ! -f "$voice" ]; then
    curl -fL --retry 3 -o "$voice.part" "$base/sv_SE-nst-medium.onnx"
    mv "$voice.part" "$voice"
  fi
  if [ ! -f "$voice_json" ]; then
    curl -fL --retry 3 -o "$voice_json.part" "$base/sv_SE-nst-medium.onnx.json"
    mv "$voice_json.part" "$voice_json"
  fi
  if [ ! -e models/whisper/models--KBLab--kb-whisper-base/refs/main ]; then
    .venv/bin/python3 -c 'from faster_whisper import WhisperModel; WhisperModel("KBLab/kb-whisper-base", device="cpu", compute_type="int8", download_root="models/whisper")'
  fi
}

run_node() {
  node --experimental-strip-types src/precheck-cli.ts
}

if [ "${RADIO_DAYS_PRECHECK_CHILD:-}" != "1" ]; then
  prepare
fi
export PATH="$ROOT/.venv/bin:$PATH"

if [ "${RADIO_DAYS_PRECHECK_CHILD:-}" = "1" ]; then
  run_node
  exit $?
fi

if command -v systemd-run >/dev/null 2>&1; then
  if systemd-run --quiet --scope \
    -p MemoryMax=2G \
    -p MemorySwapMax=0 \
    -p CPUQuota=400% \
    env RADIO_DAYS_PRECHECK_CHILD=1 PATH="$PATH" \
    node --experimental-strip-types src/precheck-cli.ts 2>/dev/null
  then
    exit 0
  fi
fi

rel=$(awk -F: '/^0::/ { print substr($0, 4) }' /proc/self/cgroup)
here=/sys/fs/cgroup$rel
parent=$(dirname "$here")
child=$parent/radio-days-precheck
added_cpu=0
if [ -d "$parent" ]; then
  if ! grep -q 'cpu' "$parent/cgroup.subtree_control" 2>/dev/null; then
    if echo '+cpu' > "$parent/cgroup.subtree_control" 2>/dev/null; then
      added_cpu=1
    fi
  fi
  rmdir "$child" 2>/dev/null || true
  if mkdir "$child" 2>/dev/null \
    && echo 2147483648 > "$child/memory.max" \
    && echo "400000 100000" > "$child/cpu.max" \
    && echo $$ > "$child/cgroup.procs"
  then
    cleanup() {
      echo $$ > "$here/cgroup.procs" 2>/dev/null || true
      rmdir "$child" 2>/dev/null || true
      if [ "$added_cpu" = 1 ]; then
        echo '-cpu' > "$parent/cgroup.subtree_control" 2>/dev/null || true
      fi
    }
    trap cleanup EXIT
    set +e
    RADIO_DAYS_PRECHECK_CHILD=1 run_node
    status=$?
    set -e
    cleanup
    trap - EXIT
    exit "$status"
  fi
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  exec docker run --rm \
    --cpus=4 \
    --memory=2g \
    --memory-swap=2g \
    -v "$PWD":/work \
    -w /work \
    -e RADIO_DAYS_PRECHECK_CHILD=1 \
    -e PATH="/work/.venv/bin:/usr/local/bin:/usr/bin:/bin" \
    node:24-bookworm-slim \
    node --experimental-strip-types src/precheck-cli.ts
fi

echo "Förhandskollen körs utan gräns på 4 kärnor och 2 GB." >&2
RADIO_DAYS_PRECHECK_CHILD=1 run_node
