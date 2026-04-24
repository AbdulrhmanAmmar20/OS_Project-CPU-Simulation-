#include "scheduler.h"
#include <string.h>
#include <stdlib.h>

/* ═══════════════════════════════════════════════════════════════════════════
 *  Internal helpers
 * ═══════════════════════════════════════════════════════════════════════════*/

/* Min-heap event queue */
static Event   eq[MAX_EVENTS];
static int     eq_size = 0;

static void eq_push(Event e) {
    int i = eq_size++;
    eq[i] = e;
    /* bubble up */
    while (i > 0) {
        int parent = (i - 1) / 2;
        if (eq[parent].time > eq[i].time ||
           (eq[parent].time == eq[i].time && eq[parent].type > eq[i].type)) {
            Event tmp = eq[parent]; eq[parent] = eq[i]; eq[i] = tmp;
            i = parent;
        } else break;
    }
}

static Event eq_pop(void) {
    Event top = eq[0];
    eq[0] = eq[--eq_size];
    /* bubble down */
    int i = 0;
    while (1) {
        int l = 2*i+1, r = 2*i+2, smallest = i;
        if (l < eq_size && (eq[l].time < eq[smallest].time ||
           (eq[l].time == eq[smallest].time && eq[l].type < eq[smallest].type)))
            smallest = l;
        if (r < eq_size && (eq[r].time < eq[smallest].time ||
           (eq[r].time == eq[smallest].time && eq[r].type < eq[smallest].type)))
            smallest = r;
        if (smallest == i) break;
        Event tmp = eq[smallest]; eq[smallest] = eq[i]; eq[i] = tmp;
        i = smallest;
    }
    return top;
}

/* Ready queue (simple array, re-sorted each time we pick next process) */
static int ready[MAX_PROCESSES];
static int ready_size = 0;

static void ready_push(int pid) {
    ready[ready_size++] = pid;
}

static void ready_remove(int pid) {
    for (int i = 0; i < ready_size; i++) {
        if (ready[i] == pid) {
            ready[i] = ready[--ready_size];
            return;
        }
    }
}

/* ── AI predictor ───────────────────────────────────────────────────────── */
double predict_next_burst(PCB *p, int actual_burst) {
    p->predicted_burst = p->alpha * actual_burst + (1.0 - p->alpha) * p->predicted_burst;
    return p->predicted_burst;
}

/* ── Pick next process from ready queue based on algorithm ─────────────── */
static int pick_next(PCB *procs, Algorithm algo) {
    if (ready_size == 0) return -1;
    int best = 0;
    for (int i = 1; i < ready_size; i++) {
        PCB *b = &procs[ready[best]];
        PCB *c = &procs[ready[i]];
        switch (algo) {
            case ALGO_FCFS:
                if (c->arrival_time < b->arrival_time) best = i;
                break;
            case ALGO_SJF:
            case ALGO_SRTF:
                if (c->predicted_burst < b->predicted_burst) best = i;
                break;
            case ALGO_PRIORITY:
                if (c->priority < b->priority) best = i;
                break;
            case ALGO_RR:
                /* FIFO order – pick the one that arrived in ready queue first
                   We encode arrival order via a simple counter stored in arrival_time
                   for the ready queue (we use a separate field). For RR we just pick
                   index 0 (FIFO). */
                best = 0;
                i = ready_size; /* break loop */
                break;
        }
    }
    int pid = ready[best];
    /* remove from ready */
    ready[best] = ready[--ready_size];
    return pid;
}

/* ── Gantt helper ──────────────────────────────────────────────────────── */
static void gantt_push(SimResult *res, int start, int end, int pid) {
    if (start >= end) return;
    /* merge with last slice if same pid */
    if (res->gantt_count > 0) {
        GanttSlice *last = &res->gantt[res->gantt_count - 1];
        if (last->pid == pid && last->end == start) {
            last->end = end;
            return;
        }
    }
    if (res->gantt_count < MAX_EVENTS) {
        res->gantt[res->gantt_count++] = (GanttSlice){start, end, pid};
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  Main simulation
 * ═══════════════════════════════════════════════════════════════════════════*/
void simulate(PCB *procs, int n, Algorithm algo, int time_quantum, SimResult *result) {
    memset(result, 0, sizeof(*result));
    result->process_count = n;

    /* copy processes into result */
    for (int i = 0; i < n; i++) {
        result->processes[i] = procs[i];
        result->processes[i].state           = STATE_NEW;
        result->processes[i].current_burst_idx = 0;
        result->processes[i].remaining_cpu   = procs[i].bursts[0].cpu_burst;
        result->processes[i].finish_time     = 0;
        result->processes[i].waiting_time    = 0;
        result->processes[i].turnaround_time = 0;
        result->processes[i].response_time   = -1;
        result->processes[i].first_run       = 0;
        /* initialise predicted burst to first actual burst */
        result->processes[i].predicted_burst = procs[i].bursts[0].cpu_burst;
        if (result->processes[i].alpha == 0.0)
            result->processes[i].alpha = 0.5;
    }

    PCB *P = result->processes;

    /* reset event queue and ready queue */
    eq_size    = 0;
    ready_size = 0;

    /* seed arrival events */
    for (int i = 0; i < n; i++) {
        eq_push((Event){P[i].arrival_time, EVT_ARRIVAL, i});
        P[i].state = STATE_NEW;
    }

    int current_pid   = -1;  /* pid currently on CPU, -1 = idle */
    int cpu_free_at   = 0;
    int busy_start    = 0;
    int total_busy    = 0;

    /* For RR quantum tracking */
    int quantum_end   = 0;

    while (eq_size > 0) {
        Event ev = eq_pop();
        int   now = ev.time;

        switch (ev.type) {

        /* ── Process arrives ───────────────────────────────────────────── */
        case EVT_ARRIVAL: {
            int pid = ev.pid;
            P[pid].state = STATE_READY;
            ready_push(pid);

            /* If CPU is free, schedule immediately */
            if (current_pid == -1) {
                int next = pick_next(P, algo);
                if (next == -1) break;
                current_pid = next;
                P[current_pid].state = STATE_RUNNING;
                if (!P[current_pid].first_run) {
                    P[current_pid].first_run   = 1;
                    P[current_pid].response_time = now - P[current_pid].arrival_time;
                }
                busy_start = now;
                int burst = P[current_pid].remaining_cpu;
                if (algo == ALGO_RR) {
                    int run = (burst < time_quantum) ? burst : time_quantum;
                    quantum_end = now + run;
                    eq_push((Event){quantum_end, EVT_QUANTUM_EXPIRE, current_pid});
                } else {
                    eq_push((Event){now + burst, EVT_CPU_BURST_END, current_pid});
                }
            } else if (algo == ALGO_SRTF) {
                /* check if new process preempts current */
                if (P[pid].predicted_burst < P[current_pid].remaining_cpu) {
                    /* preempt */
                    int elapsed = now - busy_start;
                    total_busy += elapsed;
                    gantt_push(result, busy_start, now, current_pid);
                    P[current_pid].remaining_cpu -= elapsed;
                    P[current_pid].state = STATE_READY;
                    ready_push(current_pid);

                    current_pid = pid;
                    ready_remove(pid);
                    P[current_pid].state = STATE_RUNNING;
                    if (!P[current_pid].first_run) {
                        P[current_pid].first_run    = 1;
                        P[current_pid].response_time = now - P[current_pid].arrival_time;
                    }
                    busy_start  = now;
                    eq_push((Event){now + P[current_pid].remaining_cpu, EVT_CPU_BURST_END, current_pid});
                }
            }
            break;
        }

        /* ── CPU burst finished ────────────────────────────────────────── */
        case EVT_CPU_BURST_END: {
            int pid = ev.pid;
            if (pid != current_pid) break; /* stale event */

            int elapsed = now - busy_start;
            total_busy += elapsed;
            gantt_push(result, busy_start, now, pid);

            /* update prediction */
            predict_next_burst(&P[pid], P[pid].bursts[P[pid].current_burst_idx].cpu_burst);

            int bi = P[pid].current_burst_idx;
            int io  = P[pid].bursts[bi].io_burst;

            if (io > 0 && bi + 1 < P[pid].burst_count) {
                /* go to I/O */
                P[pid].state = STATE_WAITING;
                eq_push((Event){now + io, EVT_IO_END, pid});
            } else {
                /* process finished */
                P[pid].state          = STATE_DONE;
                P[pid].finish_time    = now;
                P[pid].turnaround_time = now - P[pid].arrival_time;
            }

            current_pid = -1;
            cpu_free_at = now;

            /* schedule next ready process */
            int next = pick_next(P, algo);
            if (next != -1) {
                current_pid = next;
                P[current_pid].state = STATE_RUNNING;
                if (!P[current_pid].first_run) {
                    P[current_pid].first_run    = 1;
                    P[current_pid].response_time = now - P[current_pid].arrival_time;
                }
                busy_start = now;
                int burst = P[current_pid].remaining_cpu;
                if (algo == ALGO_RR) {
                    int run = (burst < time_quantum) ? burst : time_quantum;
                    quantum_end = now + run;
                    eq_push((Event){quantum_end, EVT_QUANTUM_EXPIRE, current_pid});
                } else {
                    eq_push((Event){now + burst, EVT_CPU_BURST_END, current_pid});
                }
            }
            break;
        }

        /* ── I/O finished ──────────────────────────────────────────────── */
        case EVT_IO_END: {
            int pid = ev.pid;
            P[pid].current_burst_idx++;
            int bi = P[pid].current_burst_idx;
            P[pid].remaining_cpu = P[pid].bursts[bi].cpu_burst;
            P[pid].predicted_burst = P[pid].remaining_cpu; /* re-seed for new burst */
            P[pid].state = STATE_READY;
            ready_push(pid);

            if (current_pid == -1) {
                int next = pick_next(P, algo);
                if (next == -1) break;
                current_pid = next;
                P[current_pid].state = STATE_RUNNING;
                if (!P[current_pid].first_run) {
                    P[current_pid].first_run    = 1;
                    P[current_pid].response_time = now - P[current_pid].arrival_time;
                }
                busy_start = now;
                int burst = P[current_pid].remaining_cpu;
                if (algo == ALGO_RR) {
                    int run = (burst < time_quantum) ? burst : time_quantum;
                    quantum_end = now + run;
                    eq_push((Event){quantum_end, EVT_QUANTUM_EXPIRE, current_pid});
                } else {
                    eq_push((Event){now + burst, EVT_CPU_BURST_END, current_pid});
                }
            } else if (algo == ALGO_SRTF) {
                if (P[pid].predicted_burst < P[current_pid].remaining_cpu) {
                    int elapsed = now - busy_start;
                    total_busy += elapsed;
                    gantt_push(result, busy_start, now, current_pid);
                    P[current_pid].remaining_cpu -= elapsed;
                    P[current_pid].state = STATE_READY;
                    ready_push(current_pid);

                    current_pid = pid;
                    ready_remove(pid);
                    P[current_pid].state = STATE_RUNNING;
                    if (!P[current_pid].first_run) {
                        P[current_pid].first_run    = 1;
                        P[current_pid].response_time = now - P[current_pid].arrival_time;
                    }
                    busy_start = now;
                    eq_push((Event){now + P[current_pid].remaining_cpu, EVT_CPU_BURST_END, current_pid});
                }
            }
            break;
        }

        /* ── Round Robin quantum expired ───────────────────────────────── */
        case EVT_QUANTUM_EXPIRE: {
            int pid = ev.pid;
            if (pid != current_pid) break; /* stale */
            if (now != quantum_end)   break; /* stale */

            int elapsed = now - busy_start;
            total_busy += elapsed;
            gantt_push(result, busy_start, now, pid);

            P[pid].remaining_cpu -= elapsed;

            if (P[pid].remaining_cpu <= 0) {
                /* burst finished exactly on quantum boundary */
                predict_next_burst(&P[pid], P[pid].bursts[P[pid].current_burst_idx].cpu_burst);
                int bi = P[pid].current_burst_idx;
                int io  = P[pid].bursts[bi].io_burst;
                if (io > 0 && bi + 1 < P[pid].burst_count) {
                    P[pid].state = STATE_WAITING;
                    eq_push((Event){now + io, EVT_IO_END, pid});
                } else {
                    P[pid].state          = STATE_DONE;
                    P[pid].finish_time    = now;
                    P[pid].turnaround_time = now - P[pid].arrival_time;
                }
                current_pid = -1;
            } else {
                /* still has CPU time left – re-queue */
                P[pid].state = STATE_READY;
                ready_push(pid);
                current_pid = -1;
            }

            int next = pick_next(P, algo);
            if (next != -1) {
                current_pid = next;
                P[current_pid].state = STATE_RUNNING;
                if (!P[current_pid].first_run) {
                    P[current_pid].first_run    = 1;
                    P[current_pid].response_time = now - P[current_pid].arrival_time;
                }
                busy_start = now;
                int burst = P[current_pid].remaining_cpu;
                int run   = (burst < time_quantum) ? burst : time_quantum;
                quantum_end = now + run;
                eq_push((Event){quantum_end, EVT_QUANTUM_EXPIRE, current_pid});
            }
            break;
        }

        case EVT_PREEMPT: break; /* handled inline above */
        }
    }

    /* ── Compute metrics ────────────────────────────────────────────────── */
    result->total_time = 0;
    double sum_wt = 0, sum_tat = 0, sum_rt = 0;
    int finished = 0;

    for (int i = 0; i < n; i++) {
        PCB *p = &P[i];
        if (p->state == STATE_DONE) {
            p->waiting_time = p->turnaround_time
                - p->bursts[0].cpu_burst; /* simplified: TAT - total CPU */
            /* better: TAT - sum of all CPU bursts */
            int total_cpu = 0;
            for (int b = 0; b < p->burst_count; b++)
                total_cpu += p->bursts[b].cpu_burst;
            p->waiting_time = p->turnaround_time - total_cpu;
            if (p->waiting_time < 0) p->waiting_time = 0;

            sum_wt  += p->waiting_time;
            sum_tat += p->turnaround_time;
            sum_rt  += (p->response_time >= 0) ? p->response_time : 0;
            finished++;
            if (p->finish_time > result->total_time)
                result->total_time = p->finish_time;
        }
    }

    if (finished > 0) {
        result->avg_waiting_time    = sum_wt  / finished;
        result->avg_turnaround_time = sum_tat / finished;
        result->avg_response_time   = sum_rt  / finished;
    }

    result->cpu_utilization = (result->total_time > 0)
        ? (double)total_busy / result->total_time * 100.0
        : 0.0;
    result->throughput = (result->total_time > 0)
        ? (double)finished / result->total_time * 1000.0  /* processes / sec if ms */
        : 0.0;
}
