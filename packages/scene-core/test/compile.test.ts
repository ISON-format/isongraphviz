// packages/scene-core/test/compile.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileScene, compileSceneFromText } from "../src/compile.js";
import { sha256Hex } from "../src/hash.js";
import { bytesOf, hex, igsErrorAsync, ORACLES } from "./helpers.js";

const enc = (s: string) => new TextEncoder().encode(s);

describe("compileScene against the frozen oracles", () => {
  it("O1 compiles to the frozen bytes and digests", async () => {
    const r = await compileScene(bytesOf("o1-basic.source.ison"), "ison-v1");
    expect(hex(r.sceneBytes)).toBe(hex(bytesOf("o1-basic.scene.json")));
    expect(r.sceneSha256).toBe("e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc");
    expect(r.artifactSha256).toBe("1e23b156a068aa5b7ffb5cc7c2e70e8ba5f9542ffe3e52f7c7f14c11bb9e030a");
  });

  it("O4 compiles to the frozen bytes (mirror pair collapsed, self-loop kept)", async () => {
    const r = await compileScene(bytesOf("o4-undirected.source.ison"), "ison-v1");
    expect(hex(r.sceneBytes)).toBe(hex(bytesOf("o4-undirected.scene.json")));
    expect(r.sceneSha256).toBe("13b1ede37d266246ef80082426eb3a08a9c24e164ac2e8bc44cb3ff2b2fa9b09");
  });

  it("O2 is rejected by the Core TS adapter: its INT64 extremes are not provably exact", async () => {
    const e = await igsErrorAsync(() => compileScene(bytesOf("o2-ids-ordering.source.ison"), "ison-v1"));
    expect(e.code).toBe("INEXACT_NODE_ID");
  });
});

describe("compileScene over the whole fixture table", () => {
  const rows = readFileSync(join(ORACLES, "fixtures/EXPECT.tsv"), "utf8").trim().split("\n").slice(1).map((l) => l.split("\t") as [string, string, string, string]);
  it("covers every fixture", () => expect(rows.length).toBe(23));
  for (const [file, verdict, code, reason] of rows) {
    it(`${file} -> ${verdict}${code === "-" ? "" : " " + code}`, async () => {
      const bytes = bytesOf(`fixtures/${file}`);
      if (verdict === "accept") {
        const r = await compileScene(bytes, "ison-v1");
        expect(r.sceneBytes.length).toBeGreaterThan(0);
      } else {
        const e = await igsErrorAsync(() => compileScene(bytes, "ison-v1"));
        expect(e.code).toBe(code);
        expect(e.reason).toBe(reason === "-" ? undefined : reason);
      }
    });
  }
});

describe("input handling", () => {
  it("rejects any profile other than ison-v1", async () => {
    const e = await igsErrorAsync(() => compileScene(enc("nodes.p\nid\n1\n"), "isonl-v1" as unknown as "ison-v1"));
    expect(e.code).toBe("UNSUPPORTED_SERIALIZATION_PROFILE");
  });

  it("treats empty, whitespace-only and comment-only sources as the valid empty graph", async () => {
    for (const t of ["", " \n\n", "# nothing\n"]) {
      const r = await compileScene(enc(t), "ison-v1");
      expect(r.scene.nodes).toEqual([]);
      expect(r.scene.edges).toEqual([]);
      expect(r.scene.graph.directed).toBe(true);
    }
    expect((await compileScene(enc(""), "ison-v1")).artifactSha256).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("maps garbage to PARSE_ERROR and a missing endpoint to INVALID_EDGE_ENDPOINT", async () => {
    expect((await igsErrorAsync(() => compileScene(enc("this is not ison"), "ison-v1"))).reason).toBe("PARSE_ERROR");
    expect((await igsErrorAsync(() => compileScene(enc("edges.R\nsource target\n:p:1 :p:2\n\nnodes.p\nid\n1\n"), "ison-v1"))).code).toBe("INVALID_EDGE_ENDPOINT");
  });

  it("maps a Core identifier violation to MALFORMED_SOURCE", async () => {
    const e = await igsErrorAsync(() => compileScene(enc('nodes.p\nid\n"a b"\n'), "ison-v1"));
    expect(e.code).toBe("MALFORMED_SOURCE");
  });

  it("changes artifact_sha256 for CRLF but not the node and edge set (byte exactness)", async () => {
    const lf = "nodes.p\nid\n1\n2\n\nedges.R\nsource target\n:p:1 :p:2\n";
    const a = await compileScene(enc(lf), "ison-v1");
    const b = await compileScene(enc(lf.replace(/\n/g, "\r\n")), "ison-v1");
    expect(b.artifactSha256).not.toBe(a.artifactSha256);
    expect(b.scene.nodes).toEqual(a.scene.nodes);
    expect(b.scene.edges).toEqual(a.scene.edges);
  });

  it("is independent of block and row order", async () => {
    const a = await compileScene(enc("nodes.p\nid\n1\n2\n\nedges.R\nsource target\n:p:1 :p:2\n"), "ison-v1");
    const b = await compileScene(enc("edges.R\nsource target\n:p:1 :p:2\n\nnodes.p\nid\n2\n1\n"), "ison-v1");
    expect(b.scene.nodes).toEqual(a.scene.nodes);
    expect(b.scene.edges).toEqual(a.scene.edges);
    expect(b.sceneSha256).not.toBe(a.sceneSha256); // the source hash differs, so the scene hash differs
  });

  it("is deterministic across repeated compiles", async () => {
    const x = await compileScene(bytesOf("o1-basic.source.ison"), "ison-v1");
    const y = await compileScene(bytesOf("o1-basic.source.ison"), "ison-v1");
    expect(y.sceneSha256).toBe(x.sceneSha256);
  });
});

describe("the input snapshot (a public async identity boundary)", () => {
  it("describes the bytes it was given, even if the caller mutates the array while the call is pending", async () => {
    const bytes = bytesOf("o1-basic.source.ison").slice(); // a plain Uint8Array copy
    const pending = compileScene(bytes, "ison-v1");
    bytes.fill(0x20); // the call has returned its promise but has not finished
    const r = await pending;
    expect(r.artifactSha256).toBe("1e23b156a068aa5b7ffb5cc7c2e70e8ba5f9542ffe3e52f7c7f14c11bb9e030a");
    expect(hex(r.sceneBytes)).toBe(hex(bytesOf("o1-basic.scene.json")));
    expect(r.sceneSha256).toBe("e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc");
  });

  it("accepts a Node Buffer and does not alias it", async () => {
    const buf = Buffer.from(bytesOf("o1-basic.source.ison"));
    const pending = compileScene(buf, "ison-v1");
    buf.fill(0);
    expect((await pending).artifactSha256).toBe("1e23b156a068aa5b7ffb5cc7c2e70e8ba5f9542ffe3e52f7c7f14c11bb9e030a");
  });

  it("rejects shared-memory and non-Uint8Array input with a TypeError, which is a caller error and not a scene error", async () => {
    await expect(compileScene(new Uint8Array(new SharedArrayBuffer(8)), "ison-v1")).rejects.toBeInstanceOf(TypeError);
    await expect(compileScene("nodes.p\nid\n1\n" as unknown as Uint8Array, "ison-v1")).rejects.toBeInstanceOf(TypeError);
  });
});

describe("typed ids through the whole compile path", () => {
  it("rejects float-spelled ids: a float is not an INT64, whatever it rounds to", async () => {
    for (const tok of ["1.0", "-0.0", "9007199254740993.0"]) {
      const e = await igsErrorAsync(() => compileScene(enc(`nodes.p\nid\n${tok}\n`), "ison-v1"));
      expect([e.code, e.reason], tok).toEqual(["INVALID_NODE_ID", "NOT_INT64_OR_STRING"]);
    }
  });

  it("reads -0 and 007 as the integers 0 and 7 and keeps quoted look-alikes as strings", async () => {
    const r = await compileScene(enc('nodes.p\nid\n-0\n007\n"1.0"\n"9007199254740993"\n"x007"\n'), "ison-v1");
    expect(r.scene.nodes.map((n) => n.ref.id)).toEqual(["i:0", "i:7", "s:1.0", "s:9007199254740993", "s:x007"]);
    expect(r.scene.nodes.map((n) => n.label)).toEqual(["0", "7", "1.0", "9007199254740993", "x007"]);
    const digits = await compileScene(enc('nodes.p\nid\n"007"\n"7"\n"-0"\n'), "ison-v1"); // digit strings of equal value, no integer: distinct string ids
    expect(digits.scene.nodes.map((n) => n.ref.id)).toEqual(["s:-0", "s:007", "s:7"]);
  });

  it("rejects 007 beside \"007\" in either order instead of letting Core's order-dependent twin check decide", async () => {
    for (const text of ['nodes.p\nid\n007\n"007"\n', 'nodes.p\nid\n"007"\n007\n']) {
      expect((await igsErrorAsync(() => compileScene(enc(text), "ison-v1"))).code, JSON.stringify(text)).toBe("ID_TWIN");
    }
  });

  it("resolves integer-looking reference text to the integer node and string reference text to the string node", async () => {
    const a = await compileScene(enc("nodes.p\nid\n7\n2\n\nedges.R\nsource target\n:p:007 :p:2\n"), "ison-v1");
    expect(a.scene.edges[0]!.ref.src.id).toBe("i:7");
    const b = await compileScene(enc('nodes.p\nid\n"9007199254740993"\n1\n\nedges.R\nsource target\n:p:9007199254740993 :p:1\n'), "ison-v1");
    expect(b.scene.edges[0]!.ref.src.id).toBe("s:9007199254740993");
  });

  it("does not read a float-spelled reference as an integer: Core reports a missing endpoint, a quoted node accepts it", async () => {
    const miss = await igsErrorAsync(() => compileScene(enc("nodes.p\nid\n1\n2\n\nedges.R\nsource target\n:p:1.0 :p:2\n"), "ison-v1"));
    expect(miss.code).toBe("INVALID_EDGE_ENDPOINT");
    const ok = await compileScene(enc('nodes.p\nid\n"1.0"\n2\n\nedges.R\nsource target\n:p:1.0 :p:2\n'), "ison-v1");
    expect(ok.scene.edges[0]!.ref.src.id).toBe("s:1.0");
  });
});

describe("compileSceneFromText (text convenience)", () => {
  it("hashes the UTF-8 encoding of the text", async () => {
    const text = "nodes.p\nid\né\n";
    const r = await compileSceneFromText(text, "ison-v1");
    expect(r.artifactSha256).toBe(await sha256Hex(enc(text)));
  });

  it("rejects a lone surrogate and a leading U+FEFF", async () => {
    expect((await igsErrorAsync(() => compileSceneFromText("nodes.p\nid\n\ud800\n", "ison-v1"))).reason).toBe("INVALID_ENCODING");
    expect((await igsErrorAsync(() => compileSceneFromText("﻿nodes.p\nid\n1\n", "ison-v1"))).reason).toBe("INVALID_ENCODING");
  });
});
