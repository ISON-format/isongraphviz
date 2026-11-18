// Audit I-1 with a REAL over-limit input and NO explicit option: a scene inside the dom capacity (2,000 nodes) whose document is about 9 MB is refused
// by the adapter's own default of 8 MiB at loadScene, exactly as its svg() refuses it, and nothing is mounted.
import { describe, expect, it } from "vitest";
import { createDomSvgRenderer } from "../../src/dom/index.js";
import { createSvgRenderer } from "../../src/index.js";
import { bigIdModel } from "../gen.js";
import { errOf, errOfAsync } from "../helpers.js";

class El {
  nodeType = 1;
  ownerDocument: unknown;
  children: El[] = [];
  parentNode: El | null = null;
  style = { cursor: "" };
  attrs = new Map<string, string>();
  constructor(owner: unknown) { this.ownerDocument = owner; }
  get childNodes(): El[] { return this.children; }
  appendChild(n: El): El { n.parentNode = this; this.children.push(n); return n; }
  removeChild(n: El): El { this.children = this.children.filter((c) => c !== n); return n; }
  addEventListener(): void { /* none */ }
  removeEventListener(): void { /* none */ }
  getElementById(): null { return null; }
  createElement(): El { return new El(this.ownerDocument); }
  setAttribute(k: string, v: string): void { this.attrs.set(k, v); }
}

describe("dom adapter default limits", () => {
  it("a ~9 MB document is refused at loadScene by the default 8 MiB and by svg() alike; nothing is mounted", async () => {
    const model = await bigIdModel(1990, 1022);
    const doc = new El(null);
    doc.ownerDocument = doc;
    const host = new El(doc);
    const r = createDomSvgRenderer(); // no explicit option
    await r.initialize({ host, size: { width: 900, height: 600 }, reducedMotion: false } as never);
    expect(await errOfAsync(() => r.loadScene(model))).toBe("RESOURCE_LIMIT/BYTES_LIMIT");
    expect(host.children.map((c) => c.attrs.get("role"))).toEqual(["status"]); // only the status line: no document mounted
    expect(errOf(() => r.svg())).toBe("RESOURCE_LIMIT/BYTES_LIMIT"); // svg() agrees
    // the headless default (64 MiB) renders the very same scene: the document really is over 8 MiB
    const h = createSvgRenderer();
    await h.initialize({ host: "headless", size: { width: 900, height: 600 }, reducedMotion: false });
    await h.loadScene(model);
    expect(h.svg().length).toBeGreaterThan(8 * 1024 * 1024);
  });
});
