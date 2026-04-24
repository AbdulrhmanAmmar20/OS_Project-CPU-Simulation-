# OS-Quest: The AI-Driven Scheduling Arena

> Interactive, web-based OS Scheduling Simulator with an Event-Driven C Engine,
> AI burst prediction, and gamified modes for college expo presentations.

---

## Quick Start (no build required)

```bash
cd public
python -m http.server 8080
# Then open http://localhost:8080 in your browser
```

Or double-click `public/index.html` — it works as a plain file in most browsers.

---

## Project Structure

```
os_project/
├── public/
│   ├── index.html          ← Main entry point
│   ├── css/
│   │   └── styles.css      ← Dark cyberpunk theme
│   └── js/
│       ├── scheduler_js.js ← Pure-JS event-driven engine (runs without WASM)
│       ├── gantt.js        ← SVG Gantt chart renderer with animation
│       └── app.js          ← UI controller, all three modes
└── c_engine/
    ├── scheduler.h         ← PCB, Event, SimResult type definitions
    ├── scheduler.c         ← Full event-driven simulation engine
    ├── wasm_bridge.c       ← WebAssembly export wrapper
    ├── test_main.c         ← Native test harness (no browser needed)
    └── BUILD.md            ← Emscripten build instructions
```

---

## Features

### Three Modes

| Mode | Description |
|------|-------------|
| **Classic Simulator** | Add processes with multi-burst CPU+I/O cycles, run any algorithm, see animated Gantt chart and metrics |
| **Scheduling Duel** | Manually order processes; AI runs SJF simultaneously — see who gets lower average waiting time |
| **System Survival** | Waves of processes stress-test your queue; switch algorithms & quantum on the fly to avoid crash |

### Scheduling Algorithms

| Algorithm | Notes |
|-----------|-------|
| FCFS | First Come First Served |
| SJF | AI-predicted burst via Exponential Smoothing (τ = α·t + (1-α)·τ) |
| SRTF | Preemptive SJF with online prediction |
| Round Robin | Configurable time quantum |
| Priority | Lower number = higher priority |

### Process Model
- Each process has **multiple CPU bursts interleaved with I/O bursts**
- States: `NEW → READY → RUNNING → WAITING(I/O) → DONE`
- Full metrics: Waiting Time, Turnaround Time, Response Time, CPU Utilization, Throughput

---

## C Engine Architecture

The C engine (`scheduler.c`) implements a **min-heap event queue** that manages:

| Event | Trigger |
|-------|---------|
| `ARRIVAL` | Process reaches arrival_time |
| `CPU_BURST_END` | Process finishes its current CPU burst |
| `IO_END` | I/O burst completes, process re-enters Ready queue |
| `QUANTUM_EXPIRE` | Round Robin quantum expires |
| `PREEMPT` | Higher-priority process arrives (SRTF) |

### AI Predictor (Exponential Smoothing)
```
τ_{n+1} = α · t_n + (1 − α) · τ_n
```
Where `t_n` = actual burst just completed, `τ_n` = previous prediction, `α = 0.5` (tunable).

---

## Building the WASM Version (optional)

See [c_engine/BUILD.md](c_engine/BUILD.md).  
The JavaScript pure port in `public/js/scheduler_js.js` is **functionally identical** and works without compilation.

---

## Running the Native C Tests

```bash
cd c_engine
gcc -O2 -o scheduler_test scheduler.c test_main.c
./scheduler_test
```

Expected output shows FCFS, SJF, and Round Robin results with Gantt traces.

---

## Expo Tips

- Start with **Classic mode** to demo process states and Gantt chart animation
- Use **Scheduling Duel** for audience participation ("can you beat the AI?")
- Use **System Survival** for a dramatic live stress-test demo
- The **Compare All Algorithms** button shows a side-by-side table with the winner highlighted

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Scheduling Engine | C (event-driven, min-heap queue) |
| AI Predictor | C / JS (Exponential Smoothing) |
| WebAssembly Bridge | Emscripten (optional) |
| UI / Charts | Vanilla JS + SVG |
| Styling | CSS3 (dark theme, responsive) |
