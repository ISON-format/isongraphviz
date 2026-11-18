// The child process of one workload (spawned by dist/cli.js with --expose-gc and a larger heap). Not run by hand.
import { workerMain } from "../dist/worker.js";
await workerMain(process.argv.slice(2));
