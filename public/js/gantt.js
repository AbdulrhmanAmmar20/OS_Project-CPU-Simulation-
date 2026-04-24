/**
 * gantt.js
 * Renders an SVG Gantt chart from a simulation result's gantt array.
 */

const GANTT_COLORS = [
    '#6366f1','#f59e0b','#10b981','#ef4444','#3b82f6',
    '#8b5cf6','#ec4899','#14b8a6','#f97316','#84cc16',
    '#06b6d4','#a855f7','#e11d48','#0ea5e9','#22c55e',
];

const IDLE_COLOR = '#cbd5e1';

/**
 * Render a Gantt chart into `container` (a DOM element).
 * @param {HTMLElement} container
 * @param {Array} gantt  [{start, end, pid}]
 * @param {Array} procs  process objects with .pid
 * @param {Object} options  { height, labelHeight, barHeight, unitWidth }
 */
function renderGantt(container, gantt, procs, options = {}) {
    const H       = options.height      ?? 110;
    const LH      = options.labelHeight ?? 20;
    const BH      = options.barHeight   ?? 40;
    const UW      = options.unitWidth   ?? 28;  // px per time unit
    const BAR_Y   = (H - BH - LH) / 2;

    const totalTime = gantt.length > 0 ? gantt[gantt.length - 1].end : 1;
    const W = Math.max(totalTime * UW + 60, 400);

    container.innerHTML = '';

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('preserveAspectRatio', 'xMinYMid meet');
    svg.style.fontFamily = 'monospace';
    svg.style.fontSize   = '11px';
    svg.style.overflow   = 'visible';

    // Background
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', W); bg.setAttribute('height', H);
    bg.setAttribute('fill', '#f8fafc'); bg.setAttribute('rx', '8');
    svg.appendChild(bg);

    const pidColorMap = {};
    procs.forEach((p, i) => { pidColorMap[p.pid] = GANTT_COLORS[i % GANTT_COLORS.length]; });

    gantt.forEach(slice => {
        const x = slice.start * UW + 30;
        const w = (slice.end - slice.start) * UW;
        const color = slice.pid === -1 ? IDLE_COLOR : (pidColorMap[slice.pid] ?? '#888');

        // Bar
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', x); rect.setAttribute('y', BAR_Y);
        rect.setAttribute('width', w - 2); rect.setAttribute('height', BH);
        rect.setAttribute('fill', color); rect.setAttribute('rx', '4');
        rect.setAttribute('stroke', '#e2e8f0'); rect.setAttribute('stroke-width', '1');
        svg.appendChild(rect);

        // Label inside bar
        if (w > 18) {
            const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            lbl.setAttribute('x', x + w / 2 - 1);
            lbl.setAttribute('y', BAR_Y + BH / 2 + 4);
            lbl.setAttribute('text-anchor', 'middle');
            lbl.setAttribute('fill', slice.pid === -1 ? '#64748b' : '#fff');
            lbl.setAttribute('font-weight', 'bold');
            lbl.setAttribute('font-size', '12');
            lbl.textContent = slice.pid === -1 ? 'IDLE' : `P${slice.pid}`;
            svg.appendChild(lbl);
        }

        // Start time tick
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tick.setAttribute('x', x);
        tick.setAttribute('y', BAR_Y + BH + 14);
        tick.setAttribute('text-anchor', 'middle');
        tick.setAttribute('fill', '#6b7280');
        tick.textContent = slice.start;
        svg.appendChild(tick);
    });

    // End time
    if (gantt.length > 0) {
        const last = gantt[gantt.length - 1];
        const endX = last.end * UW + 30;
        const endT = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        endT.setAttribute('x', endX);
        endT.setAttribute('y', BAR_Y + BH + 14);
        endT.setAttribute('text-anchor', 'middle');
        endT.setAttribute('fill', '#6b7280');
        endT.textContent = last.end;
        svg.appendChild(endT);
    }

    container.appendChild(svg);
}

/**
 * Animate Gantt bar entries one by one (expo mode).
 */
function animateGantt(container, gantt, procs, options = {}, delayMs = 120) {
    const slices = gantt.slice();
    let idx = 0;
    const interim = [];

    const step = () => {
        if (idx >= slices.length) return;
        interim.push(slices[idx++]);
        renderGantt(container, interim, procs, options);
        setTimeout(step, delayMs);
    };
    step();
}
