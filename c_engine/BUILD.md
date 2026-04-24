# OS-Quest C Engine — Build Instructions

## Prerequisites
- [Emscripten SDK](https://emscripten.org/docs/getting_started/downloads.html)  
  After installing, activate it: `source emsdk_env.sh` (Linux/macOS) or `emsdk_env.bat` (Windows)

## Build WebAssembly output
Run from **this directory** (`c_engine/`):

```bash
emcc wasm_bridge.c scheduler.c -O2 \
  -o ../public/scheduler.js \
  -s WASM=1 \
  -s EXPORTED_FUNCTIONS='["_run_simulation","_get_result_ptr","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","setValue","HEAPU8","HEAP32","HEAPF64"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME=SchedulerModule \
  -s ENVIRONMENT=web
```

This produces:
- `public/scheduler.js`   — Emscripten loader (include this with a `<script>` tag)
- `public/scheduler.wasm` — compiled binary loaded automatically by the JS loader

## Native test build (no Emscripten needed)
```bash
gcc -O2 -o scheduler_test scheduler.c test_main.c && ./scheduler_test
```
