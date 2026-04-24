/**
 * wasm_bridge.c
 *
 * Thin WebAssembly-exported wrapper around the C scheduler.
 * Compiled with:
 *   emcc wasm_bridge.c scheduler.c -O2 -o ../public/scheduler.wasm \
 *        -s WASM=1 -s EXPORTED_FUNCTIONS='["_run_simulation","_get_result_ptr","_malloc","_free"]' \
 *        -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","getValue","setValue"]' \
 *        -s ALLOW_MEMORY_GROWTH=1 -s MODULARIZE=1 -s EXPORT_NAME=SchedulerModule
 *
 * The JS side allocates a PCB array with _malloc, fills it in, calls
 * _run_simulation, then reads the SimResult via _get_result_ptr().
 */

#include "scheduler.h"
#include <stdlib.h>
#include <string.h>

/* single static result buffer – safe for single-threaded WASM */
static SimResult g_result;

/* Exported: run simulation.
 *   procs_ptr : pointer to flat PCB array in WASM linear memory
 *   n         : number of processes
 *   algo      : Algorithm enum value
 *   quantum   : RR time quantum
 */
void run_simulation(PCB *procs_ptr, int n, int algo, int quantum) {
    simulate(procs_ptr, n, (Algorithm)algo, quantum, &g_result);
}

/* Exported: get pointer to static SimResult */
SimResult *get_result_ptr(void) {
    return &g_result;
}
