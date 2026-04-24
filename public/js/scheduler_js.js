/**
 * scheduler_js.js
 *
 * Pure-JavaScript port of the C event-driven scheduling engine.
 * Used as the primary engine in the browser (no WASM compile step needed).
 * When the WASM build is available, scheduler_wasm.js replaces calls here.
 */

const ALGO = { FCFS: 0, SJF: 1, SRTF: 2, RR: 3, PRIORITY: 4 };
const STATE = { NEW: 0, READY: 1, RUNNING: 2, WAITING: 3, DONE: 4 };

// ── Min-heap event queue ───────────────────────────────────────────────────
class EventQueue {
    constructor() { this.heap = []; }
    push(ev) {
        this.heap.push(ev);
        this._bubbleUp(this.heap.length - 1);
    }
    pop() {
        const top = this.heap[0];
        const last = this.heap.pop();
        if (this.heap.length > 0) { this.heap[0] = last; this._sinkDown(0); }
        return top;
    }
    get size() { return this.heap.length; }
    _cmp(a, b) { return a.time !== b.time ? a.time - b.time : a.type - b.type; }
    _bubbleUp(i) {
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this._cmp(this.heap[p], this.heap[i]) > 0) {
                [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]];
                i = p;
            } else break;
        }
    }
    _sinkDown(i) {
        const n = this.heap.length;
        while (true) {
            let s = i, l = 2*i+1, r = 2*i+2;
            if (l < n && this._cmp(this.heap[l], this.heap[s]) < 0) s = l;
            if (r < n && this._cmp(this.heap[r], this.heap[s]) < 0) s = r;
            if (s === i) break;
            [this.heap[s], this.heap[i]] = [this.heap[i], this.heap[s]];
            i = s;
        }
    }
}

// Event type constants (match C enum)
const EVT = { ARRIVAL: 0, CPU_BURST_END: 1, IO_END: 2, PREEMPT: 3, QUANTUM_EXPIRE: 4 };

// ── AI predictor ───────────────────────────────────────────────────────────
function predictNextBurst(p, actualBurst) {
    p.predictedBurst = p.alpha * actualBurst + (1 - p.alpha) * p.predictedBurst;
    return p.predictedBurst;
}

// ── Ready queue helpers ────────────────────────────────────────────────────
function pickNext(procs, ready, algo) {
    if (ready.length === 0) return -1;
    let bestIdx = 0;
    for (let i = 1; i < ready.length; i++) {
        const b = procs[ready[bestIdx]], c = procs[ready[i]];
        switch (algo) {
            case ALGO.FCFS:
                if (c.arrivalTime < b.arrivalTime) bestIdx = i;
                break;
            case ALGO.SJF:
            case ALGO.SRTF:
                if (c.predictedBurst < b.predictedBurst) bestIdx = i;
                break;
            case ALGO.PRIORITY:
                if (c.priority < b.priority) bestIdx = i;
                break;
            case ALGO.RR:
                bestIdx = 0; i = ready.length; // FIFO
                break;
        }
    }
    const pid = ready[bestIdx];
    ready.splice(bestIdx, 1);
    return pid;
}

// ── Gantt helper ───────────────────────────────────────────────────────────
function ganttPush(gantt, start, end, pid) {
    if (start >= end) return;
    if (gantt.length > 0) {
        const last = gantt[gantt.length - 1];
        if (last.pid === pid && last.end === start) { last.end = end; return; }
    }
    gantt.push({ start, end, pid });
}

// ── Main simulation function ───────────────────────────────────────────────
/**
 * @param {Array} inputProcs  Array of process descriptors:
 *   { pid, priority, arrivalTime, bursts:[{cpu,io},...], alpha? }
 * @param {number} algo   ALGO constant
 * @param {number} quantum  RR time quantum
 * @returns {Object} SimResult
 */
function runSimulation(inputProcs, algo, quantum = 2) {
    // Deep-clone and initialise runtime fields
    const procs = inputProcs.map(p => ({
        pid:              p.pid,
        priority:         p.priority ?? 0,
        arrivalTime:      p.arrivalTime,
        bursts:           p.bursts.map(b => ({ cpu: b.cpu, io: b.io ?? 0 })),
        state:            STATE.NEW,
        currentBurstIdx:  0,
        remainingCpu:     p.bursts[0].cpu,
        finishTime:       0,
        waitingTime:      0,
        turnaroundTime:   0,
        responseTime:     -1,
        firstRun:         false,
        predictedBurst:   p.bursts[0].cpu,
        alpha:            p.alpha ?? 0.5
    }));

    const eq    = new EventQueue();
    const ready = [];   // array of pids
    const gantt = [];

    let currentPid  = -1;
    let busyStart   = 0;
    let totalBusy   = 0;
    let quantumEnd  = 0;

    // Seed arrivals
    procs.forEach(p => {
        eq.push({ time: p.arrivalTime, type: EVT.ARRIVAL, pid: p.pid });
    });

    const startProcess = (pid, now) => {
        currentPid = pid;
        procs[pid].state = STATE.RUNNING;
        if (!procs[pid].firstRun) {
            procs[pid].firstRun   = true;
            procs[pid].responseTime = now - procs[pid].arrivalTime;
        }
        busyStart = now;
        const burst = procs[pid].remainingCpu;
        if (algo === ALGO.RR) {
            const run = Math.min(burst, quantum);
            quantumEnd = now + run;
            eq.push({ time: quantumEnd, type: EVT.QUANTUM_EXPIRE, pid });
        } else {
            eq.push({ time: now + burst, type: EVT.CPU_BURST_END, pid });
        }
    };

    const finishCpuBurst = (pid, now) => {
        predictNextBurst(procs[pid], procs[pid].bursts[procs[pid].currentBurstIdx].cpu);
        const bi = procs[pid].currentBurstIdx;
        const io = procs[pid].bursts[bi].io;
        if (io > 0 && bi + 1 < procs[pid].bursts.length) {
            procs[pid].state = STATE.WAITING;
            eq.push({ time: now + io, type: EVT.IO_END, pid });
        } else {
            procs[pid].state         = STATE.DONE;
            procs[pid].finishTime    = now;
            procs[pid].turnaroundTime = now - procs[pid].arrivalTime;
        }
    };

    while (eq.size > 0) {
        const ev  = eq.pop();
        const now = ev.time;

        switch (ev.type) {

        case EVT.ARRIVAL: {
            procs[ev.pid].state = STATE.READY;
            ready.push(ev.pid);
            if (currentPid === -1) {
                const next = pickNext(procs, ready, algo);
                if (next !== -1) startProcess(next, now);
            } else if (algo === ALGO.SRTF) {
                const np = procs[ev.pid];
                const cp = procs[currentPid];
                if (np.predictedBurst < cp.remainingCpu) {
                    const elapsed = now - busyStart;
                    totalBusy += elapsed;
                    ganttPush(gantt, busyStart, now, currentPid);
                    cp.remainingCpu -= elapsed;
                    cp.state = STATE.READY;
                    ready.push(currentPid);
                    currentPid = -1;
                    ready.splice(ready.indexOf(ev.pid), 1);
                    startProcess(ev.pid, now);
                }
            }
            break;
        }

        case EVT.CPU_BURST_END: {
            if (ev.pid !== currentPid) break;
            const elapsed = now - busyStart;
            totalBusy += elapsed;
            ganttPush(gantt, busyStart, now, ev.pid);
            finishCpuBurst(ev.pid, now);
            currentPid = -1;
            const next = pickNext(procs, ready, algo);
            if (next !== -1) startProcess(next, now);
            break;
        }

        case EVT.IO_END: {
            const pid = ev.pid;
            procs[pid].currentBurstIdx++;
            const bi = procs[pid].currentBurstIdx;
            procs[pid].remainingCpu    = procs[pid].bursts[bi].cpu;
            procs[pid].predictedBurst  = procs[pid].remainingCpu;
            procs[pid].state = STATE.READY;
            ready.push(pid);
            if (currentPid === -1) {
                const next = pickNext(procs, ready, algo);
                if (next !== -1) startProcess(next, now);
            } else if (algo === ALGO.SRTF) {
                const np = procs[pid];
                const cp = procs[currentPid];
                if (np.predictedBurst < cp.remainingCpu) {
                    const elapsed = now - busyStart;
                    totalBusy += elapsed;
                    ganttPush(gantt, busyStart, now, currentPid);
                    cp.remainingCpu -= elapsed;
                    cp.state = STATE.READY;
                    ready.push(currentPid);
                    currentPid = -1;
                    ready.splice(ready.indexOf(pid), 1);
                    startProcess(pid, now);
                }
            }
            break;
        }

        case EVT.QUANTUM_EXPIRE: {
            if (ev.pid !== currentPid || now !== quantumEnd) break;
            const elapsed = now - busyStart;
            totalBusy += elapsed;
            ganttPush(gantt, busyStart, now, ev.pid);
            procs[ev.pid].remainingCpu -= elapsed;

            if (procs[ev.pid].remainingCpu <= 0) {
                finishCpuBurst(ev.pid, now);
            } else {
                procs[ev.pid].state = STATE.READY;
                ready.push(ev.pid);
            }
            currentPid = -1;
            const next = pickNext(procs, ready, algo);
            if (next !== -1) startProcess(next, now);
            break;
        }
        }
    }

    // ── Compute metrics ────────────────────────────────────────────────────
    let totalTime = 0, sumWt = 0, sumTat = 0, sumRt = 0, finished = 0;

    procs.forEach(p => {
        if (p.state === STATE.DONE) {
            const totalCpu = p.bursts.reduce((s, b) => s + b.cpu, 0);
            p.waitingTime  = Math.max(0, p.turnaroundTime - totalCpu);
            sumWt  += p.waitingTime;
            sumTat += p.turnaroundTime;
            sumRt  += Math.max(0, p.responseTime);
            finished++;
            if (p.finishTime > totalTime) totalTime = p.finishTime;
        }
    });

    return {
        processes: procs,
        gantt,
        totalTime,
        avgWaitingTime:    finished ? sumWt  / finished : 0,
        avgTurnaroundTime: finished ? sumTat / finished : 0,
        avgResponseTime:   finished ? sumRt  / finished : 0,
        cpuUtilization:    totalTime ? totalBusy / totalTime * 100 : 0,
        throughput:        totalTime ? finished / totalTime * 1000  : 0,
    };
}

// Export for use in other modules
if (typeof module !== 'undefined') module.exports = { runSimulation, ALGO, STATE };
