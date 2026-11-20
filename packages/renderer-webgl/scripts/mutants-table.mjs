// The K table of design 13.5 for fixtures/oracles-gl (K01..K156: 156 mutants) as source patches. Every mutant is a list of exact-text patches applied to a
// SCRATCH COPY of packages/renderer-webgl/src ("gl"); production code has no switchable variants and the package's src/ is never modified (display-list is
// not copied: no mutant of this table lives there). A patch whose `find` text does not occur exactly `count` times is a harness error, so a refactoring of
// src/ cannot silently turn a mutant into a no-op. The mutations are this implementation's own realization of the one-line texts of the corpus table (13.5:
// "a mutant is one concrete change"); `heavy` names the heavy rows (kit runs) a mutant needs besides the ordinary rows.
const G = (file, find, replace, count = 1) => ({ pkg: "gl", file, find, replace, count });
const m = (id, desc, patches, heavy) => ({ id, desc, patches, ...(heavy ? { heavy } : {}) });

// the reader's rule switch: one line decides whether a rule runs; a mutant that "skips Gn" makes that rule never run
const ON = "const on = (rule: string): boolean => options.lenient !== true && !skipped.has(rule);";
const skip = (...rules) => G("read.ts", ON, `const on = (rule: string): boolean => ${rules.map((r) => `rule !== "${r}"`).join(" && ")} && options.lenient !== true && !skipped.has(rule);`);

const LAYERS = "  add(4, 0, arrowKept.length);\n  add(5, 0, d5.length); add(6, d5.length, d6.length); add(7, d5.length + d6.length, nodes.length);";
const CUR_ONE = "      if (insts.length === 0) { ce.push([pid, flags]); continue; }";
const BOX_OMIT = "      if (!meets(boxOf(q, EDGE_EXPAND), gb)) { ce.push([pid, flags]); continue; }";
const PREC_V = 'if (gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT)!.precision < 23) return no("NO_HIGHP");';
const PREC_F = 'if (gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)!.precision < 23) return no("NO_HIGHP");';
const ATTRS = 'if ((gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number) < 4) return no("TOO_FEW_ATTRIBS");';
const DIMS = 'if (mx < (need?.widthPx ?? 1) || my < (need?.heightPx ?? 1)) return no("TOO_SMALL");';
const RESTORE_DRAW = "        try { draw(); }\n        catch (e) {";
const ON_LOST_END = '    phase = "lost";\n    notify();\n  };';
const ON_RESTORED_FAIL = '        failure = token(c.error);\n        options.onError?.(c.error);\n        phase = "failed";\n        if (was !== "failed") notify();';

// the single-focus clause of G12 (design rev 5, 7.2) and the (failed, R) lost-again branch of the controller (7.6, A-40)
const FOC_LAYERS = "...byLayer[2]!, ...byLayer[6]!, ";
const FOC_CNCE = "...[...cn, ...ce].filter((e) => (e[1] & 2) !== 0).map((e) => e[0])";
const FOC_DECL = "const focused = new Set<number>([" + FOC_LAYERS + FOC_CNCE + "]);\n    ";
const FOC_THROW = 'if (focused.size > 1) throw fail("G12", "at most one element is focused");';
const LOST_AGAIN = '      } else if (was === "failed") {\n';

export const MUTANTS = [
  // ---- the plan encoding (G, B) --------------------------------------------------------------------------------------------------------------
  m("K01", "unclipped threshold `<=` 2^24 instead of `<`", [G("plan.ts", "if (q.every((v) => Math.abs(v) < F32_EXACT)) {", "if (q.every((v) => Math.abs(v) <= F32_EXACT)) {")]),
  m("K02", "coordinates as 8-byte floats", [G("plan.ts", "for (let k = 0; k < 8; k++) dv.setFloat32(o + 4 * k, f32(s.c[k]!), true);", "for (let k = 0; k < 8; k++) dv.setFloat64(o + 4 * k, f32(s.c[k]!), true);")]),
  m("K03", "big-endian", [G("plan.ts", "for (let k = 0; k < 8; k++) dv.setFloat32(o + 4 * k, f32(s.c[k]!), true);", "for (let k = 0; k < 8; k++) dv.setFloat32(o + 4 * k, f32(s.c[k]!), false);")]),
  m("K04", "`-0` written for zero", [G("plan.ts", "ddv.setFloat32(o, f32(s.n.x), true);", "ddv.setFloat32(o, s.n.x === 0 ? -0 : f32(s.n.x), true);")]),
  m("K05", "unused control points copy the end points", [G("plan.ts", "form === 0 ? [q[0]!, q[1]!, 0, 0, 0, 0, q[2]!, q[3]!]", "form === 0 ? [q[0]!, q[1]!, q[2]!, q[3]!, q[2]!, q[3]!, q[2]!, q[3]!]")]),
  m("K06", "pid written as the instance index", [G("plan.ts", "ddv.setUint32(o + 8, s.n.pid, true);", "ddv.setUint32(o + 8, i, true);")]),
  m("K07", "draws in the wrong layer order (rings before arrows)", [G("plan.ts", LAYERS, "  add(5, 0, d5.length); add(6, d5.length, d6.length);\n  add(4, 0, arrowKept.length);\n  add(7, d5.length + d6.length, nodes.length);")]),
  m("K08", "selected edges not duplicated in layer 1", [G("plan.ts", "const l1 = edgeLayer(1), l2 = edgeLayer(2), l3 = edgeLayer(0);", "const l1 = edgeLayer(1).slice(0, 0), l2 = edgeLayer(2), l3 = edgeLayer(0);")]),
  m("K09", "`halo-foc` style byte 0", [G("plan.ts", "style: flag === 1 ? 0 : flag === 2 ? 1 : 2 }", "style: flag === 1 ? 0 : flag === 2 ? 0 : 2 }")]),
  m("K10", "`kind` and `style` swapped", [G("plan.ts", "dv.setUint8(o + 36, s.kind);\n    dv.setUint8(o + 37, s.style);", "dv.setUint8(o + 36, s.style);\n    dv.setUint8(o + 37, s.kind);")]),
  m("K11", "`first` not cumulative", [G("plan.ts", "add(1, 0, l1.length); add(2, l1.length, l2.length); add(3, l1.length + l2.length, l3.length);", "add(1, 0, l1.length); add(2, 0, l2.length); add(3, 0, l3.length);")]),
  m("K12", "draws with `count` 0 emitted", [G("plan.ts", "if (count > 0) draws.push(", "draws.push(")]),
  m("K13", "arrow buffer emitted for an undirected graph", [G("plan.ts", "const arrowBuf = new Uint8Array(arrowKept.length * STRIDE.arrow);", "const arrowBuf = new Uint8Array((arrowKept.length + (list.directed ? 0 : 1)) * STRIDE.arrow);")]),
  m("K14", "ring `cat` non-zero", [G("plan.ts", "...d5.map((n) => ({ n, style: 0, cat: 0 })), ...d6.map((n) => ({ n, style: 1, cat: 0 }))", "...d5.map((n) => ({ n, style: 0, cat: n.kcls })), ...d6.map((n) => ({ n, style: 1, cat: n.kcls }))")]),
  m("K15", "header with spaces or unsorted keys", [G("plan.ts", "let text = canonicalJson(headerData(plan.header)) + \"\\n\";", "let text = JSON.stringify(headerData(plan.header), null, 1) + \"\\n\";")]),
  m("K16", "`sizes.arrow` and `sizes.disc` swapped", [G("plan.ts", "sizes: { arrow: arrowBuf.length, disc: discBuf.length, edge: edgeBuf.length }", "sizes: { arrow: discBuf.length, disc: arrowBuf.length, edge: edgeBuf.length }")]),
  m("K17", "buffers depend on the label options (renderer level)", [G("plan.ts", "const discBuf = new Uint8Array(discs.length * STRIDE.disc);", "const discBuf = new Uint8Array((list.records.some((r) => r[0] === \"T\") ? discs.length : 0) * STRIDE.disc);")]),
  m("K18", "`maxBytes` boundary exclusive", [G("plan.ts", "if (total > maxBytes) throw", "if (total >= maxBytes) throw")]),
  m("K19", "`maxBytes` boundary accepts one byte more", [G("plan.ts", "if (total > maxBytes) throw", "if (total > maxBytes + 1) throw")]),
  m("K20", "edge stride 36 or 44", [G("constants.ts", "edge: 40 } as const", "edge: 44 } as const")]),
  m("K21", "y written before x", [G("plan.ts", "ddv.setFloat32(o, f32(s.n.x), true);\n    ddv.setFloat32(o + 4, f32(s.n.y), true);", "ddv.setFloat32(o, f32(s.n.y), true);\n    ddv.setFloat32(o + 4, f32(s.n.x), true);")]),
  // ---- the strict reader ------------------------------------------------------------------------------------------------------------------------
  m("K22", "reader skips G1 (header keys, format, `seg`, `g`, `stride`)", [skip("G1")]),
  m("K23", "reader skips G2 (sizes, trailing bytes)", [skip("G2")]),
  m("K24", "reader skips G3 (multiple of the constant stride)", [skip("G3")]),
  m("K25", "reader skips G4 (layer order, program)", [skip("G4")]),
  m("K26", "reader skips G5 (bounds, contiguity)", [skip("G5")]),
  m("K27", "reader skips G6 (finite, `-0`, integer, bound)", [skip("G6")]),
  m("K28", "reader skips G7 (enum ranges, style equals layer)", [skip("G7")]),
  m("K29", "reader skips G8 (padding)", [skip("G8")]),
  m("K30", "reader skips G9 (pid >= 1)", [skip("G9")]),
  m("K31", "reader skips G10 (unused control points)", [skip("G10")]),
  m("K32", "reader skips G11 (pid order and repetition)", [skip("G11")]),
  m("K33", "reader skips G12 (subsets)", [skip("G12")]),
  // ---- the shader set ----------------------------------------------------------------------------------------------------------------------------
  m("K34", "one byte of a shader source changed", [G("shaders.ts", '"  p = p * 0.001;",', '"  p = p * 0.002;",')]),
  m("K35", "a TAB in a source", [G("shaders.ts", '"  o_color = vec4(u_ink * 0.6, 0.6);",', '"\\to_color = vec4(u_ink * 0.6, 0.6);",')]),
  m("K36", "`#extension` added", [G("shaders.ts", '"  o_color = vec4(u_ink * 0.6, 0.6);",', '"#extension GL_OES_standard_derivatives : enable",\n      "  o_color = vec4(u_ink * 0.6, 0.6);",')]),
  m("K37", "scene text concatenated into a source", [
    G("plan.ts", 'import { IgrError } from "isongraph-visualize-renderer-core";', 'import { IgrError } from "isongraph-visualize-renderer-core";\nimport { SHADER_SOURCES } from "./shaders.js";'),
    G("plan.ts", "  const maxBytes = resolveLimits(limits);", "  const maxBytes = resolveLimits(limits);\n  (SHADER_SOURCES.arrow as { vs: string }).vs += \"// \" + String(list.records.find((r) => r[0] === \"T\")?.[5] ?? \"\");"),
  ]),
  m("K38", "an attribute renamed", [G("shaders.ts", '"in vec2 a_b2;",', '"in vec2 a_b3;",')]),
  m("K39", "digest over the concatenation instead of the canonical JSON", [G("shaders.ts", "return utf8Encode(text + \"}\");", "return utf8Encode([\"arrow\", \"disc\", \"edge\"].map((k) => SHADER_SOURCES[k as \"arrow\"].vs + SHADER_SOURCES[k as \"arrow\"].fs).join(\"\"));")]),
  // ---- the executor -------------------------------------------------------------------------------------------------------------------------------
  m("K40", "programs created in the order `disc`, `edge`, `arrow`", [G("execute.ts", "    for (const p of PROGRAMS) {\n      const shaders: Created[] = [];", "    for (const p of [\"disc\", \"edge\", \"arrow\"] as const) {\n      const shaders: Created[] = [];")]),
  m("K41", "`deleteShader` missing", [G("execute.ts", "for (const s of shaders) { gl.deleteShader(s.handle); s.alive = false; }", "for (const s of shaders) { s.alive = false; }")]),
  m("K42", "blend function wrong", [G("execute.ts", "gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);", "gl.blendFunc(gl.ONE, gl.ONE);")]),
  m("K43", "`clearColor` not transparent", [G("execute.ts", "gl.clearColor(0, 0, 0, 0);", "gl.clearColor(0, 0, 0, 1);")]),
  m("K44", "attribute offset ignores `first`", [G("execute.ts", "const offset = d.first * STRIDE[p] + a.offset;", "const offset = a.offset;")]),
  m("K45", "attribute divisor 0", [G("execute.ts", "gl.vertexAttribDivisor(loc, 1);", "gl.vertexAttribDivisor(loc, 0);")]),
  m("K46", "`vertexAttribPointer` used for `a_meta`", [G("execute.ts", "if (a.int) gl.vertexAttribIPointer(", "if (a.int && false) gl.vertexAttribIPointer(")]),
  m("K47", "`u_ink` not divided by 255", [G("execute.ts", "gl.uniform3f(res.uInk, r / 255, g / 255, b / 255);", "gl.uniform3f(res.uInk, r, g, b);")]),
  m("K48", "`viewport` uses the plan's `w`, `h` instead of the frame's `widthPx`, `heightPx`", [G("execute.ts", "gl.viewport(0, 0, f.widthPx, f.heightPx);", "gl.viewport(0, 0, plan.header.w, plan.header.h);")]),
  m("K49", "buffers re-uploaded for every draw", [G("execute.ts", "    gl.bindBuffer(gl.ARRAY_BUFFER, res.buffer);\n    ATTRIBS[p].forEach", "    gl.bindBuffer(gl.ARRAY_BUFFER, res.buffer);\n    gl.bufferData(gl.ARRAY_BUFFER, plan.buffers[p], gl.DYNAMIC_DRAW);\n    ATTRIBS[p].forEach")]),
  m("K50", "`bindVertexArray(null)` missing", [G("execute.ts", "  gl.bindVertexArray(null);\n}", "}")]),
  m("K51", "an empty plan issues draws", [G("execute.ts", "for (const d of plan.header.draws) {", "for (const d of (plan.header.draws.length === 0 ? [{ layer: 3, first: 0, count: 0, program: \"edge\" as const }] : plan.header.draws)) {")]),
  m("K52", "edge vertex count 32 or 36", [G("constants.ts", "edge: 2 * (GL_SEG + 1) }", "edge: 2 * GL_SEG }")]),
  m("K53", "wrong primitive mode", [G("execute.ts", 'MODE[p] === "TRIANGLES" ? gl.TRIANGLES : gl.TRIANGLE_STRIP', 'MODE[p] === "TRIANGLES" ? gl.TRIANGLE_STRIP : gl.TRIANGLES')]),
  // ---- the controller ----------------------------------------------------------------------------------------------------------------------------
  m("K54", "no `preventDefault` on loss", [G("control.ts", "    event.preventDefault();\n", "")]),
  m("K55", "GL calls while lost", [G("control.ts", "    resources = undefined; // the handles are invalid: nothing is deleted\n", ""), G("control.ts", "    render(): void {\n      if (phase === \"ready\") draw();", "    render(): void {\n      if (phase === \"ready\" || phase === \"lost\") draw();")]),
  m("K56", "resources deleted on loss", [G("control.ts", "    resources = undefined; // the handles are invalid: nothing is deleted\n", "    if (resources) deleteGlResources(gl!, resources);\n    resources = undefined;\n")]),
  m("K57", "restore does not re-upload the plan", [G("control.ts", RESTORE_DRAW, "        try { if (plan !== undefined) options.labels?.draw(plan); }\n        catch (e) {")]),
  m("K58", "restore creates resources but draws no frame", [G("control.ts", RESTORE_DRAW, "        try { void 0; }\n        catch (e) {")]),
  m("K59", "listeners not removed on dispose", [G("control.ts", "      if (listening) {\n        canvas.removeEventListener", "      if (false && listening) {\n        canvas.removeEventListener")]),
  m("K60", "a commit while lost is dropped", [G("control.ts", "      plan = next;\n      if (phase === \"ready\") draw();", "      if (phase !== \"lost\") plan = next;\n      if (phase === \"ready\") draw();")]),
  m("K61", "loss emits a semantic event", [G("control.ts", ON_LOST_END, '    phase = "lost";\n    notify();\n    options.onError?.(new IgrError("INVALID_INPUT", "INVALID_VALUE", "gl", "LOSS"));\n  };')]),
  m("K62", "a failed restore throws", [G("control.ts", ON_RESTORED_FAIL, '        failure = token(c.error);\n        options.onError?.(c.error);\n        phase = "failed";\n        if (was !== "failed") notify();\n        throw c.error;')]),
  m("K63", "a compile failure ignored", [G("execute.ts", "if (!ok) throw failure(\"COMPILE_FAILED\"", "if (false) throw failure(\"COMPILE_FAILED\"")]),
  // ---- the probe ------------------------------------------------------------------------------------------------------------------------------------
  m("K64", "probe reasons confused", [
    G("probe.ts", 'if (typeof factory !== "function") return no("NO_FACTORY");', 'if (typeof factory !== "function") return no("NO_CONTEXT");'),
    G("probe.ts", 'if (a === undefined) return no("NO_FACTORY");', 'if (a === undefined) return no("NO_CONTEXT");'),
    G("probe.ts", 'if (relaxed === null || relaxed === undefined) return no("NO_CONTEXT");', 'if (relaxed === null || relaxed === undefined) return no("PERFORMANCE_CAVEAT");'),
    G("probe.ts", "      return no(\"PERFORMANCE_CAVEAT\");", "      return no(\"NO_CONTEXT\");"),
  ]),
  m("K65", "probe reads the unmasked renderer or any extension but `WEBGL_lose_context`", [G("probe.ts", "    contexts.push(gl);\n", "    contexts.push(gl);\n    gl.getExtension(\"WEBGL_debug_renderer_info\");\n")]),
  m("K66", "probe skips the 2D layer check", [G("probe.ts", 'if (c.getContext("2d") === null) return no("NO_2D_LAYER");', 'if (c.getContext("2d") === 0) return no("NO_2D_LAYER");')]),
  m("K67", "`failIfMajorPerformanceCaveat` false in the constants", [G("probe.ts", "    failIfMajorPerformanceCaveat,\n  };", "    failIfMajorPerformanceCaveat: false,\n  };")]),
  m("K68", "witness reads `probe()` instead of the plan", [G("subject.ts", "return glWitness((plan as () => GlPlan).call(r)) as WitnessReport;", "{ const d = r.probe().drawn; void plan; return { backend: \"igr-gl/1\", elements: { nodes: d.nodes, edges: d.edges }, texts: [] } as unknown as WitnessReport; }")], ["U11"]),
  m("K69", "manifest differs from the renderer's", [G("renderer.ts", "const manifest = buildManifest(host, r);", "const manifest = buildManifest(host, { ...r, capacity: { ...r.capacity, maxDrawnLabelUnits: 262144 } });")], ["U12"]),
  m("K70", "`x-gl.context-recovery` supported on the headless host", [G("manifest.ts", '"x-gl.context-recovery": gpu,', '"x-gl.context-recovery": SUPPORTED,')]),
  m("K71", "`readoutFromGl` takes label addresses from the table at pid - 2", [G("readout.ts", "labelNodes.push({ address: nodeAt(pid), text: t[5] });", "labelNodes.push({ address: plan.nodes[pid - 2]!, text: t[5] });")]),
  m("K72", "`nodes_far` domain `<=` instead of `<`", [G("readout.ts", "nodes: nodePids.map((pid) => { const c = a.nodes.get(pid); return { address: nodeAt(pid), x: c === undefined ? Infinity : c.x, y: c === undefined ? Infinity : c.y }; }),", "nodes: nodePids.map((pid) => { const c = a.nodes.get(pid); return { address: nodeAt(pid), x: c === undefined || c.x === -256000 || c.x === 1000 * plan.header.w + 256000 ? Infinity : c.x, y: c === undefined ? Infinity : c.y }; }),")]),
  m("K73", "`readoutFromGl` reads node marks from the wrong layers", [G("readout.ts", "if (layerAt === 5) a.selectedNodes.add(pid); else if (layerAt === 6) a.focusedNodes.add(pid);", "if (layerAt === 6) a.selectedNodes.add(pid); else if (layerAt === 5) a.focusedNodes.add(pid);")]),
  m("K74", "`readoutFromGl` ignores the `flags` of `cn`/`ce` entries (a culled selected node loses its mark)", [G("readout.ts", "    if (flags & 1) a.selectedNodes.add(pid);\n    if (flags & 2) a.focusedNodes.add(pid);\n", "")]),
  m("K75", "`u_view` taken from the frame instead of the plan header", [G("execute.ts", "gl.uniform2f(res.uView, plan.header.w, plan.header.h);", "gl.uniform2f(res.uView, f.widthPx, f.heightPx);")]),
  m("K76", "`uniform3f` ink channels in the wrong order", [G("execute.ts", "gl.uniform3f(res.uInk, r / 255, g / 255, b / 255);", "gl.uniform3f(res.uInk, b / 255, g / 255, r / 255);")]),
  m("K77", "probe leaves its GL context unreleased", [G("probe.ts", "  while (contexts.length > 0) {", "  while (contexts.length > 0 && false) {")]),
  m("K78", "probe precedence changed (`TOO_SMALL` before `NO_HIGHP`)", [G("probe.ts", "    " + PREC_V, "    { const d0 = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as ArrayLike<number>; if (Number(d0[0]) < (need?.widthPx ?? 1) || Number(d0[1]) < (need?.heightPx ?? 1)) return no(\"TOO_SMALL\"); }\n    " + PREC_V)]),
  m("K79", "probe asks one canvas for both context types", [G("probe.ts", "    const c = make();\n", "    const c = a;\n")]),
  m("K80", "a throwing factory or `getParameter` escapes the probe", [G("probe.ts", '  } catch {\n    return no("PROBE_ERROR");\n  } finally {', "  } catch (e) {\n    throw e;\n  } finally {")]),
  m("K81", "vertex-stage precision not checked", [G("probe.ts", PREC_V, "gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT);")]),
  m("K82", "`MAX_VIEWPORT_DIMS` not checked", [G("probe.ts", DIMS, 'if (false) return no("TOO_SMALL");')]),
  m("K83", "no relaxed retry: `PERFORMANCE_CAVEAT` reported as `NO_CONTEXT`", [G("probe.ts", 'if (!caveat) return no("NO_CONTEXT");', 'if (true) return no("NO_CONTEXT");')]),
  // ---- the guard rule ----------------------------------------------------------------------------------------------------------------------------------
  m("K84", "guard margin 128000 instead of 256000", [
    G("plan.ts", 'import { GUARD_MARGIN, buildPickBuffer } from "isongraph-visualize-display-list";', 'import { buildPickBuffer } from "isongraph-visualize-display-list";\nconst GUARD_MARGIN = 128_000;'),
    G("read.ts", 'if (hd["g"] !== 256000) throw fail("G1", "g must be 256000");', 'if (hd["g"] !== 128000) throw fail("G1", "g must be 256000");'),
  ]),
  m("K85", "clip intersection with `floorDiv` instead of `divRound`", [G("clip.ts", 'import { divRound } from "./bytes.js";', 'import { floorDiv as divRound } from "./bytes.js";')]),
  m("K86", "clip does not reject a parallel segment outside (`p = 0`, `q < 0`)", [G("clip.ts", "if (q < 0n) return undefined;\n      continue;", "continue;")]),
  m("K87", "edge inclusion expansion 6000 instead of 12000", [G("constants.ts", "export const EDGE_EXPAND = 12_000;", "export const EDGE_EXPAND = 6_000;")]),
  m("K88", "node inclusion without the 22000 expansion", [G("constants.ts", "export const NODE_EXPAND = 22_000;", "export const NODE_EXPAND = 0;")]),
  m("K89", "omitted edges and nodes not listed in `ce`/`cn`", [G("plan.ts", "ce.push([pid, flags]);", "void flags;", 2), G("plan.ts", "cn.push([r[1], r[3] as number]);", "void r;")]),
  m("K90", "`flags` lost in `cn`/`ce`", [G("plan.ts", "ce.push([pid, flags]);", "ce.push([pid, 0]);", 2), G("plan.ts", "cn.push([r[1], r[3] as number]);", "cn.push([r[1], 0]);")]),
  m("K91", "a far arrow is kept (coordinates beyond `2^24`)", [G("plan.ts", "arrows.filter((a) => emitted.has(a.pid) && meets(boxOf(a.v, 0), gb))", "arrows.filter((a) => emitted.has(a.pid))")]),
  m("K92", "a clipped curve kept as a kind-1 or kind-2 instance with far control points", [G("plan.ts", "if (q.every((v) => Math.abs(v) < F32_EXACT)) {", "if (form !== 0 || q.every((v) => Math.abs(v) < F32_EXACT)) {")]),
  m("K93", "clip to the viewport instead of the guard box", [G("plan.ts", "[p[i + 2]!, p[i + 3]!], w, h, GUARD_MARGIN);", "[p[i + 2]!, p[i + 3]!], w, h, 0);")]),
  m("K94", "the arrow of an edge omitted by the box test is emitted without the guard test", [
    G("plan.ts", "  const emitted = new Set<number>();", "  const emitted = new Set<number>();\n  const boxOmitted = new Set<number>();"),
    G("plan.ts", BOX_OMIT, "      if (!meets(boxOf(q, EDGE_EXPAND), gb)) { boxOmitted.add(pid); ce.push([pid, flags]); continue; }"),
    G("plan.ts", "arrows.filter((a) => emitted.has(a.pid) && meets(boxOf(a.v, 0), gb))", "arrows.filter((a) => (emitted.has(a.pid) && meets(boxOf(a.v, 0), gb)) || boxOmitted.has(a.pid))"),
  ]),
  m("K95", "text section missing or reordered in the plan", [G("plan.ts", 'for (const t of plan.texts) text += canonicalJson(t) + "\\n";', 'for (const t of [...plan.texts].reverse()) text += canonicalJson(t) + "\\n";')]),
  m("K96", "element table order wrong in the plan", [G("plan.ts", 'for (const n of plan.nodes) text += canonicalJson(["n", n]) + "\\n";', 'for (const n of [...plan.nodes].reverse()) text += canonicalJson(["n", n]) + "\\n";')]),
  // ---- the controller, continued ---------------------------------------------------------------------------------------------------------------
  m("K97", "loss during the restore rebuild ends in `failed`", [G("control.ts", '      } else if (was === "failed") {\n        failure = undefined;\n        phase = "lost";\n        notify();\n      }', '      } else {\n        failure = "CONTEXT_LOST";\n        phase = "failed";\n        notify();\n      }')]),
  m("K98", "a double loss changes the status", [G("control.ts", 'if (phase === "lost") return; // a double loss: no status change', 'if (phase === "lost") { notify(); return; }')]),
  m("K99", "a restore while `ready` rebuilds the resources", [G("control.ts", 'if (phase !== "lost" && phase !== "failed") return; // a restore without a loss is ignored', 'if (phase !== "lost" && phase !== "failed" && phase !== "ready") return;')]),
  m("K100", "`failed` never retries on a restore", [G("control.ts", 'if (phase !== "lost" && phase !== "failed") return; // a restore without a loss is ignored', 'if (phase !== "lost") return;')]),
  m("K101", "`dispose` in `lost` issues delete calls", [G("control.ts", '      if (phase === "ready") {\n        deleteGlResources(gl!, resources!);', '      if (phase === "ready" || phase === "lost") {\n        deleteGlResources(gl!, resources!);')]),
  m("K102", "`dispose` in `ready` omits `loseContext`", [G("control.ts", "        releaseGlContext(gl!);\n      } else if", "      } else if")]),
  m("K103", "cleanup after a failed creation not in reverse order", [G("execute.ts", "for (let i = created.length - 1; i >= 0; i--) {", "for (let i = 0; i < created.length; i++) {")]),
  m("K104", "failure `detail` carries more than 120 characters of the info log", [G("execute.ts", "log.slice(0, 120)", "log.slice(0, 200)")]),
  m("K105", "the label canvas is not cleared on loss", [G("control.ts", 'if (was === "ready") options.labels?.clear();', "")]),
  m("K106", "labels are drawn while lost", [G("control.ts", "      plan = next;\n      if (phase === \"ready\") draw();", "      plan = next;\n      if (phase === \"lost\") options.labels?.draw(plan);\n      if (phase === \"ready\") draw();")]),
  m("K107", "loss and restore not reported through `onStatus`", [G("control.ts", ON_LOST_END, '    phase = "lost";\n  };')]),
  m("K108", "`contextAttributes` ignored", [G("control.ts", "const caveat = resolveCaveat(options.contextAttributes);", "resolveCaveat(options.contextAttributes);\n  const caveat = true;")]),
  m("K109", "probe contexts not released at `initialize`", [G("probe.ts", "    releaseAll(contexts);\n    const c = make();", "    const c = make();")]),
  m("K110", "the info log is read before the status check", [G("execute.ts", "        gl.compileShader(s.handle);\n", "        gl.compileShader(s.handle);\n        gl.getShaderInfoLog(s.handle);\n")]),
  m("K111", "`textCalls()` differs from the Canvas layer-8 stream", [G("renderer.ts", "{ layers: [8], dprMilli: r.dprMilli, ink: r.ink }", "{ layers: [], dprMilli: r.dprMilli, ink: r.ink }")]),
  m("K112", "an arrow is emitted for an edge whose polyline was clipped away", [
    G("plan.ts", "  const emitted = new Set<number>();", "  const emitted = new Set<number>();\n  const clippedAway = new Set<number>();"),
    G("plan.ts", CUR_ONE, "      if (insts.length === 0) { clippedAway.add(pid); ce.push([pid, flags]); continue; }"),
    G("plan.ts", "arrows.filter((a) => emitted.has(a.pid) && meets(boxOf(a.v, 0), gb))", "arrows.filter((a) => (emitted.has(a.pid) || clippedAway.has(a.pid)) && meets(boxOf(a.v, 0), gb))"),
  ]),
  m("K113", "reader skips G13 (table counts and pid ranges)", [skip("G13")]),
  m("K114", "reader skips G14 (text lines)", [skip("G14")]),
  m("K115", "reader skips G15 (`cn`, `ce` rules)", [skip("G15")]),
  m("K116", "reader skips G16 (pid accounting)", [skip("G16")]),
  m("K117", "fragment-stage precision not checked", [G("probe.ts", PREC_F, "gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);")]),
  m("K118", "`MAX_VERTEX_ATTRIBS` not checked", [G("probe.ts", ATTRS, "gl.getParameter(gl.MAX_VERTEX_ATTRIBS);")]),
  m("K119", "`readoutFromGl` accepts a pid outside the table", [G("readout.ts", "if (pid < 1 || pid > nd || pid > plan.nodes.length) throw bad(", "if (false) throw bad("), G("readout.ts", "if (pid < nd + 1 || pid > nd + ed || pid - nd > plan.edges.length) throw bad(", "if (false) throw bad(")]),
  m("K120", "`readoutFromGl` takes `arrows` from layer 4 instead of the header's `d`", [
    G("readout.ts", "if (r !== undefined) edgePid(r.pid);", "if (r !== undefined) { edgePid(r.pid); a.arrows.add(r.pid); }"),
    G("readout.ts", "arrows: plan.header.d === 1 ? edgePids.map(edgeAt) : [],", "arrows: [...a.arrows].sort((x, y) => x - y).map(edgeAt),"),
  ]),
  m("K121", "a zero-length buffer is uploaded", [G("execute.ts", "    if (bytes.length === 0) continue;\n", "")]),
  m("K122", "the probe ignores `options.failIfMajorPerformanceCaveat`", [G("probe.ts", "const caveat = opt ?? true;", "const caveat = true;")]),
  m("K123", "the probe leaves a context unreleased on the `NO_HIGHP` return", [G("probe.ts", PREC_V, 'if (gl.getShaderPrecisionFormat(gl.VERTEX_SHADER, gl.HIGH_FLOAT)!.precision < 23) { contexts.length = 0; return no("NO_HIGHP"); }')]),
  m("K124", "the adapter rejects `PERFORMANCE_CAVEAT` although the option is false", [G("control.ts", "{ failIfMajorPerformanceCaveat: caveat });\n        if (!p.available) {", "{ failIfMajorPerformanceCaveat: true });\n        if (!p.available) {")]),
  m("K125", "`init` while `ready` re-creates the resources", [G("control.ts", 'if (phase !== "created") return; // the renderer', 'if (phase !== "created" && phase !== "ready") return; // the renderer')]),
  m("K126", "`dispose` in `failed` omits `loseContext`", [G("control.ts", '(phase === "failed" || phase === "created") && gl !== undefined', '(phase === "created") && gl !== undefined')]),
  m("K127", "`dispose` after a failed `initialize` omits `loseContext`", [G("control.ts", '(phase === "failed" || phase === "created") && gl !== undefined', '(phase === "failed") && gl !== undefined')]),
  m("K128", "`onStatus` emitted before `onError`", [G("control.ts", ON_RESTORED_FAIL, '        failure = token(c.error);\n        phase = "failed";\n        if (was !== "failed") notify();\n        options.onError?.(c.error);')]),
  m("K129", "`x-gl.executes` supported on the headless host", [G("manifest.ts", '"x-gl.executes": gpu,', '"x-gl.executes": SUPPORTED,')]),
  // ---- K130-K156: the rev 5 gap rows (single-focus clause of G12, the readout of omitted flags, the guard flags, the controller outcomes of A-40) -----------------
  m("K130", "G12 single-focus clause counts the layer-2 and layer-6 pids only (cn/ce flags ignored)", [G("read.ts", FOC_CNCE, "...[]")]),
  m("K131", "G12 single-focus clause counts the cn/ce entries with the focus bit only (layers 2 and 6 ignored)", [G("read.ts", "new Set<number>([" + FOC_LAYERS, "new Set<number>([")]),
  m("K132", "G12 allows one focused pid in layer 2 and one in layer 6 separately (cn/ce flags ignored)", [G("read.ts", FOC_DECL + FOC_THROW, 'const focused2 = new Set<number>(byLayer[2]!), focused6 = new Set<number>(byLayer[6]!);\n    if (focused2.size > 1 || focused6.size > 1) throw fail("G12", "at most one element is focused");')]),
  m("K133", "G12 counts instances instead of distinct pids (a clipped focused edge counts per instance)", [G("read.ts", "const focused = new Set<number>([", "const focused: number[] = (["), G("read.ts", "if (focused.size > 1) throw fail(", "if (focused.length > 1) throw fail(")]),
  m("K134", "G12 counts every cn/ce entry with a non-zero flags value (a selected omitted element is a focus)", [G("read.ts", "...[...cn, ...ce].filter((e) => (e[1] & 2) !== 0)", "...[...cn, ...ce].filter((e) => e[1] !== 0)")]),
  m("K135", "G12 counts the cn entries with the focus bit but not the ce entries", [G("read.ts", "...[...cn, ...ce].filter((e) => (e[1] & 2) !== 0)", "...[...cn].filter((e) => (e[1] & 2) !== 0)")]),
  m("K136", "reader has the subset clauses of G12 but not the single-focus clause", [G("read.ts", "if (focused.size > 1) throw fail(", "if (false) throw fail(")]),
  m("K137", "readoutFromGl takes the focus from the layers 2 and 6 only (the flags of omitted entries ignored)", [
    G("readout.ts", "    if (flags & 2) a.focusedNodes.add(pid);\n", ""),
    G("readout.ts", "    if (flags & 2) a.focusedEdges.add(pid);\n", ""),
  ]),
  m("K138", "readoutFromGl swaps the selected and focused bits of the omitted entries", [
    G("readout.ts", "    if (flags & 1) a.selectedNodes.add(pid);\n    if (flags & 2) a.focusedNodes.add(pid);\n", "    if (flags & 2) a.selectedNodes.add(pid);\n    if (flags & 1) a.focusedNodes.add(pid);\n"),
    G("readout.ts", "    if (flags & 1) a.selectedEdges.add(pid);\n    if (flags & 2) a.focusedEdges.add(pid);\n", "    if (flags & 2) a.selectedEdges.add(pid);\n    if (flags & 1) a.focusedEdges.add(pid);\n"),
  ]),
  m("K139", "the guard rule writes the flags of an omitted element without the focus bit", [G("plan.ts", "ce.push([pid, flags]);", "ce.push([pid, flags & 1]);", 2), G("plan.ts", "cn.push([r[1], r[3] as number]);", "cn.push([r[1], (r[3] as number) & 1]);")]),
  m("K140", "controller (failed, R) with the context lost again ends in phase failed instead of lost", [G("control.ts", LOST_AGAIN + '        failure = undefined;\n        phase = "lost";', LOST_AGAIN + '        failure = undefined;\n        phase = "failed";')]),
  m("K141", "controller (failed, R) lost again keeps the failure token", [G("control.ts", LOST_AGAIN + "        failure = undefined;\n", LOST_AGAIN)]),
  m("K142", "controller deletes the created objects when the restore is lost again", [
    G("execute.ts", "    if (gl.isContextLost()) return;\n    for (let i = created.length - 1; i >= 0; i--) {", "    for (let i = created.length - 1; i >= 0; i--) {"),
    G("execute.ts", 'e.detail?.startsWith("CONTEXT_LOST") === true) throw e;\n    cleanup();', 'e.detail?.startsWith("CONTEXT_LOST") === true) { cleanup(); throw e; }\n    cleanup();'),
  ]),
  m("K143", "controller (failed, R) lost again does not call onStatus", [G("control.ts", LOST_AGAIN + '        failure = undefined;\n        phase = "lost";\n        notify();', LOST_AGAIN + '        failure = undefined;\n        phase = "lost";')]),
  m("K144", "controller (failed, R) second usable failure calls onStatus though the phase stays failed", [G("control.ts", '        options.onError?.(c.error);\n        phase = "failed";\n        if (was !== "failed") notify();', '        options.onError?.(c.error);\n        phase = "failed";\n        notify();')]),
  m("K145", "controller (failed, R) second usable failure keeps the old failure token", [G("control.ts", "        failure = token(c.error);\n", '        if (was !== "failed") failure = token(c.error);\n')]),
  m("K146", "controller (failed, R) second usable failure does not call onError", [G("control.ts", "        options.onError?.(c.error);\n", '        if (was !== "failed") options.onError?.(c.error);\n')]),
  m("K147", "dispose in created releases the context although it is lost", [G("control.ts", "&& gl !== undefined && !lost()) releaseGlContext(gl);", "&& gl !== undefined) releaseGlContext(gl);")]),
  m("K148", 'dispose in created decides the release from a cached "was ever lost" flag, not from the context', [
    G("control.ts", "  let listening = false;\n", "  let listening = false;\n  let everLost = false;\n"),
    G("control.ts", "  const onLost = (event: GlEventLike): void => {\n", "  const onLost = (event: GlEventLike): void => {\n    everLost = true;\n"),
    G("control.ts", "&& gl !== undefined && !lost()) releaseGlContext(gl);", "&& gl !== undefined && !everLost) releaseGlContext(gl);"),
  ]),
  m("K149", "a loss event in created calls preventDefault", [G("control.ts", '    if (phase === "created" || phase === "disposed") return;\n    event.preventDefault();', '    if (phase === "disposed") return;\n    event.preventDefault();\n    if (phase === "created") return;')]),
  m("K150", "initialize does not draw a plan retained before it", [G("control.ts", "      try { draw(); }\n      catch (e) {", "      try { void draw; }\n      catch (e) {")]),
  m("K151", "a restore with no retained plan logs a label draw", [G("control.ts", "    if (plan === undefined || gl === undefined || resources === undefined) return;\n", "    if (gl === undefined || resources === undefined) return;\n    if (plan === undefined) { options.labels?.draw(plan as never); return; }\n")]),
  m("K152", "a commit in failed does not store the plan (the restore draws an older one)", [G("control.ts", '      plan = next;\n      if (phase === "ready") draw();', '      if (phase !== "failed") plan = next;\n      if (phase === "ready") draw();')]),
  m("K153", "a loss out of failed clears the label canvas again", [G("control.ts", 'if (was === "ready") options.labels?.clear();', 'if (was === "ready" || was === "failed") options.labels?.clear();')]),
  m("K154", "initialize in lost or failed adds the listeners again", [G("control.ts", 'if (phase !== "created") return; // the renderer', 'if (phase !== "created") { if (phase === "lost" || phase === "failed") { canvas.addEventListener("webglcontextlost", onLost); canvas.addEventListener("webglcontextrestored", onRestored); } return; } // the renderer')]),
  m("K155", "a second dispose removes the listeners again", [G("control.ts", 'if (phase === "disposed") return;\n      if (phase === "ready") {', 'if (phase === "disposed") { canvas.removeEventListener("webglcontextlost", onLost); canvas.removeEventListener("webglcontextrestored", onRestored); return; }\n      if (phase === "ready") {')]),
  m("K156", "render() in ready draws the frame but not the labels", [
    G("control.ts", "  let listening = false;\n", "  let listening = false;\n  let framesOnly = false;\n"),
    G("control.ts", "      options.labels?.draw(plan);\n", "      if (!framesOnly) options.labels?.draw(plan);\n"),
    G("control.ts", '    render(): void {\n      if (phase === "ready") draw();', '    render(): void {\n      if (phase === "ready") { framesOnly = true; try { draw(); } finally { framesOnly = false; } }'),
  ]),
];
