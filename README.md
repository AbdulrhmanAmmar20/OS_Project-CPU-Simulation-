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

## Requirements
### Functional Requirements

FR1 — Process Management

The system shall allow users to add up to 64 processes, each with an arrival time, priority, multiple CPU bursts, and interleaved I/O bursts.
The system shall support adding processes manually, randomly, or via a demo preset.
The system shall allow removing individual processes or clearing all processes.

FR2 — Scheduling Algorithms
The system shall implement five scheduling algorithms: FCFS, SJF (non-preemptive), SRTF (preemptive), Round Robin, and Priority.
The system shall allow the user to switch algorithms before running the simulation.
Round Robin shall support a configurable time quantum (1–100 ms).

FR3 — AI Burst Prediction
The system shall use Exponential Smoothing (τ_{n+1} = α·t_n + (1−α)·τ_n) to predict future CPU bursts for SJF and SRTF.
The smoothing factor α shall default to 0.5 and be tunable per process.

FR4 — Simulation Engine
The engine shall use a discrete event-driven architecture with a min-heap event queue.
The engine shall handle events: Arrival, CPU Burst End, I/O End, Quantum Expire, and Preemption.
The engine shall produce a complete Gantt chart (slice list) and per-process metrics as output.

FR5 — Visualization
The system shall render an animated, color-coded Gantt chart for all processes.
The system shall display per-process state badges (NEW / READY / RUNNING / WAITING / DONE) in real time.
The system shall display aggregate metrics: Avg Waiting Time, Avg Turnaround Time, Avg Response Time, CPU Utilization, and Throughput.

FR6 — Time Travel Playback
The system shall provide a time scrubber allowing the user to jump to any simulation tick.
The system shall support playback speeds of 1×, 2×, and 5×.

FR7 — Simulation Modes
Classic Mode: User configures and runs a simulation; results are displayed post-run.
Duel Mode: User manually orders processes; the AI simultaneously runs SJF; side-by-side metrics comparison determines a winner.
Survival Mode: Waves of processes arrive automatically; user must adjust algorithm/quantum dynamically to avoid a ready-queue overflow crash.

FR8 — Algorithm Sandbox
The system shall provide an in-browser code editor (Monaco) allowing users to write and execute custom scheduling functions.
Custom schedulers shall receive readyQueue, currentTime, and history and return a PID.

FR9 — Input Validation
The system shall reject negative burst times, zero burst counts, negative arrival times, and empty required fields.
Priority values shall be clamped to the range [0, 99].

### Non-Functional Requirements

NFR1 — Performance: The JS engine shall complete a simulation of 64 processes with 16 bursts each in under 50 ms on a modern browser.

NFR2 — Portability: The plain-HTML version (index.html) shall run without any build step or server — directly from the filesystem in any modern browser.

NFR3 — Consistency: The C engine and the JavaScript engine shall produce bit-identical Gantt slices and metric values for the same input.

NFR4 — Usability: The UI shall be fully operable without any prior training; all controls shall be labeled and validated with inline error feedback.

NFR5 — Maintainability: Each layer (UI, Validation, Engine, Visualization) shall be independently modifiable without changes to other layers.

NFR6 — Browser Compatibility: The application shall run correctly on Chrome 120+, Edge 120+, and Firefox 120+ without plugins.


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
