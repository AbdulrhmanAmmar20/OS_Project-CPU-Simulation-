/* test_main.c – compile with gcc to verify the C engine without WASM */
#include <stdio.h>
#include "scheduler.h"

int main(void) {
    PCB procs[3] = {
        {
            .pid = 0, .priority = 2, .arrival_time = 0,
            .burst_count = 2,
            .bursts = {{6, 4}, {3, 0}},
            .alpha = 0.5, .predicted_burst = 6
        },
        {
            .pid = 1, .priority = 1, .arrival_time = 2,
            .burst_count = 1,
            .bursts = {{4, 0}},
            .alpha = 0.5, .predicted_burst = 4
        },
        {
            .pid = 2, .priority = 3, .arrival_time = 4,
            .burst_count = 2,
            .bursts = {{8, 2}, {1, 0}},
            .alpha = 0.5, .predicted_burst = 8
        }
    };

    const char *algo_names[] = {"FCFS","SJF","SRTF","RR","Priority"};
    Algorithm algos[] = {ALGO_FCFS, ALGO_SJF, ALGO_RR};

    for (int a = 0; a < 3; a++) {
        SimResult res;
        simulate(procs, 3, algos[a], 3, &res);
        printf("=== %s ===\n", algo_names[algos[a]]);
        printf("  Avg Waiting Time   : %.2f ms\n", res.avg_waiting_time);
        printf("  Avg Turnaround Time: %.2f ms\n", res.avg_turnaround_time);
        printf("  CPU Utilization    : %.1f%%\n",  res.cpu_utilization);
        printf("  Throughput         : %.3f proc/s\n", res.throughput);
        printf("  Gantt: ");
        for (int g = 0; g < res.gantt_count; g++) {
            if (res.gantt[g].pid == -1)
                printf("[IDLE %d-%d]", res.gantt[g].start, res.gantt[g].end);
            else
                printf("[P%d %d-%d]", res.gantt[g].pid, res.gantt[g].start, res.gantt[g].end);
        }
        printf("\n\n");
    }
    return 0;
}
