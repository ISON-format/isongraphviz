"""Manifest, manifest verifier and a lifecycle simulation of the Canvas renderer (design 31 6.5, 6.6,
27 8-9).  The simulation is the oracle's reading of the written rules; it computes the expected
outcomes of the U rows."""
import copy
import math
import re

import core
from core import M, IgrError, cj, cjb, len16
import dl as D
import view as V

MANDATORY = ["scene.load", "viewport", "hit-test", "selection", "focus", "visibility", "labels", "direction-cue",
             "indicators.non-color", "a11y.model", "state.report", "lifecycle"]
OPTIONAL = ["export.scene", "export.svg", "export.png", "a11y.native-dom", "a11y.companion-dom", "labels.edge",
            "motion.animated"]


def _num_opt(v, lo=None, hi=None):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        raise IgrError("INVALID_INPUT", "SCHEMA")
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        raise IgrError("INVALID_INPUT", "NOT_FINITE")
    if isinstance(v, float) and v != math.floor(v):
        raise IgrError("INVALID_INPUT", "INVALID_VALUE")
    if (lo is not None and v < lo) or (hi is not None and v > hi):
        raise IgrError("INVALID_INPUT", "OUT_OF_RANGE")
    return int(v)


def renderer_options(options, host):
    """validates createCanvasRenderer options; returns resolved dict."""
    options = options or {}
    if not isinstance(options, dict):
        raise IgrError("INVALID_INPUT", "SCHEMA")
    known = {"name", "version", "capacity", "dl", "maxDlBytes", "dprMilli", "ink"}
    if not set(options) <= known:
        raise IgrError("INVALID_INPUT", "SCHEMA")
    dlo = options.get("dl")
    cap = options.get("capacity") or {}
    if dlo is not None:
        D.validate_options(dlo)
    if "dprMilli" in options or "ink" in options:
        ro = {k: options[k] for k in ("dprMilli", "ink") if k in options}
        V.validate_replay_options(ro)
    if "maxDlBytes" in options:
        _num_opt(options["maxDlBytes"], 0, None)
    default_cap = {"maxNodes": 20000, "maxEdges": 40000,
                   "maxDrawnLabelUnits": 1048576 if host == "headless" else 262144}
    capacity = dict(default_cap)
    for k, v in cap.items():
        if k not in default_cap:
            raise IgrError("INVALID_INPUT", "SCHEMA")
        capacity[k] = _num_opt(v, 1, core.SAFE)
    cu = cap.get("maxDrawnLabelUnits")
    du = (dlo or {}).get("maxDrawnLabelUnits")
    if cu is not None and du is not None and cu != du and not M("K126"):
        raise IgrError("INVALID_INPUT", "INVALID_VALUE")
    if cu is None and du is not None:
        capacity["maxDrawnLabelUnits"] = int(du)
    dl_eff = dict(dlo or {})
    if du is None and cu is not None:
        dl_eff["maxDrawnLabelUnits"] = int(cu)
    return {"name": options.get("name", "canvas-renderer"), "version": options.get("version", "0.0.0"),
            "capacity": capacity, "dl": dl_eff, "maxDlBytes": options.get("maxDlBytes", D.DEFAULT_MAX_DL_BYTES),
            "dprMilli": options.get("dprMilli", 1000), "ink": options.get("ink", [34, 34, 34])}


def canvas_manifest(host, options=None):
    r = renderer_options(options, host)
    dlo = r["dl"]
    caps = {}
    for c in MANDATORY:
        caps[c] = {"status": "supported"}
    caps["labels"] = {"status": "degraded", "degradations": ["LABELS_ELIDED"]}
    edge_ok = dlo.get("labels") is not False and dlo.get("edgeLabels") is not False
    if M("K121"):
        edge_ok = True
    caps["labels.edge"] = {"status": "supported"} if edge_ok else {"status": "degraded",
                                                                    "degradations": ["EDGE_LABELS_OMITTED"]}
    caps["export.scene"] = {"status": "supported"}
    for c in ("export.svg", "export.png", "motion.animated", "a11y.native-dom", "a11y.companion-dom"):
        caps[c] = {"status": "unsupported", "reason": "NOT_IMPLEMENTED"}
    caps["scene.apply-delta"] = {"status": "unsupported", "reason": "RESERVED"}
    caps["x-dl.display-list"] = {"status": "supported"}
    caps["x-dl.pick-drawn"] = {"status": "supported"}
    caps["x-render.per-element-dom"] = {"status": "unsupported", "reason": "NOT_IMPLEMENTED"}
    caps["x-render.host-text"] = {"status": "supported"}
    man = {"capabilities": caps, "capacity": r["capacity"], "igr": "IGR/1",
           "renderer": {"host": host, "name": r["name"], "version": r["version"]}}
    if M("K121"):
        man["renderer"]["name"] = r["name"] + "x"
    return man


def verify_manifest(m):
    def bad(reason):
        raise IgrError("INVALID_MANIFEST", reason)
    if not isinstance(m, dict) or set(m) != {"igr", "renderer", "capabilities", "capacity"}:
        bad("SCHEMA")
    if m["igr"] != "IGR/1":
        bad("UNSUPPORTED_VERSION")
    r = m["renderer"]
    if r.get("host") not in ("dom", "headless"):
        bad("SCHEMA")
    if not re.fullmatch(r"[a-z][a-z0-9._-]*", r["name"]) or not re.fullmatch(r"[0-9A-Za-z._+-]+", r["version"]):
        bad("INVALID_NAME")
    cp = m["capacity"]
    if set(cp) != {"maxNodes", "maxEdges", "maxDrawnLabelUnits"}:
        bad("SCHEMA")
    for v in cp.values():
        if not (isinstance(v, int) and 1 <= v <= core.SAFE):
            bad("INVALID_LIMITS")
    caps = m["capabilities"]
    for c in MANDATORY + OPTIONAL + ["scene.apply-delta"]:
        if c not in caps:
            bad("MISSING_CAPABILITY")
    for c in caps:
        if c.startswith("x-"):
            continue
        if c not in MANDATORY + OPTIONAL + ["scene.apply-delta"]:
            bad("UNKNOWN_CAPABILITY")
    for c in sorted(caps):
        st = caps[c]
        if c == "scene.apply-delta":
            if st != {"status": "unsupported", "reason": "RESERVED"}:
                bad("RESERVED_CAPABILITY")
            continue
        if st.get("reason") == "RESERVED":
            bad("RESERVED_CAPABILITY")
        if c in MANDATORY and c not in ("labels", "direction-cue"):
            if st["status"] == "unsupported":
                bad("MANDATORY_UNSUPPORTED")
            if st["status"] == "degraded":
                bad("MANDATORY_DEGRADED")
        if st["status"] == "degraded":
            allowed = {"labels": ["LABELS_ELIDED"], "direction-cue": ["EDGE_STYLE_SIMPLIFIED"],
                       "labels.edge": ["EDGE_LABELS_OMITTED"]}.get(c)
            if c.startswith("x-"):
                continue
            if allowed is None or any(x not in allowed for x in st["degradations"]):
                bad("DEGRADATION_NOT_ALLOWED")
    return m


# -------------------------------------------------------------- the renderer
class Sim:
    """Phases created -> initialized -> loaded -> disposed; one FIFO of asynchronous calls."""

    def __init__(self, options=None, host="headless"):
        self.opt = renderer_options(options, host)
        self.host = host
        self.phase = "created"
        self.queue = []          # pending async closures
        self.disposed_called = False
        self.model = None
        self.state = None
        self.size = None
        self.reduced = False
        self.stale_dl = None
        self.size_env = None

    # ---- helpers
    def busy(self):
        return bool(self.queue)

    def _sync_guard(self):
        if self.busy() and not M("K123_never"):
            raise IgrError("INVALID_LIFECYCLE", "BUSY")

    def _phase_guard(self):
        if self.phase == "disposed":
            raise IgrError("INVALID_LIFECYCLE", "DISPOSED")
        if self.phase == "created":
            raise IgrError("INVALID_LIFECYCLE", "NOT_INITIALIZED")
        if self.phase == "initialized":
            raise IgrError("INVALID_LIFECYCLE", "NOT_LOADED")

    def sync(self, check_busy=True):
        if check_busy and self.busy():
            raise IgrError("INVALID_LIFECYCLE", "BUSY")
        self._phase_guard()

    # ---- async ops (processed in FIFO order)
    def _do_initialize(self, env):
        if self.phase == "disposed":
            raise IgrError("INVALID_LIFECYCLE", "DISPOSED")
        if self.phase != "created":
            raise IgrError("INVALID_LIFECYCLE", "ALREADY_INITIALIZED")
        sz = (env or {}).get("size") or {"width": 900, "height": 600}
        for k in ("width", "height"):
            _num_opt(sz[k], 1, core.VIEWPORT_MAX)
        self.size = (sz["width"], sz["height"])
        self.reduced = bool((env or {}).get("reducedMotion", False))
        self.phase = "initialized"

    def _do_load(self, model, initial):
        if self.phase == "disposed":
            raise IgrError("INVALID_LIFECYCLE", "DISPOSED")
        if self.phase == "created":
            raise IgrError("INVALID_LIFECYCLE", "NOT_INITIALIZED")
        if not isinstance(model, core.Model):
            raise IgrError("INVALID_INPUT", "NOT_A_RENDER_MODEL")
        if len(model["nodes"]) > self.opt["capacity"]["maxNodes"]:
            raise IgrError("RESOURCE_LIMIT", "NODE_LIMIT")
        if len(model["edges"]) > self.opt["capacity"]["maxEdges"]:
            raise IgrError("RESOURCE_LIMIT", "EDGE_LIMIT")
        if initial is not None:
            core.validate_state(model, initial)
            st = copy.deepcopy(initial)
        else:
            cur = self.state["viewport"] if self.state else None
            w, h = (cur["width"], cur["height"]) if cur else self.size
            st = core.initial_state(model, w, h)
        self.model, self.state = model, st
        self.phase = "loaded"
        self.stale_dl = None

    def _do_render(self):
        if M("K128"):
            self.display_list_bytes()
        self._phase_guard()

    def _do_export(self, fmt):
        self._phase_guard()
        if not isinstance(fmt, str):
            raise IgrError("INVALID_INPUT", "SCHEMA")
        if fmt not in ("scene", "svg", "png"):
            raise IgrError("INVALID_INPUT", "UNKNOWN_FORMAT")
        if fmt == "scene":
            return ("application/octet-stream", self.model["scene_bytes"])
        if M("K122") and fmt == "svg":
            return ("image/svg+xml", b"<svg/>")
        raise IgrError("UNSUPPORTED_CAPABILITY", "NOT_SUPPORTED")

    def _do_dispose(self):
        self.phase = "disposed"

    def submit(self, name, *args):
        """queue an async call; returns a handle whose .result is filled when settled"""
        h = {"name": name, "args": args, "done": False, "ok": None, "err": None}
        self.queue.append(h)
        return h

    def settle(self):
        while self.queue:
            h = self.queue.pop(0)
            try:
                fn = {"initialize": self._do_initialize, "loadScene": self._do_load, "render": self._do_render,
                      "export": self._do_export, "dispose": self._do_dispose}[h["name"]]
                h["ok"] = fn(*h["args"])
            except IgrError as e:
                h["err"] = e.tag()
            h["done"] = True

    # ---- sync ops
    def dispatch(self, intent):
        self.sync()
        if M("K124"):
            self.stale_dl = self._build_dl()
        self.state = core.reduce_intent(self.model, self.state, intent)

    def get_state(self):
        self.sync()
        return self.state

    def _build_dl(self):
        return D.build_dl(self.model, self.state, self.opt["dl"] or None)

    def display_list(self):
        if self.busy() and not M("K123"):
            raise IgrError("INVALID_LIFECYCLE", "BUSY")
        self._phase_guard() if not (self.busy() and M("K123")) else None
        if M("K124") and self.stale_dl is not None:
            return self.stale_dl
        return self._build_dl()

    def display_list_bytes(self):
        dl = self.display_list()
        return D.serialize_dl(dl, self.opt["maxDlBytes"])

    def canvas_calls(self):
        dl = self.display_list()
        ro = {"dprMilli": self.opt["dprMilli"], "ink": self.opt["ink"]}
        return V.record_calls(dl, ro)

    def pick(self, point):
        self.sync()
        if M("K125"):
            h = core.hit_test(self.model, self.state, point)
            return core.element_address(self.model, h)
        return V.pick_drawn(self.model, self.state, point)

    def hit_test(self, point):
        self.sync()
        return core.element_address(self.model, core.hit_test(self.model, self.state, point))

    def probe_fidelity(self):
        self.sync()
        fid = D.dry_label_pass(self.model, self.state, self.opt["dl"] or None)
        labels = fid["labels"]
        if M("K127") and labels == "elided":
            labels = "full"
        degs = []
        if labels == "elided":
            degs.append("LABELS_ELIDED")
        if not fid["edge_labels"]:
            degs.append("EDGE_LABELS_OMITTED")
        return {"degradations": sorted(degs), "edge_labels": fid["edge_labels"], "labels": labels,
                "motion": "none"}

    def witness(self):
        self.sync()
        return V.canvas_witness(self.canvas_calls(), self.display_list())

    def set_reduced(self, v):
        if self.phase == "disposed":
            raise IgrError("INVALID_LIFECYCLE", "DISPOSED")
        if not isinstance(v, bool):
            raise IgrError("INVALID_INPUT", "SCHEMA")
        self.reduced = v


def witness_check(report, model, state):
    """kit W01 reduced to its core: the witness elements equal the drawn elements, texts empty."""
    hn, he = core.eff_hidden(model, state)
    dn = [n["ref"] for n in model["nodes"] if n["index"] not in hn]
    de = [e["ref"] for e in model["edges"] if e["index"] not in he]
    return report["elements"]["nodes"] == dn and report["elements"]["edges"] == de and report["texts"] == []
