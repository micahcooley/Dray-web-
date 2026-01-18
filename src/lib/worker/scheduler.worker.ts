// Web Worker scheduler (metronome-like). Posts 'tick' messages to main thread with { type: 'tick', tickIndex, engineTime }
// Main thread must send an 'init' message containing { engineNow, perfNow, tempo, startTick }

let running = false;
const tickIntervalMs = 25; // heartbeat for worker scheduling
let secondsPer16th = 0.125; // default
let nextTickPerfTime = 0; // performance.now() time for next tick in ms
let currentTick = 0;
let perfToEngineOffset = 0; // engineNow - perfNow (seconds)

function msToSec(ms: number) { return ms / 1000; }
function secToMs(sec: number) { return sec * 1000; }

self.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || !msg.type) return;

    if (msg.type === 'init') {
        // msg: { engineNow (s), perfNow (ms), tempo, startTick }
        const { engineNow, perfNow, tempo, startTick } = msg;
        perfToEngineOffset = engineNow - msToSec(perfNow);
        secondsPer16th = 60.0 / (tempo || 120) * 0.25; // seconds
        currentTick = typeof startTick === 'number' ? startTick : 0;
        // schedule nextTickPerfTime based on perfNow
        nextTickPerfTime = perfNow;
    }

    if (msg.type === 'start') {
        if (running) return;
        running = true;
        // Ensure nextTickPerfTime at least now
        nextTickPerfTime = Math.max(nextTickPerfTime, performance.now());
        workerLoop();
    }

    if (msg.type === 'stop') {
        running = false;
    }

    if (msg.type === 'setTempo') {
        const { tempo } = msg;
        secondsPer16th = 60.0 / (tempo || 120) * 0.25;
    }

    if (msg.type === 'setTick') {
        const { tick } = msg;
        if (typeof tick === 'number') currentTick = tick;
    }
};

function postTick(tickIndex: number, perfTimeMs: number) {
    // compute engine time in seconds
    const engineTime = perfToEngineOffset + msToSec(perfTimeMs);
    // post message
    (self as any).postMessage({ type: 'tick', tickIndex, engineTime });
}

async function workerLoop() {
    while (running) {
        const nowPerf = performance.now();
        // Post any ticks whose perf time <= nowPerf + lookahead (we don't know lookahead here, main thread handles scheduling window)
        // We'll post the next tick and advance by secondsPer16th
        if (nextTickPerfTime <= nowPerf + 50) { // post slightly ahead
            postTick(currentTick, nextTickPerfTime);
            currentTick++;
            nextTickPerfTime += secToMs(secondsPer16th);
        }
        // Sleep for tickIntervalMs
        await new Promise(resolve => setTimeout(resolve, tickIntervalMs));
    }
}
