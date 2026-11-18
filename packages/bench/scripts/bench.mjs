// npm run bench / bench:smoke / bench:browser: the driver. Needs `npm run build` (the npm scripts do it).
//   node scripts/bench.mjs [--smoke] [--sizes S,M,L,20000,XL] [--shapes dag,hubs] [--reps N] [--warmup N] [--browser] [--out dir] ...
// Environment: BENCH_SIZES, BENCH_SHAPES, BENCH_REPS, BENCH_WARMUP, BENCH_BROWSER=1, BENCH_OUT, BENCH_SEED.
import { main } from "../dist/cli.js";

try { process.exitCode = await main(process.argv.slice(2), process.env); } catch (e) { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }
