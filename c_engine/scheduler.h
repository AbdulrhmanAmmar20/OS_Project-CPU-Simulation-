#ifndef SCHEDULER_H
#define SCHEDULER_H

#include <stdint.h>

#define MAX_PROCESSES 64
#define MAX_BURSTS    16
#define MAX_EVENTS    1024

/* ── Process states ─────────────────────────────────────────────────────── */
typedef enum {
    STATE_NEW      = 0,
    STATE_READY    = 1,
    STATE_RUNNING  = 2,
    STATE_WAITING  = 3,   /* I/O wait */
    STATE_DONE     = 4
} ProcessState;

/* ── Scheduling algorithms ──────────────────────────────────────────────── */
typedef enum {
    ALGO_FCFS      = 0,
    ALGO_SJF       = 1,   /* non-preemptive, AI-predicted */
    ALGO_SRTF      = 2,   /* preemptive SJF */
    ALGO_RR        = 3,
    ALGO_PRIORITY  = 4    /* lower number = higher priority */
} Algorithm;

/* ── Event types ────────────────────────────────────────────────────────── */
typedef enum {
    EVT_ARRIVAL         = 0,
    EVT_CPU_BURST_END   = 1,
    EVT_IO_END          = 2,
    EVT_PREEMPT         = 3,
    EVT_QUANTUM_EXPIRE  = 4
} EventType;

/* ── Single CPU / IO burst descriptor ──────────────────────────────────── */
typedef struct {
    int cpu_burst;   /* ms */
    int io_burst;    /* ms, 0 = none (last burst) */
} Burst;

/* ── Process Control Block ──────────────────────────────────────────────── */
typedef struct {
    int          pid;
    int          priority;          /* lower = higher priority */
    int          arrival_time;
    int          burst_count;
    Burst        bursts[MAX_BURSTS];

    /* runtime state */
    ProcessState state;
    int          current_burst_idx;
    int          remaining_cpu;     /* remaining time in current CPU burst */
    int          finish_time;
    int          waiting_time;
    int          turnaround_time;
    int          response_time;
    int          first_run;         /* flag */

    /* AI prediction (exponential smoothing) */
    double       predicted_burst;
    double       alpha;             /* smoothing factor */
} PCB;

/* ── Event ──────────────────────────────────────────────────────────────── */
typedef struct {
    int       time;
    EventType type;
    int       pid;
} Event;

/* ── Gantt slice (one coloured bar on the chart) ───────────────────────── */
typedef struct {
    int start;
    int end;
    int pid;        /* -1 = idle */
} GanttSlice;

/* ── Simulation result ──────────────────────────────────────────────────── */
typedef struct {
    int        process_count;
    PCB        processes[MAX_PROCESSES];

    double     avg_waiting_time;
    double     avg_turnaround_time;
    double     avg_response_time;
    double     cpu_utilization;
    double     throughput;

    int        gantt_count;
    GanttSlice gantt[MAX_EVENTS];

    int        total_time;
} SimResult;

/* ── Public API ─────────────────────────────────────────────────────────── */
#ifdef __cplusplus
extern "C" {
#endif

/**
 * Run a full simulation.
 *
 * @param procs        Array of initialised PCBs (arrival_time, bursts, priority set).
 * @param n            Number of processes.
 * @param algo         Scheduling algorithm.
 * @param time_quantum Round-Robin quantum (ignored for other algorithms).
 * @param result       Output struct filled by the function.
 */
void simulate(PCB *procs, int n, Algorithm algo, int time_quantum, SimResult *result);

/**
 * AI burst predictor – returns predicted next CPU burst for a process.
 * Uses exponential smoothing: τ_{n+1} = α·t_n + (1-α)·τ_n
 */
double predict_next_burst(PCB *p, int actual_burst);

#ifdef __cplusplus
}
#endif

#endif /* SCHEDULER_H */
