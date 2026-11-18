// scripts/smoke.mjs (Node 22 and 24; needs the built dists of display-list, renderer-svg and renderer-webgl): runs xr-ison.mjs's pipeline on three oracle sources
// and checks that XR-1 agrees (the double that lies, a readout derived from a report, is the test D06 of test/three-way.test.ts).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./xr-ison.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures", "oracles");
const fail = (m) => { console.error(`SMOKE FAIL: ${m}`); process.exit(1); };
for (const [file, layout] of [["o1-basic.source.ison", "force"], ["o1-basic.source.ison", "fixed"], ["o4-undirected.source.ison", "fixed"]]) {
  const r = await run(new Uint8Array(readFileSync(join(ROOT, file))), { layout });
  if (!r.identical || !r.cmp.agree) fail(`${file} (${layout}): XR-1 does not agree: ${JSON.stringify(r.cmp)}`);
  console.log(`ok ${file} (${layout}): XR-1 agree; svg ${r.sizes.svg}, list ${r.sizes.displayList}, stream ${r.sizes.canvasStream}, plan ${r.sizes.glPlan} bytes`);
}
console.log(`smoke ok on Node ${process.version}`);
