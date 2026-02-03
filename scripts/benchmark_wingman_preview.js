
const ITERATIONS = 50;
const URL = 'http://localhost:3000/api/wingman/preview';

async function measure() {
    const times = [];

    // Warmup
    process.stdout.write('Warming up...');
    try {
        await fetch(URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'create-track', prompt: 'warmup' })
        });
        console.log(' Done.');
    } catch (e) {
        console.log(' Warmup failed (server might be starting), retrying...');
        await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`Running ${ITERATIONS} requests...`);

    for (let i = 0; i < ITERATIONS; i++) {
        const start = performance.now();
        try {
            await fetch(URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'create-track', prompt: 'test' })
            });
            const end = performance.now();
            times.push(end - start);
            process.stdout.write('.');
        } catch (e) {
            process.stdout.write('x');
        }
    }
    console.log('\n');

    times.sort((a, b) => a - b);
    const p50 = times[Math.floor(times.length * 0.5)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const avg = times.reduce((a, b) => a + b, 0) / times.length;

    console.log(`Results (${times.length} samples):`);
    console.log(`  Average: ${avg.toFixed(2)}ms`);
    console.log(`  P50:     ${p50.toFixed(2)}ms`);
    console.log(`  P95:     ${p95.toFixed(2)}ms`);
}

measure();
