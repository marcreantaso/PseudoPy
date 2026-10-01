/* ============================================================
   ALGORITHM SIMULATION TRACE — SINGLE SOURCE OF TRUTH
   ────────────────────────────────────────────────────────────
   One ordered event log for the Developer Options simulator.

   Design constraints:
     • The real compiler stages are the only producers. Nothing
       here re-implements compiler behaviour.
     • Disabled by default. Every call site guards on
       `simulationTracer.enabled`, so no payload object, snapshot
       or timestamp is allocated while the simulator is off.
     • Events never retain live compiler objects. Payloads and
       snapshots are detached copies, so replaying an old event
       cannot show mutated state.
     • Missing positions are reported as null. A coordinate is
       never invented.
     • Storage is bounded. Overflow is reported, not hidden.

   Event schema (the contract every consumer relies on):
     {
       seq,        // monotonic, gap-free within one trace
       stage,      // PREPROCESSING | NLP_MAPPING | LEXICAL_ANALYSIS |
                   // SYNTAX_ANALYSIS | SEMANTIC_ANALYSIS |
                   // CODE_GENERATION | PIPELINE | EXECUTION
       type,       // one of SIMULATION_TRACE_TYPES
       ts,         // monotonic milliseconds
       line,       // 1-based, or null when unavailable
       column,     // 1-based, or null when unavailable
       payload,    // detached plain data
       snapshot?   // present only on SIMULATION_TRACE_TYPES.SNAPSHOT
     }
   ============================================================ */

const SIMULATION_TRACE_TYPES = {
    STAGE_START: 'STAGE_START',
    STAGE_END: 'STAGE_END',
    PREPROCESS_APPLIED: 'PREPROCESS_APPLIED',
    NLP_MAPPING_APPLIED: 'NLP_MAPPING_APPLIED',
    TOKEN_EMITTED: 'TOKEN_EMITTED',
    TOKEN_REJECTED: 'TOKEN_REJECTED',
    BLOCK_PUSH: 'BLOCK_PUSH',
    BLOCK_POP: 'BLOCK_POP',
    BLOCK_MISMATCH: 'BLOCK_MISMATCH',
    NODE_CREATED: 'NODE_CREATED',
    SYMBOL_DECLARED: 'SYMBOL_DECLARED',
    SYMBOL_LOOKUP: 'SYMBOL_LOOKUP',
    SYMBOL_UPDATED: 'SYMBOL_UPDATED',
    TYPE_WARNING: 'TYPE_WARNING',
    DIAGNOSTIC_EMITTED: 'DIAGNOSTIC_EMITTED',
    CODE_EMITTED: 'CODE_EMITTED',
    SOURCE_MAPPED: 'SOURCE_MAPPED',
    SNAPSHOT: 'SNAPSHOT',
    TRACE_TRUNCATED: 'TRACE_TRUNCATED'
};

const SIMULATION_TRACE_LIMITS = {
    maxEvents: 50000,
    snapshotEvery: 50
};

// performance.now() is absent in some bare harnesses.
function simulationNow() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') return performance.now();
    return Date.now();
}

// Detach from live compiler state. JSON cloning is deliberate: it drops
// prototypes, cycles and non-JSON Skulpt handles, which is exactly what a
// recorded event must not retain.
function simulationDetach(value) {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'object') return value;
    try {
        return JSON.parse(JSON.stringify(value));
    } catch (e) {
        return null;
    }
}

class SimulationTracer {
    constructor(limits) {
        const merged = Object.assign({}, SIMULATION_TRACE_LIMITS, limits || {});
        this.maxEvents = merged.maxEvents;
        this.snapshotEvery = merged.snapshotEvery;
        this.reset();
    }

    reset() {
        this.enabled = false;
        this.events = [];
        this.seq = 0;
        this.truncated = false;
        this.snapshotProvider = null;
        this.sinceSnapshot = 0;
    }

    enable() {
        this.enabled = true;
        return this;
    }

    disable() {
        this.enabled = false;
        return this;
    }

    isEnabled() {
        return this.enabled === true;
    }

    // The compiler registers one reader for the live state that is not owned
    // by the tracer (block stack, symbol table, counters).
    setSnapshotProvider(fn) {
        this.snapshotProvider = typeof fn === 'function' ? fn : null;
        return this;
    }

    emit(type, opts) {
        if (!this.enabled) return null;
        if (this.events.length >= this.maxEvents) {
            if (!this.truncated) {
                this.truncated = true;
                this.events.push({
                    seq: this.seq++,
                    stage: 'PIPELINE',
                    type: SIMULATION_TRACE_TYPES.TRACE_TRUNCATED,
                    ts: simulationNow(),
                    line: null,
                    column: null,
                    payload: { maxEvents: this.maxEvents }
                });
            }
            return null;
        }

        const options = opts || {};
        const event = {
            seq: this.seq++,
            stage: options.stage || 'PIPELINE',
            type: type,
            ts: simulationNow(),
            line: typeof options.line === 'number' && isFinite(options.line) ? options.line : null,
            column: typeof options.column === 'number' && isFinite(options.column) ? options.column : null,
            // Detached so a later compiler mutation cannot rewrite history.
            payload: options.payload === undefined ? null : simulationDetach(options.payload)
        };
        // Only checkpoints carry state. The key is omitted entirely otherwise,
        // so consumers can test for `snapshot` rather than for a null.
        if (options.snapshot !== undefined) event.snapshot = simulationDetach(options.snapshot);
        this.events.push(event);

        if (++this.sinceSnapshot >= this.snapshotEvery) {
            this.sinceSnapshot = 0;
            this.captureSnapshot();
        }
        return event;
    }

    // A checkpoint holds the full compiler state at that point in the log.
    // Only periodic full snapshots are stored; the simulator reconstructs
    // intermediate state by replaying deltas forward from the checkpoint.
    captureSnapshot() {
        if (!this.enabled || !this.snapshotProvider) return null;
        let state;
        try {
            state = this.snapshotProvider();
        } catch (e) {
            state = null;
        }
        if (!state) return null;
        return this.emit(SIMULATION_TRACE_TYPES.SNAPSHOT, {
            stage: state.stage || 'PIPELINE',
            line: null,
            column: null,
            payload: { reason: 'interval' },
            snapshot: state
        });
    }

    // Finish a trace and return the envelope the simulator consumes.
    finalize(extra) {
        this.enabled = false;
        const envelope = {
            events: this.events.slice(),
            truncated: this.truncated,
            maxEvents: this.maxEvents,
            snapshotEvery: this.snapshotEvery
        };
        if (extra) {
            for (const key of Object.keys(extra)) envelope[key] = extra[key];
        }
        return envelope;
    }

    getEvents() {
        return this.events.slice();
    }
}

// Global singleton — shared across compiler stages exactly like compilerTrace.
const simulationTracer = new SimulationTracer();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SimulationTracer, simulationTracer, SIMULATION_TRACE_TYPES, SIMULATION_TRACE_LIMITS, simulationDetach };
}