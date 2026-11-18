// Runs vitest from an UPPER-case drive letter. A Windows shell can start with a lower-case one (d:\...); Vite then sees every file under two
// spellings, loads `vitest` twice and each test file fails with "Cannot read properties of undefined (reading 'config')". Environmental
// (Windows path case + Vite module identity), not a defect of this package; this wrapper is the workaround.
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const cwd = process.cwd().replace(/^[a-z]:/, (d) => d.toUpperCase());
const r = spawnSync(process.execPath, [join(cwd, "node_modules", "vitest", "vitest.mjs"), ...process.argv.slice(2)], { stdio: "inherit", cwd });
process.exit(r.status ?? 1);
