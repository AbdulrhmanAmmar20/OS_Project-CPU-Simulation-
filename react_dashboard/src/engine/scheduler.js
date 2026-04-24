/* ═══════════════════════════════════════════════════════════════════
 * scheduler.js  –  Event-Driven CPU Scheduling Engine (JS)
 * Instruments state changes and logs for time-travel playback.
 * ═══════════════════════════════════════════════════════════════════ */

export const ALGO = { FCFS: 0, SJF: 1, SRTF: 2, RR: 3, PRIORITY: 4 };

export const ALGO_NAMES = {
  [ALGO.FCFS]:     'FCFS',
  [ALGO.SJF]:      'SJF (AI)',
  [ALGO.SRTF]:     'SRTF (AI)',
  [ALGO.RR]:       'Round Robin',
  [ALGO.PRIORITY]: 'Priority',
};

export const STATE = {
  NEW:     'NEW',
  READY:   'READY',
  RUNNING: 'RUNNING',
  WAITING: 'WAITING',
  DONE:    'DONE',
};

export const PROCESS_COLORS = [
  { from: '#7c3aed', to: '#a78bfa', hex: '#8b5cf6', name: 'violet' },
  { from: '#0e7490', to: '#22d3ee', hex: '#06b6d4', name: 'cyan'   },
  { from: '#059669', to: '#34d399', hex: '#10b981', name: 'emerald'},
  { from: '#be185d', to: '#f472b6', hex: '#ec4899', name: 'pink'   },
  { from: '#b45309', to: '#fbbf24', hex: '#f59e0b', name: 'amber'  },
  { from: '#1d4ed8', to: '#60a5fa', hex: '#3b82f6', name: 'blue'   },
  { from: '#0f766e', to: '#2dd4bf', hex: '#14b8a6', name: 'teal'   },
  { from: '#a21caf', to: '#e879f9', hex: '#d946ef', name: 'fuchsia'},
  { from: '#9a3412', to: '#fb923c', hex: '#f97316', name: 'orange' },
  { from: '#166534', to: '#86efac', hex: '#22c55e', name: 'green'  },
];

// ── Min-heap event queue ───────────────────────────────────────────
class MinHeap {
  constructor() { this.h = []; }
  push(e) {
    this.h.push(e);
    let i = this.h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this._lt(this.h[i], this.h[p])) { [this.h[i], this.h[p]] = [this.h[p], this.h[i]]; i = p; }
      else break;
    }
  }
  pop() {
    const top = this.h[0];
    const last = this.h.pop();
    if (this.h.length) { this.h[0] = last; this._down(0); }
    return top;
  }
  get size() { return this.h.length; }
  _lt(a, b) { return a.time !== b.time ? a.time < b.time : a.type < b.type; }
  _down(i) {
    const n = this.h.length;
    while (true) {
      let s = i, l = 2*i+1, r = 2*i+2;
      if (l < n && this._lt(this.h[l], this.h[s])) s = l;
      if (r < n && this._lt(this.h[r], this.h[s])) s = r;
      if (s === i) break;
      [this.h[s], this.h[i]] = [this.h[i], this.h[s]];
      i = s;
    }
  }
}

const EVT = { ARRIVAL: 0, CPU_END: 1, IO_END: 2, QUANTUM: 3 };

// ── AI predictor ───────────────────────────────────────────────────
function predict(p, actual) {
  p.predicted = p.alpha * actual + (1 - p.alpha) * p.predicted;
  return p.predicted;
}

// ── Pick next from ready queue ─────────────────────────────────────
function pickNext(procs, ready, algo) {
  if (!ready.length) return -1;
  let best = 0;
  for (let i = 1; i < ready.length; i++) {
    const b = procs[ready[best]], c = procs[ready[i]];
    switch (algo) {
      case ALGO.FCFS:     if (c.arrivalTime < b.arrivalTime) best = i; break;
      case ALGO.SJF:
      case ALGO.SRTF:     if (c.predicted < b.predicted) best = i; break;
      case ALGO.PRIORITY: if (c.priority < b.priority) best = i; break;
      case ALGO.RR:       best = 0; i = ready.length; break;
    }
  }
  const pid = ready[best];
  ready.splice(best, 1);
  return pid;
}

// ── Gantt push ─────────────────────────────────────────────────────
function ganttPush(gantt, start, end, pid) {
  if (start >= end) return;
  const last = gantt[gantt.length - 1];
  if (last && last.pid === pid && last.end === start) { last.end = end; return; }
  gantt.push({ start, end, pid });
}

// ═══════════════════════════════════════════════════════════════════
// Main simulation
// ═══════════════════════════════════════════════════════════════════
export function runSimulation(inputProcs, algo, quantum = 2) {
  const stateChanges = [];  // {time, pid, state, seq}
  let seq = 0;
  const logs = [];          // {time, message, type, id}
  let logId = 0;

  function recordState(time, pid, state) {
    stateChanges.push({ time, pid, state, seq: seq++ });
  }
  function log(time, message, type = 'info') {
    logs.push({ time, message, type, id: logId++ });
  }

  // Deep clone + init runtime fields
  const procs = inputProcs.map(p => ({
    pid:           p.pid,
    priority:      p.priority ?? 1,
    arrivalTime:   p.arrivalTime,
    bursts:        p.bursts.map(b => ({ cpu: b.cpu, io: b.io ?? 0 })),
    state:         STATE.NEW,
    burstIdx:      0,
    remainingCpu:  p.bursts[0].cpu,
    finishTime:    0,
    waitingTime:   0,
    turnaroundTime: 0,
    responseTime:  -1,
    firstRun:      false,
    predicted:     p.bursts[0].cpu,
    alpha:         p.alpha ?? 0.5,
  }));

  const eq    = new MinHeap();
  const ready = [];
  const gantt = [];

  let currentPid = -1;
  let busyStart  = 0;
  let totalBusy  = 0;
  let qEnd       = 0;

  // Seed arrivals
  procs.forEach(p => {
    eq.push({ time: p.arrivalTime, type: EVT.ARRIVAL, pid: p.pid });
  });

  const startProc = (pid, now) => {
    currentPid = pid;
    procs[pid].state = STATE.RUNNING;
    if (!procs[pid].firstRun) {
      procs[pid].firstRun = true;
      procs[pid].responseTime = now - procs[pid].arrivalTime;
    }
    recordState(now, pid, STATE.RUNNING);
    log(now, `P${pid} dispatched to CPU (${procs[pid].remainingCpu}ms remaining)`, 'cpu');
    busyStart = now;
    const burst = procs[pid].remainingCpu;
    if (algo === ALGO.RR) {
      const run = Math.min(burst, quantum);
      qEnd = now + run;
      eq.push({ time: qEnd, type: EVT.QUANTUM, pid });
    } else {
      eq.push({ time: now + burst, type: EVT.CPU_END, pid });
    }
  };

  const finishBurst = (pid, now) => {
    const bi = procs[pid].burstIdx;
    const predBefore = procs[pid].predicted;
    predict(procs[pid], procs[pid].bursts[bi].cpu);
    const io = procs[pid].bursts[bi].io;

    if ((algo === ALGO.SJF || algo === ALGO.SRTF) && bi + 1 < procs[pid].bursts.length) {
      log(now, `AI predicted next burst for P${pid}: ${procs[pid].predicted.toFixed(1)}ms (was ${predBefore.toFixed(1)}ms)`, 'ai');
    }

    if (io > 0 && bi + 1 < procs[pid].bursts.length) {
      procs[pid].state = STATE.WAITING;
      recordState(now, pid, STATE.WAITING);
      log(now, `P${pid} entering I/O wait (${io}ms)`, 'io');
      eq.push({ time: now + io, type: EVT.IO_END, pid });
    } else {
      procs[pid].state = STATE.DONE;
      procs[pid].finishTime = now;
      procs[pid].turnaroundTime = now - procs[pid].arrivalTime;
      recordState(now, pid, STATE.DONE);
      log(now, `P${pid} completed — TAT: ${procs[pid].turnaroundTime}ms`, 'done');
    }
  };

  while (eq.size > 0) {
    const ev  = eq.pop();
    const now = ev.time;

    switch (ev.type) {

    case EVT.ARRIVAL: {
      procs[ev.pid].state = STATE.READY;
      ready.push(ev.pid);
      recordState(now, ev.pid, STATE.READY);
      log(now, `P${ev.pid} arrived (burst: ${procs[ev.pid].bursts[0].cpu}ms, priority: ${procs[ev.pid].priority})`, 'arrival');

      if (currentPid === -1) {
        const next = pickNext(procs, ready, algo);
        if (next !== -1) startProc(next, now);
      } else if (algo === ALGO.SRTF) {
        const np = procs[ev.pid], cp = procs[currentPid];
        if (np.predicted < cp.remainingCpu) {
          const elapsed = now - busyStart;
          totalBusy += elapsed;
          ganttPush(gantt, busyStart, now, currentPid);
          cp.remainingCpu -= elapsed;
          cp.state = STATE.READY;
          ready.push(currentPid);
          recordState(now, currentPid, STATE.READY);
          log(now, `P${ev.pid} preempts P${currentPid} (SRTF)`, 'preempt');
          currentPid = -1;
          ready.splice(ready.indexOf(ev.pid), 1);
          startProc(ev.pid, now);
        }
      }
      break;
    }

    case EVT.CPU_END: {
      if (ev.pid !== currentPid) break;
      const elapsed = now - busyStart;
      totalBusy += elapsed;
      ganttPush(gantt, busyStart, now, ev.pid);
      finishBurst(ev.pid, now);
      currentPid = -1;
      const next = pickNext(procs, ready, algo);
      if (next !== -1) startProc(next, now);
      break;
    }

    case EVT.IO_END: {
      const pid = ev.pid;
      procs[pid].burstIdx++;
      const bi = procs[pid].burstIdx;
      procs[pid].remainingCpu = procs[pid].bursts[bi].cpu;
      procs[pid].predicted    = procs[pid].remainingCpu; // re-seed
      procs[pid].state = STATE.READY;
      ready.push(pid);
      recordState(now, pid, STATE.READY);
      log(now, `P${pid} I/O complete, returned to Ready queue`, 'io');

      if (currentPid === -1) {
        const next = pickNext(procs, ready, algo);
        if (next !== -1) startProc(next, now);
      } else if (algo === ALGO.SRTF) {
        const np = procs[pid], cp = procs[currentPid];
        if (np.predicted < cp.remainingCpu) {
          const elapsed = now - busyStart;
          totalBusy += elapsed;
          ganttPush(gantt, busyStart, now, currentPid);
          cp.remainingCpu -= elapsed;
          cp.state = STATE.READY;
          ready.push(currentPid);
          recordState(now, currentPid, STATE.READY);
          log(now, `P${pid} preempts P${currentPid} after I/O (SRTF)`, 'preempt');
          currentPid = -1;
          ready.splice(ready.indexOf(pid), 1);
          startProc(pid, now);
        }
      }
      break;
    }

    case EVT.QUANTUM: {
      if (ev.pid !== currentPid || now !== qEnd) break;
      const elapsed = now - busyStart;
      totalBusy += elapsed;
      ganttPush(gantt, busyStart, now, ev.pid);
      procs[ev.pid].remainingCpu -= elapsed;

      if (procs[ev.pid].remainingCpu <= 0) {
        finishBurst(ev.pid, now);
      } else {
        procs[ev.pid].state = STATE.READY;
        ready.push(ev.pid);
        recordState(now, ev.pid, STATE.READY);
        log(now, `P${ev.pid} quantum expired (${procs[ev.pid].remainingCpu}ms remaining)`, 'preempt');
      }
      currentPid = -1;
      const next = pickNext(procs, ready, algo);
      if (next !== -1) startProc(next, now);
      break;
    }
    }
  }

  // Compute final metrics
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

  log(totalTime, `Simulation complete. ${finished} processes. Total time: ${totalTime}ms`, 'done');

  return {
    processes:          procs,
    gantt,
    stateChanges,
    logs,
    totalTime,
    avgWaitingTime:     finished ? sumWt  / finished : 0,
    avgTurnaroundTime:  finished ? sumTat / finished : 0,
    avgResponseTime:    finished ? sumRt  / finished : 0,
    cpuUtilization:     totalTime ? totalBusy / totalTime * 100 : 0,
    throughput:         totalTime ? finished / totalTime * 1000  : 0,
  };
}

// ── Time-travel: get process states at a given time T ──────────────
export function getStatesAtTime(procs, stateChanges, T) {
  return procs.map(p => {
    const changes = stateChanges
      .filter(c => c.pid === p.pid && c.time <= T)
      .sort((a, b) => b.time !== a.time ? b.time - a.time : b.seq - a.seq);
    return { ...p, currentState: changes[0]?.state ?? STATE.NEW };
  });
}

// ── Demo processes ─────────────────────────────────────────────────
export const DEMO_PROCESSES = [
  { pid: 0, priority: 2, arrivalTime: 0,  bursts: [{ cpu: 6, io: 4 }, { cpu: 3, io: 0 }], alpha: 0.5 },
  { pid: 1, priority: 1, arrivalTime: 2,  bursts: [{ cpu: 4, io: 0 }],                    alpha: 0.5 },
  { pid: 2, priority: 3, arrivalTime: 4,  bursts: [{ cpu: 8, io: 2 }, { cpu: 1, io: 0 }], alpha: 0.5 },
  { pid: 3, priority: 1, arrivalTime: 6,  bursts: [{ cpu: 2, io: 0 }],                    alpha: 0.5 },
  { pid: 4, priority: 2, arrivalTime: 8,  bursts: [{ cpu: 5, io: 3 }, { cpu: 2, io: 0 }], alpha: 0.5 },
];

export function randInt(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }

export function generateRandomProcess(pid, arrivalTime) {
  const burstCount = randInt(1, 3);
  const bursts = [];
  for (let i = 0; i < burstCount; i++) {
    bursts.push({ cpu: randInt(2, 12), io: i < burstCount - 1 ? randInt(1, 5) : 0 });
  }
  return { pid, priority: randInt(1, 5), arrivalTime: arrivalTime ?? randInt(0, 10), bursts, alpha: 0.5 };
}
