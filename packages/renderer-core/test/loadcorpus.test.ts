// Audit minor 8: frozen files reached through ../oracles* are hashed against their own corpus's SHA256SUMS when it lists them.
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCorpus } from "../src/conformance/node.js";
import { errOfAsync } from "./helpers.js";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
function make(foreignText: string, listedAs: string): string {
  const root = mkdtempSync(join(tmpdir(), "igr-corpus-"));
  mkdirSync(join(root, "igr")); mkdirSync(join(root, "foreign"));
  writeFileSync(join(root, "foreign", "a.scene.json"), foreignText);
  writeFileSync(join(root, "foreign", "SHA256SUMS"), `${sha(listedAs)}  a.scene.json\n`);
  writeFileSync(join(root, "igr", "EXPECT.tsv"), "id\tgroup\ttier\tscene\tlayout\tinput\texpected\terror\nM01\tM\tcore\t../foreign/a.scene.json\t\t\t\t\n");
  writeFileSync(join(root, "igr", "x.txt"), "x");
  writeFileSync(join(root, "igr", "SHA256SUMS"), `${sha("x")}  x.txt\n`);
  return join(root, "igr");
}
describe("loadCorpus and foreign files", () => {
  it("an unedited frozen file is accepted; an edited one is CHECKSUM_MISMATCH", async () => {
    expect((await loadCorpus(make("scene", "scene"))).files.has("../foreign/a.scene.json")).toBe(true);
    expect(await errOfAsync(() => loadCorpus(make("scene edited", "scene")))).toBe("INVALID_CORPUS/CHECKSUM_MISMATCH");
  });
});
