import { performance } from 'perf_hooks';

const ITERATIONS = 1000000;
const TICK_INDEX = 123;
const TRACK_ID = 456;
const NOTE_ID = "note-789";

// Method 1: String Key
const set = new Set<string>();
const t0 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    const key = `${TICK_INDEX}:${TRACK_ID}:${NOTE_ID}`;
    if (!set.has(key)) {
        set.add(key);
    }
}
const t1 = performance.now();

// Method 2: Nested Map
const map = new Map<number, Map<number, Set<string>>>();
const t2 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    let tickMap = map.get(TICK_INDEX);
    if (!tickMap) {
        tickMap = new Map();
        map.set(TICK_INDEX, tickMap);
    }
    let trackSet = tickMap.get(TRACK_ID);
    if (!trackSet) {
        trackSet = new Set();
        tickMap.set(TRACK_ID, trackSet);
    }
    if (!trackSet.has(NOTE_ID)) {
        trackSet.add(NOTE_ID);
    }
}
const t3 = performance.now();

// Method 3: Nested Map (Optimized Lookup)
// Simulating if we hoist the tick lookup?
// In the real code, we iterate tracks/notes inside one tick.
// So we can look up tickMap ONCE.
const mapOpt = new Map<number, Map<number, Set<string>>>();
const t4 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    // Simulate outer loop finding tickMap once (amortized)
    // But here we just do it every time to be fair to Method 1 which does concat every time
    // But actually, Method 1 cannot hoist the concat.
    // Method 3: Logic as it would appear in the loop
    let tickMap = mapOpt.get(TICK_INDEX);
    if (!tickMap) {
        tickMap = new Map();
        mapOpt.set(TICK_INDEX, tickMap);
    }

    // Check
    const trackSet = tickMap.get(TRACK_ID);
    if (!trackSet || !trackSet.has(NOTE_ID)) {
         if (!trackSet) {
             const newSet = new Set<string>();
             newSet.add(NOTE_ID);
             tickMap.set(TRACK_ID, newSet);
         } else {
             trackSet.add(NOTE_ID);
         }
    }
}
const t5 = performance.now();


console.log(`String Key: ${(t1 - t0).toFixed(4)}ms`);
console.log(`Nested Map: ${(t3 - t2).toFixed(4)}ms`);
console.log(`Nested Map (Opt): ${(t5 - t4).toFixed(4)}ms`);
