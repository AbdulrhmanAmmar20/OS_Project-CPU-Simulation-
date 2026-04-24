/**
 * app.js  –  OS-Quest main application controller
 *
 * Modes:
 *   "classic"   – Standard simulator (add processes, pick algorithm, run)
 *   "duel"      – Human vs AI (Scheduling Duel)
 *   "survival"  – System Survival (Process Storm stress test)
 */

/* ═══════════════════════════════════════════════════════════════════════════
 * State
 * ═══════════════════════════════════════════════════════════════════════════*/
const AppState = {
    mode:        'classic',  // 'classic' | 'duel' | 'survival'
    processes:   [],         // user-defined process list
    nextPid:     0,
    algo:        ALGO.FCFS,
    quantum:     2,
    lastResult:  null,

    // Duel mode
    duel: {
        humanScore:    null,
        aiScore:       null,
        humanQueue:    [],   // pids user assigns manually
        pendingProcs:  [],   // procs not yet assigned
        running:       false,
        currentTime:   0,
        gantt:         [],
        humanWaiting:  {},
    },

    // Survival mode
    survival: {
        wave:          0,
        queueLen:      0,
        overflowed:    false,
        stormTimer:    null,
        log:           [],
    },
};

/* ═══════════════════════════════════════════════════════════════════════════
 * DOM references
 * ═══════════════════════════════════════════════════════════════════════════*/
const $ = id => document.getElementById(id);

/* ═══════════════════════════════════════════════════════════════════════════
 * Utility
 * ═══════════════════════════════════════════════════════════════════════════*/
function randInt(lo, hi) { return Math.floor(Math.random() * (hi - lo + 1)) + lo; }

function generateRandomProcess(pid, arrivalTime) {
    const burstCount = randInt(1, 3);
    const bursts = [];
    for (let i = 0; i < burstCount; i++) {
        bursts.push({
            cpu: randInt(2, 12),
            io:  i < burstCount - 1 ? randInt(1, 6) : 0
        });
    }
    return {
        pid,
        priority:    randInt(1, 5),
        arrivalTime: arrivalTime ?? randInt(0, 10),
        bursts,
        alpha:       0.5
    };
}

function algoName(a) {
    return ['FCFS', 'SJF (AI)', 'SRTF (AI)', 'Round Robin', 'Priority'][a] ?? '?';
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Process Table UI
 * ═══════════════════════════════════════════════════════════════════════════*/
function renderProcessTable() {
    const tbody = $('proc-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    AppState.processes.forEach((p, idx) => {
        const burstStr = p.bursts.map(b => `${b.cpu}ms${b.io ? `+IO${b.io}` : ''}`).join(' → ');
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>P${p.pid}</td>
          <td>${p.arrivalTime}ms</td>
          <td>${burstStr}</td>
          <td>${p.priority}</td>
          <td><button class="btn-danger btn-sm" onclick="removeProcess(${idx})">✕</button></td>
        `;
        tbody.appendChild(tr);
    });
    $('proc-count').textContent = AppState.processes.length;
}

function addProcessFromForm() {
    const arrival = parseInt($('inp-arrival').value) || 0;
    const priority = parseInt($('inp-priority').value) || 1;
    const cpuBursts  = ($('inp-cpu-bursts').value || '5').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
    const ioBursts   = ($('inp-io-bursts').value  || '').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0);

    const bursts = cpuBursts.map((cpu, i) => ({
        cpu,
        io: i < cpuBursts.length - 1 ? (ioBursts[i] ?? 2) : 0
    }));

    if (bursts.length === 0) { showToast('At least one CPU burst required.', 'error'); return; }

    AppState.processes.push({
        pid:         AppState.nextPid++,
        priority,
        arrivalTime: arrival,
        bursts,
        alpha:       0.5
    });
    renderProcessTable();
    showToast(`P${AppState.nextPid - 1} added`, 'success');
}

function removeProcess(idx) {
    AppState.processes.splice(idx, 1);
    renderProcessTable();
}

function addRandomProcess() {
    const p = generateRandomProcess(AppState.nextPid++);
    AppState.processes.push(p);
    renderProcessTable();
    showToast(`Random P${p.pid} added`, 'info');
}

function clearProcesses() {
    AppState.processes = [];
    AppState.nextPid   = 0;
    renderProcessTable();
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Classic Mode – Run simulation
 * ═══════════════════════════════════════════════════════════════════════════*/
function runClassic() {
    if (AppState.processes.length === 0) {
        showToast('Add at least one process first.', 'error'); return;
    }

    const algoSel = parseInt($('algo-select').value);
    const quantum  = parseInt($('quantum-input').value) || 2;
    AppState.algo   = algoSel;
    AppState.quantum = quantum;

    const result = runSimulation(AppState.processes, algoSel, quantum);
    AppState.lastResult = result;

    renderMetrics(result, $('metrics-panel'));
    animateGantt($('gantt-container'), result.gantt, result.processes, {}, 80);
    renderPerProcessTable(result, $('per-proc-table'));
    $('results-section').classList.remove('hidden');
    $('results-section').scrollIntoView({ behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Metrics panel
 * ═══════════════════════════════════════════════════════════════════════════*/
function renderMetrics(result, container) {
    if (!container) return;
    container.innerHTML = `
      <div class="metric-card">
        <div class="metric-label">Avg Waiting Time</div>
        <div class="metric-value">${result.avgWaitingTime.toFixed(2)} <span class="metric-unit">ms</span></div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Avg Turnaround</div>
        <div class="metric-value">${result.avgTurnaroundTime.toFixed(2)} <span class="metric-unit">ms</span></div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Avg Response</div>
        <div class="metric-value">${result.avgResponseTime.toFixed(2)} <span class="metric-unit">ms</span></div>
      </div>
      <div class="metric-card">
        <div class="metric-label">CPU Utilization</div>
        <div class="metric-value">${result.cpuUtilization.toFixed(1)} <span class="metric-unit">%</span></div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Throughput</div>
        <div class="metric-value">${result.throughput.toFixed(3)} <span class="metric-unit">proc/s</span></div>
      </div>
      <div class="metric-card">
        <div class="metric-label">Total Time</div>
        <div class="metric-value">${result.totalTime} <span class="metric-unit">ms</span></div>
      </div>
    `;
}

function renderPerProcessTable(result, container) {
    if (!container) return;
    container.innerHTML = `
      <table class="data-table">
        <thead><tr>
          <th>PID</th><th>Arrival</th><th>Finish</th>
          <th>Turnaround</th><th>Waiting</th><th>Response</th>
        </tr></thead>
        <tbody>
          ${result.processes.filter(p => p.state === 4 /* DONE */).map(p => `
            <tr>
              <td><span class="pid-badge" style="background:${getPidColor(p.pid)}">P${p.pid}</span></td>
              <td>${p.arrivalTime}ms</td>
              <td>${p.finishTime}ms</td>
              <td>${p.turnaroundTime}ms</td>
              <td>${p.waitingTime}ms</td>
              <td>${p.responseTime}ms</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
}

const COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6','#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16'];
function getPidColor(pid) { return COLORS[pid % COLORS.length]; }

/* ═══════════════════════════════════════════════════════════════════════════
 * Mode: Scheduling Duel (Human vs AI)
 * ═══════════════════════════════════════════════════════════════════════════*/
function startDuel() {
    const n = parseInt($('duel-proc-count').value) || 5;
    AppState.duel.running      = true;
    AppState.duel.humanScore   = null;
    AppState.duel.aiScore      = null;
    AppState.duel.currentTime  = 0;
    AppState.duel.gantt        = [];
    AppState.duel.humanWaiting = {};

    // Generate processes
    const procs = [];
    for (let i = 0; i < n; i++) procs.push(generateRandomProcess(i, randInt(0, 4)));
    AppState.duel.pendingProcs = procs.slice().sort((a, b) => a.arrivalTime - b.arrivalTime);
    AppState.duel.humanQueue   = [];

    renderDuelArena(procs);
    $('duel-result').classList.add('hidden');
    showToast('Drag processes into your CPU queue. Minimize average waiting time!', 'info', 4000);
}

function renderDuelArena(procs) {
    const arena = $('duel-arena');
    if (!arena) return;
    arena.innerHTML = '';

    // Process cards
    const pool = document.createElement('div');
    pool.className = 'duel-pool';
    pool.innerHTML = '<h3 class="section-subtitle">Process Pool (arrived)</h3>';
    const poolCards = document.createElement('div');
    poolCards.id = 'duel-pool-cards';
    poolCards.className = 'process-pool-cards';
    procs.forEach(p => {
        const card = createDuelCard(p);
        poolCards.appendChild(card);
    });
    pool.appendChild(poolCards);
    arena.appendChild(pool);

    // CPU queue
    const queueDiv = document.createElement('div');
    queueDiv.className = 'duel-queue-wrapper';
    queueDiv.innerHTML = `
      <h3 class="section-subtitle">Your CPU Queue <span class="hint">(click processes to enqueue)</span></h3>
      <div id="human-cpu-queue" class="cpu-queue-display"></div>
      <button class="btn-primary mt-2" onclick="submitHumanSchedule()">Submit & Fight AI ⚡</button>
    `;
    arena.appendChild(queueDiv);

    // Process info
    const info = document.createElement('div');
    info.className = 'duel-info';
    info.innerHTML = `
      <table class="data-table small-table">
        <thead><tr><th>PID</th><th>Arrival</th><th>CPU Bursts</th><th>Priority</th></tr></thead>
        <tbody>${procs.map(p => `
          <tr>
            <td><span class="pid-badge" style="background:${getPidColor(p.pid)}">P${p.pid}</span></td>
            <td>${p.arrivalTime}ms</td>
            <td>${p.bursts.map(b => b.cpu).join(', ')}ms</td>
            <td>${p.priority}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    arena.appendChild(info);

    updateHumanQueueDisplay();
}

function createDuelCard(p) {
    const div = document.createElement('div');
    div.className = 'process-card';
    div.id = `duel-card-${p.pid}`;
    div.style.borderColor = getPidColor(p.pid);
    div.innerHTML = `
      <div class="pc-pid" style="color:${getPidColor(p.pid)}">P${p.pid}</div>
      <div class="pc-info">Arrival: ${p.arrivalTime}ms</div>
      <div class="pc-info">CPU: ${p.bursts[0].cpu}ms</div>
    `;
    div.onclick = () => toggleDuelProcess(p.pid);
    return div;
}

function toggleDuelProcess(pid) {
    const queue = AppState.duel.humanQueue;
    const idx   = queue.indexOf(pid);
    if (idx === -1) {
        queue.push(pid);
        const card = $(`duel-card-${pid}`);
        if (card) card.classList.add('selected');
    } else {
        queue.splice(idx, 1);
        const card = $(`duel-card-${pid}`);
        if (card) card.classList.remove('selected');
    }
    updateHumanQueueDisplay();
}

function updateHumanQueueDisplay() {
    const el = $('human-cpu-queue');
    if (!el) return;
    const queue = AppState.duel.humanQueue;
    if (queue.length === 0) {
        el.innerHTML = '<span class="empty-hint">Click processes above to add them to your schedule order</span>';
    } else {
        el.innerHTML = queue.map((pid, i) =>
            `<div class="queue-item" style="border-color:${getPidColor(pid)}">
              <span class="queue-pos">${i+1}</span>
              <span style="color:${getPidColor(pid)}">P${pid}</span>
            </div>`
        ).join('<span class="arrow">→</span>');
    }
}

function submitHumanSchedule() {
    const procs = AppState.duel.pendingProcs;
    const queue = AppState.duel.humanQueue;

    if (queue.length < procs.length) {
        showToast(`Add all ${procs.length} processes to your queue first.`, 'error'); return;
    }

    // Simulate human schedule: treat humanQueue order as FCFS with fixed priority
    const humanProcs = queue.map((pid, i) => {
        const p = procs.find(x => x.pid === pid);
        return { ...p, priority: i, arrivalTime: p.arrivalTime, alpha: 0.5 };
    });

    const humanResult = runSimulation(humanProcs, ALGO.FCFS, 2);
    const aiResult    = runSimulation(procs, ALGO.SJF,  2);

    AppState.duel.humanScore = humanResult.avgWaitingTime;
    AppState.duel.aiScore    = aiResult.avgWaitingTime;

    // Reveal results
    renderDuelResult(humanResult, aiResult, procs);
}

function renderDuelResult(humanResult, aiResult, procs) {
    const el = $('duel-result');
    if (!el) return;

    const humanWins = humanResult.avgWaitingTime <= aiResult.avgWaitingTime;
    const diff = Math.abs(humanResult.avgWaitingTime - aiResult.avgWaitingTime).toFixed(2);

    el.innerHTML = `
      <div class="duel-verdict ${humanWins ? 'human-wins' : 'ai-wins'}">
        <div class="verdict-title">${humanWins ? 'You Win!' : 'AI Wins!'}</div>
        <div class="verdict-sub">${humanWins
          ? `Your schedule is ${diff}ms better than AI!`
          : `AI beat you by ${diff}ms avg waiting time.`}</div>
      </div>
      <div class="duel-scores">
        <div class="score-card human-score">
          <div class="score-label">Your Score</div>
          <div class="score-value">${humanResult.avgWaitingTime.toFixed(2)}ms</div>
          <div class="score-sub">Avg Waiting Time</div>
        </div>
        <div class="score-card ai-score">
          <div class="score-label">AI (SJF) Score</div>
          <div class="score-value">${aiResult.avgWaitingTime.toFixed(2)}ms</div>
          <div class="score-sub">Avg Waiting Time</div>
        </div>
      </div>
      <h4 class="mt-3">Your Gantt Chart</h4>
    `;
    const ganttDiv = document.createElement('div');
    ganttDiv.className = 'gantt-container';
    el.appendChild(ganttDiv);
    renderGantt(ganttDiv, humanResult.gantt, humanResult.processes);

    el.innerHTML += `<h4 class="mt-3">AI Gantt Chart</h4>`;
    const aiGanttDiv = document.createElement('div');
    aiGanttDiv.className = 'gantt-container';
    el.appendChild(aiGanttDiv);
    renderGantt(aiGanttDiv, aiResult.gantt, aiResult.processes);

    el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Mode: System Survival
 * ═══════════════════════════════════════════════════════════════════════════*/
const SURVIVAL_QUEUE_MAX = 10;
let survivalProcs = [];
let survivalTime  = 0;
let survivalAlgo  = ALGO.FCFS;
let survivalQuantum = 2;
let survivalWave  = 0;
let survivalScore = 0;
let survivalTimer = null;
let survivalQueue = [];   // processes waiting to run
let survivalLog   = [];

function startSurvival() {
    survivalProcs  = [];
    survivalTime   = 0;
    survivalWave   = 0;
    survivalScore  = 0;
    survivalQueue  = [];
    survivalLog    = [];
    AppState.nextPid = 0;

    clearInterval(survivalTimer);
    $('survival-log').innerHTML = '';
    $('survival-scoreboard').innerHTML = '';
    $('survival-overflow').classList.add('hidden');

    survivalLog.push('Simulation started. Wave 1 incoming...');
    renderSurvivalStatus();
    survivalTimer = setInterval(survivalTick, 1800);
}

function survivalTick() {
    survivalWave++;
    // spawn processes: wave number grows the count
    const newCount = Math.min(survivalWave + 1, 6);
    const newProcs = [];
    for (let i = 0; i < newCount; i++) {
        const p = generateRandomProcess(AppState.nextPid++, survivalTime + randInt(0, 2));
        newProcs.push(p);
        survivalQueue.push(p);
    }
    survivalLog.unshift(`⚡ Wave ${survivalWave}: +${newCount} processes (Queue: ${survivalQueue.length})`);
    if (survivalLog.length > 20) survivalLog.pop();

    if (survivalQueue.length > SURVIVAL_QUEUE_MAX) {
        clearInterval(survivalTimer);
        survivalLog.unshift(`QUEUE OVERFLOW! System crashed at wave ${survivalWave}!`);
        $('survival-overflow').classList.remove('hidden');
        renderSurvivalStatus();
        return;
    }

    // Run a mini-simulation on current queue with chosen algorithm
    const toRun = survivalQueue.splice(0, Math.min(survivalQueue.length, 4));
    if (toRun.length > 0) {
        const res = runSimulation(toRun, survivalAlgo, survivalQuantum);
        survivalTime += res.totalTime;
        survivalScore += toRun.length * 10 - Math.round(res.avgWaitingTime);
        survivalLog.unshift(`Processed ${toRun.length} proc(s). Queue remaining: ${survivalQueue.length}. Score: ${survivalScore}`);
        renderGantt($('survival-gantt'), res.gantt, res.processes, { unitWidth: 20 });
    }

    renderSurvivalStatus();
}

function renderSurvivalStatus() {
    const queueBar = $('survival-queue-bar');
    if (queueBar) {
        const pct = Math.min(survivalQueue.length / SURVIVAL_QUEUE_MAX * 100, 100);
        const color = pct > 70 ? '#ef4444' : pct > 40 ? '#f59e0b' : '#10b981';
        queueBar.innerHTML = `
          <div class="queue-bar-track">
            <div class="queue-bar-fill" style="width:${pct}%;background:${color}"></div>
          </div>
          <span class="queue-bar-label">${survivalQueue.length} / ${SURVIVAL_QUEUE_MAX}</span>
        `;
    }
    const logEl = $('survival-log');
    if (logEl) logEl.innerHTML = survivalLog.map(l => `<div class="log-line">${l}</div>`).join('');

    const sb = $('survival-scoreboard');
    if (sb) sb.innerHTML = `
      <span>Wave: <strong>${survivalWave}</strong></span>
      <span>Score: <strong>${survivalScore}</strong></span>
      <span>Algorithm: <strong>${algoName(survivalAlgo)}</strong></span>
      <span>Quantum: <strong>${survivalQuantum}ms</strong></span>
    `;
}

function survivalSwitchAlgo() {
    const sel = $('survival-algo-select');
    if (sel) {
        survivalAlgo = parseInt(sel.value);
        showToast(`Switched to ${algoName(survivalAlgo)}`, 'info');
        renderSurvivalStatus();
    }
}

function survivalAdjustQuantum() {
    const inp = $('survival-quantum');
    if (inp) {
        survivalQuantum = Math.max(1, parseInt(inp.value) || 2);
        showToast(`Quantum set to ${survivalQuantum}ms`, 'info');
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Toast notifications
 * ═══════════════════════════════════════════════════════════════════════════*/
function showToast(msg, type = 'info', duration = 2500) {
    const container = $('toast-container') || document.body;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('visible'));
    setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Mode switching
 * ═══════════════════════════════════════════════════════════════════════════*/
function switchMode(mode) {
    AppState.mode = mode;
    ['classic','duel','survival'].forEach(m => {
        const el = $(`panel-${m}`);
        if (el) el.classList.toggle('hidden', m !== mode);
        const tab = $(`tab-${m}`);
        if (tab) tab.classList.toggle('active', m === mode);
    });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Algorithm comparison (run all algorithms on same process set)
 * ═══════════════════════════════════════════════════════════════════════════*/
function compareAllAlgos() {
    if (AppState.processes.length === 0) {
        showToast('Add processes first.', 'error'); return;
    }

    const algos = [ALGO.FCFS, ALGO.SJF, ALGO.SRTF, ALGO.RR, ALGO.PRIORITY];
    const names = algos.map(a => algoName(a));
    const results = algos.map(a => runSimulation(AppState.processes, a, AppState.quantum));

    const container = $('compare-table-container');
    if (!container) return;

    container.innerHTML = `
      <table class="data-table compare-table">
        <thead><tr>
          <th>Algorithm</th><th>Avg Wait</th><th>Avg TAT</th>
          <th>Avg Response</th><th>CPU Util%</th><th>Throughput</th>
        </tr></thead>
        <tbody>
          ${results.map((r, i) => {
            const best = results.reduce((mn, x) => x.avgWaitingTime < mn ? x.avgWaitingTime : mn, Infinity);
            const isBest = Math.abs(r.avgWaitingTime - best) < 0.01;
            return `<tr class="${isBest ? 'best-row' : ''}">
              <td>${names[i]}${isBest ? ' *' : ''}</td>
              <td>${r.avgWaitingTime.toFixed(2)}ms</td>
              <td>${r.avgTurnaroundTime.toFixed(2)}ms</td>
              <td>${r.avgResponseTime.toFixed(2)}ms</td>
              <td>${r.cpuUtilization.toFixed(1)}%</td>
              <td>${r.throughput.toFixed(3)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
    $('compare-section').classList.remove('hidden');
    $('compare-section').scrollIntoView({ behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Bootstrap
 * ═══════════════════════════════════════════════════════════════════════════*/
document.addEventListener('DOMContentLoaded', () => {
    // Set default algo display
    const algoSel = $('algo-select');
    if (algoSel) {
        const toggleQuantum = () => {
            const showQ = parseInt(algoSel.value) === ALGO.RR;
            $('quantum-row').classList.toggle('hidden', !showQ);
        };
        algoSel.addEventListener('change', toggleQuantum);
        toggleQuantum(); // init state
    }

    // Load demo data
    loadDemoProcesses();
    switchMode('classic');
});

function loadDemoProcesses() {
    AppState.processes = [];
    AppState.nextPid   = 0;
    const demos = [
        { pid: 0, priority: 2, arrivalTime: 0,  bursts: [{cpu:6,io:4},{cpu:3,io:0}], alpha: 0.5 },
        { pid: 1, priority: 1, arrivalTime: 2,  bursts: [{cpu:4,io:0}],              alpha: 0.5 },
        { pid: 2, priority: 3, arrivalTime: 4,  bursts: [{cpu:8,io:2},{cpu:1,io:0}], alpha: 0.5 },
        { pid: 3, priority: 1, arrivalTime: 6,  bursts: [{cpu:2,io:0}],              alpha: 0.5 },
    ];
    AppState.processes = demos;
    AppState.nextPid   = demos.length;
    renderProcessTable();
}
