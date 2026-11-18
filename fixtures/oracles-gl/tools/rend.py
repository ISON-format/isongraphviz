"""The WebGL renderer object, headless host (7.8): options, manifest, lifecycle, plan access, probe fidelity, witness.

A small simulation of the renderer-core lifecycle (27 section 9) that is just enough for the U rows.
"""
import json
import re

import cvs
import dlist
import ju
import mut
import plan as P
import scn
from scn import Err

MANDATORY = ["scene.load", "viewport", "hit-test", "selection", "focus", "visibility", "labels", "direction-cue", "indicators.non-color",
             "a11y.model", "state.report", "lifecycle"]
OPTIONAL = ["export.scene", "export.svg", "export.png", "a11y.native-dom", "a11y.companion-dom", "labels.edge", "motion.animated"]
DEGRADATIONS = ["LABELS_ELIDED", "EDGE_LABELS_OMITTED", "EDGE_STYLE_SIMPLIFIED"]
VISUAL = ["labels", "direction-cue", "indicators.non-color"]
NODEFAULT = object()


# ---------------------------------------------------------------- option validation

def _num(v, lo=None, hi=None):
    """27 section 15 classes: SCHEMA / NOT_FINITE / INVALID_VALUE / OUT_OF_RANGE"""
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise Err("INVALID_INPUT", "SCHEMA")
    if isinstance(v, float):
        if v != v or v in (float("inf"), float("-inf")):
            raise Err("INVALID_INPUT", "NOT_FINITE")
        if v != int(v):
            raise Err("INVALID_INPUT", "INVALID_VALUE")
        v = int(v)
    if lo is not None and not (lo <= v <= hi):
        raise Err("INVALID_INPUT", "OUT_OF_RANGE")
    return v


def decode_token(v):
    """corpus-reader tokens (13.2): the strings NaN, Infinity, -Infinity stand for those doubles"""
    if v == "NaN":
        return float("nan")
    if v == "Infinity":
        return float("inf")
    if v == "-Infinity":
        return float("-inf")
    return v


def validate_dl_options(o):
    if o is None:
        return {}
    if not isinstance(o, dict):
        raise Err("INVALID_INPUT", "SCHEMA")
    o = {k: v for k, v in o.items() if v is not None or True}
    if not set(o) <= {"edgeLabels", "labels", "maxDrawnLabelUnits"}:
        raise Err("INVALID_INPUT", "SCHEMA")
    out = {}
    for k in ("edgeLabels", "labels", "maxDrawnLabelUnits"):
        if k in o:
            v = decode_token(o[k])
            if k == "maxDrawnLabelUnits":
                out[k] = _num(v, 0, 1 << 31)
            else:
                if not isinstance(v, bool):
                    raise Err("INVALID_INPUT", "SCHEMA")
                out[k] = v
    return out


def validate_options(o):
    """createWebglRenderer options; the order of checking is alphabetical (the design states it for DlOptions only: A-xx)"""
    if o is None:
        return {"dl": {}, "capacity": {}, "ink": (34, 34, 34), "dprMilli": 1000, "name": None, "version": None, "caveat": True,
                "maxDlBytes": 67108864, "maxGlBytes": 268435456}
    if not isinstance(o, dict):
        raise Err("INVALID_INPUT", "SCHEMA")
    known = {"capacity", "contextAttributes", "dl", "dprMilli", "ink", "maxDlBytes", "maxGlBytes", "name", "version"}
    if not set(o) <= known:
        raise Err("INVALID_INPUT", "SCHEMA")
    out = {"dl": {}, "capacity": {}, "ink": (34, 34, 34), "dprMilli": 1000, "name": None, "version": None, "caveat": True,
           "maxDlBytes": 67108864, "maxGlBytes": 268435456}
    for k in sorted(o):
        v = o[k]
        if k == "capacity":
            if not isinstance(v, dict) or not set(v) <= {"maxNodes", "maxEdges", "maxDrawnLabelUnits"}:
                raise Err("INVALID_INPUT", "SCHEMA")
            c = {}
            for kk in sorted(v):
                c[kk] = _num(decode_token(v[kk]))
                if c[kk] < 1 or c[kk] > (1 << 53) - 1:
                    raise Err("INVALID_INPUT", "OUT_OF_RANGE")
            out["capacity"] = c
        elif k == "contextAttributes":
            if not isinstance(v, dict) or not set(v) <= {"failIfMajorPerformanceCaveat"}:
                raise Err("INVALID_INPUT", "SCHEMA")
            if "failIfMajorPerformanceCaveat" in v:
                if not isinstance(v["failIfMajorPerformanceCaveat"], bool):
                    raise Err("INVALID_INPUT", "SCHEMA")
                out["caveat"] = v["failIfMajorPerformanceCaveat"]
        elif k == "dl":
            out["dl"] = validate_dl_options(v)
        elif k == "dprMilli":
            out["dprMilli"] = _num(decode_token(v), 250, 8000)
        elif k == "ink":
            if not isinstance(v, list) or len(v) != 3:
                raise Err("INVALID_INPUT", "SCHEMA")
            iv = []
            for c in v:
                c = decode_token(c)
                if isinstance(c, bool) or not isinstance(c, (int, float)):
                    raise Err("INVALID_INPUT", "INVALID_VALUE")
                iv.append(_num(c, 0, 255))
            out["ink"] = tuple(iv)
        elif k in ("maxDlBytes", "maxGlBytes"):
            out[k] = _num(decode_token(v), 0, 1 << 31)
        elif k in ("name", "version"):
            if not isinstance(v, str):
                raise Err("INVALID_INPUT", "SCHEMA")
            if k == "name" and re.fullmatch(r"[a-z][a-z0-9._-]*", v) is None:
                raise Err("INVALID_INPUT", "INVALID_VALUE")
            if k == "version" and re.fullmatch(r"[0-9A-Za-z._+-]+", v) is None:
                raise Err("INVALID_INPUT", "INVALID_VALUE")
            out[k] = v
    # the one-value rule for the label budget (6.5): capacity and dl must agree
    if out["dl"].get("maxDrawnLabelUnits") == 0:
        raise Err("INVALID_INPUT", "OUT_OF_RANGE")  # a renderer with budget 0 is refused (6.5); the list builder and planGl accept 0
    cu = out["capacity"].get("maxDrawnLabelUnits")
    du = out["dl"].get("maxDrawnLabelUnits")
    if cu is not None and du is not None and cu != du:
        raise Err("INVALID_INPUT", "INVALID_VALUE")
    return out


# ---------------------------------------------------------------- manifest

def gl_manifest(host, options=None, via_renderer=False):
    o = validate_options(options)
    dl = o["dl"]
    cap = {"maxNodes": 100000, "maxEdges": 200000, "maxDrawnLabelUnits": 1048576 if host == "headless" else 262144}
    cap.update(o["capacity"])
    # one-value rule: if only one of the two label budgets is given it applies to both
    if "maxDrawnLabelUnits" in dl and "maxDrawnLabelUnits" not in o["capacity"]:
        cap["maxDrawnLabelUnits"] = dl["maxDrawnLabelUnits"]
    if via_renderer and mut.on("K69"):
        # the renderer's own manifest ignores the options (a mutant: it differs from glManifest)
        cap["maxDrawnLabelUnits"] = 262144 if "maxDrawnLabelUnits" not in o["capacity"] else cap["maxDrawnLabelUnits"]
    sup = {"status": "supported"}
    caps = {}
    for c in ("scene.load", "viewport", "hit-test", "selection", "focus", "visibility", "direction-cue", "indicators.non-color", "a11y.model", "state.report", "lifecycle", "export.scene"):
        caps[c] = dict(sup)
    caps["labels"] = {"status": "degraded", "degradations": ["LABELS_ELIDED"]}
    if dl.get("labels") is False or dl.get("edgeLabels") is False:
        caps["labels.edge"] = {"status": "degraded", "degradations": ["EDGE_LABELS_OMITTED"]}
    else:
        caps["labels.edge"] = dict(sup)
    for c in ("export.svg", "export.png", "motion.animated", "a11y.native-dom", "a11y.companion-dom"):
        caps[c] = {"status": "unsupported", "reason": "NOT_IMPLEMENTED"}
    caps["scene.apply-delta"] = {"status": "unsupported", "reason": "RESERVED"}
    caps["x-dl.display-list"] = dict(sup)
    caps["x-dl.pick-drawn"] = dict(sup)
    caps["x-render.per-element-dom"] = {"status": "unsupported", "reason": "NOT_IMPLEMENTED"}
    caps["x-render.host-text"] = dict(sup)
    for c, flag in (("x-gl.context-recovery", "K70"), ("x-gl.executes", "K129")):
        if host == "dom" or mut.on(flag):
            caps[c] = dict(sup)
        else:
            caps[c] = {"status": "unsupported", "reason": "HOST_LACKS"}
    return {"igr": "IGR/1", "renderer": {"name": o["name"] or "webgl-renderer", "version": o["version"] or "0.0.0", "host": host},
            "capabilities": caps, "capacity": cap}


def verify_manifest(m):
    """27 section 8.1, order of verification (the passing path; failures raise INVALID_MANIFEST/<reason>)"""
    def bad(r):
        raise Err("INVALID_MANIFEST", r)

    if not isinstance(m, dict) or set(m) != {"igr", "renderer", "capabilities", "capacity"}:
        bad("SCHEMA")
    if m["igr"] != "IGR/1":
        bad("UNSUPPORTED_VERSION")
    r = m["renderer"]
    if r.get("host") not in ("dom", "headless"):
        bad("SCHEMA")
    if re.fullmatch(r"[a-z][a-z0-9._-]*", r["name"]) is None or re.fullmatch(r"[0-9A-Za-z._+-]+", r["version"]) is None:
        bad("INVALID_NAME")
    cap = m["capacity"]
    if set(cap) != {"maxNodes", "maxEdges", "maxDrawnLabelUnits"}:
        bad("SCHEMA")
    for v in cap.values():
        if isinstance(v, bool) or not isinstance(v, int):
            bad("SCHEMA")
        if v < 1 or v > (1 << 53) - 1:
            bad("INVALID_LIMITS")
    caps = m["capabilities"]
    for c in MANDATORY + OPTIONAL + ["scene.apply-delta"]:
        if c not in caps:
            bad("MISSING_CAPABILITY")
    for c in caps:
        if c not in MANDATORY + OPTIONAL + ["scene.apply-delta"] and not re.fullmatch(r"x-[a-z0-9][a-z0-9._-]*", c):
            bad("UNKNOWN_CAPABILITY")
    for c in sorted(caps):
        s = caps[c]
        st = s.get("status")
        if st not in ("supported", "degraded", "unsupported"):
            bad("SCHEMA")
        if c == "scene.apply-delta" and s != {"status": "unsupported", "reason": "RESERVED"}:
            bad("RESERVED_CAPABILITY")
        if st == "unsupported" and s.get("reason") == "HOST_LACKS" and not c.startswith("x-") and (r["host"] != "headless" or c not in VISUAL):
            bad("HOST_LACKS_NOT_ALLOWED")
        if c in MANDATORY and c not in ("labels", "direction-cue") and st != "supported":
            bad("MANDATORY_UNSUPPORTED" if st == "unsupported" else "MANDATORY_DEGRADED")
        if st == "degraded":
            if not s["degradations"] or any(d not in DEGRADATIONS for d in s["degradations"]):
                bad("UNKNOWN_DEGRADATION")
            allowed = {"labels": ["LABELS_ELIDED"], "direction-cue": ["EDGE_STYLE_SIMPLIFIED"], "labels.edge": ["EDGE_LABELS_OMITTED"]}.get(c)
            if c.startswith("x-"):
                continue
            if allowed is None or any(d not in allowed for d in s["degradations"]):
                bad("DEGRADATION_NOT_ALLOWED")
    return m


# ---------------------------------------------------------------- the renderer simulation

class Renderer:
    def __init__(self, options=None, host="headless"):
        self.opt = validate_options(options)
        self.host = host
        self.manifest = gl_manifest(host, options, via_renderer=True)
        self.phase = "created"  # created, initialized, loaded, disposed
        self.pending = []
        self.done = {}
        self.model = None
        self.state = None
        self.size = None
        self.reduced = False
        self.limits_nodes = self.manifest["capacity"]["maxNodes"]
        self.limits_edges = self.manifest["capacity"]["maxEdges"]

    # ---- queue (FIFO of asynchronous calls)
    def _busy(self):
        if self.pending:
            raise Err("INVALID_LIFECYCLE", "BUSY")

    def _need_loaded(self):
        self._busy()
        if self.phase == "disposed":
            raise Err("INVALID_LIFECYCLE", "DISPOSED")
        if self.phase == "created":
            raise Err("INVALID_LIFECYCLE", "NOT_INITIALIZED")
        if self.phase == "initialized":
            raise Err("INVALID_LIFECYCLE", "NOT_LOADED")

    def submit(self, fn, wait, slot=None):
        """an asynchronous call: processed in FIFO order; returns its outcome when awaited"""
        self.pending.append((fn, slot))
        if wait:
            return self.drain()
        return None

    def drain(self):
        out = None
        while self.pending:
            fn, slot = self.pending.pop(0)
            try:
                fn()
                out = ("ok", None)
            except Err as e:
                out = ("err", e.cr())
            if slot is not None:
                self.done[slot] = "ok" if out[0] == "ok" else out[1]
        return out

    def initialize(self, env=None):
        def f():
            if self.phase == "disposed":
                raise Err("INVALID_LIFECYCLE", "DISPOSED")
            if self.phase != "created":
                raise Err("INVALID_LIFECYCLE", "ALREADY_INITIALIZED")
            self.size = env["size"]
            self.reduced = env.get("reducedMotion", False)
            self.phase = "initialized"
        return f

    def load(self, model, initial=None):
        def f():
            if self.phase == "disposed":
                raise Err("INVALID_LIFECYCLE", "DISPOSED")
            if self.phase == "created":
                raise Err("INVALID_LIFECYCLE", "NOT_INITIALIZED")
            if len(model.nodes) > self.limits_nodes:
                raise Err("RESOURCE_LIMIT", "NODE_LIMIT")
            if len(model.edges) > self.limits_edges:
                raise Err("RESOURCE_LIMIT", "EDGE_LIMIT")
            st = initial if initial is not None else scn.initial_state(model, self.size["width"], self.size["height"])
            scn.check_state(model, st)
            self.model, self.state, self.phase = model, st, "loaded"
        return f

    def dispatch(self, intent):
        self._need_loaded()
        st = scn.reduce_intent(self.model, self.state, intent)
        scn.check_state(self.model, st)
        self.state = st
        if intent.get("type") == "resize":
            self.size = {"width": st["viewport"]["width"], "height": st["viewport"]["height"]}
        return st

    def get_state(self):
        self._need_loaded()
        return self.state

    def dl(self):
        o = self.opt["dl"]
        mu = o.get("maxDrawnLabelUnits", self.manifest["capacity"]["maxDrawnLabelUnits"])
        return dlist.build_dl(self.model, self.state, o.get("labels", True), o.get("edgeLabels", True), mu)

    def plan(self):
        self._need_loaded()
        d = self.dl()
        p, b = P.build_plan(d, self.opt["maxGlBytes"])
        return p, b

    def probe_fidelity(self):
        self._need_loaded()
        o = self.opt["dl"]
        mu = o.get("maxDrawnLabelUnits", self.manifest["capacity"]["maxDrawnLabelUnits"])
        f = dlist.dry_fidelity(self.model, self.state, o.get("labels", True), o.get("edgeLabels", True), mu)
        degr = []
        if f["labels"] == "elided":
            degr.append("LABELS_ELIDED")
        if not f["edge_labels"]:
            degr.append("EDGE_LABELS_OMITTED")
        return {"degradations": degr, "edge_labels": f["edge_labels"], "labels": f["labels"], "motion": "none"}

    def export(self, fmt):
        self._need_loaded()
        if not isinstance(fmt, str):
            raise Err("INVALID_INPUT", "SCHEMA")
        if fmt == "scene":
            return self.model.scene_bytes, "application/octet-stream"
        if fmt in ("svg", "png"):
            raise Err("UNSUPPORTED_CAPABILITY", "NOT_SUPPORTED")
        raise Err("INVALID_INPUT", "UNKNOWN_FORMAT")

    def dispose(self):
        def f():
            self.phase = "disposed"
        return f

    def set_reduced(self, v):
        if self.phase == "disposed":
            raise Err("INVALID_LIFECYCLE", "DISPOSED")
        self.reduced = bool(v)


def gl_witness(p, renderer_drawn=None):
    """7.8: reads the parsed plan (K68: reads probe() instead)"""
    if mut.on("K68") and renderer_drawn is not None:
        return {"backend": "igr-gl/1", "elements": renderer_drawn, "texts": []}
    nd = p.hdr["nd"]
    table = list(p.nodes) + list(p.edges)
    n7 = {x[1] for x in p.D[7]} | {pid for pid, _ in p.hdr["cn"]}
    e3 = {x[1] for x in p.E[3]} | {pid for pid, _ in p.hdr["ce"]}
    return {"backend": "igr-gl/1", "elements": {"edges": [table[q - 1] for q in sorted(e3)], "nodes": [table[q - 1] for q in sorted(n7)]}, "texts": []}
