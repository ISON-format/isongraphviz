"""The WebGL executor call log (7.5), the context controller (7.6) and the capability probe (7.7) against fakes.

Every effect is one canonical-JSON line (a Python list here); the row files are the lines joined with LF.
"""
import ju
import mut
import plan as P
import scn
import shaders

PROGRAMS = ("arrow", "disc", "edge")
ATTRS = {
    "arrow": [("a_tb1", 4, "F", 0), ("a_b2", 2, "F", 16)],
    "disc": [("a_center", 2, "F", 0), ("a_meta", 4, "I", 12)],
    "edge": [("a_ab", 4, "F", 0), ("a_cb", 4, "F", 16), ("a_meta", 4, "I", 36)],
}
UNIFORMS = ("u_view", "u_ink")
MODE = {"arrow": ("TRIANGLES", 3), "disc": ("TRIANGLE_STRIP", 4), "edge": ("TRIANGLE_STRIP", 34)}
INFO_LOG = "ERROR: 0:7: 'fake_symbol' : syntax error (fake driver text, not from any scene) " * 4
DEFAULT_INK = (34, 34, 34)


def prog_order():
    return ("disc", "edge", "arrow") if mut.on("K40") else PROGRAMS


def src_digest(key):
    s = shaders.SOURCES[key]
    if mut.on("K34") and key == "edge.vs":
        s = s.replace("0.001", "0.0010", 1)
    if mut.on("K35") and key == "arrow.vs":
        s = s.replace("  gl_Position", "\tgl_Position", 1)
    if mut.on("K36") and key == "disc.vs":
        s = s.replace("precision highp float;", "#extension GL_OES_standard_derivatives : enable\nprecision highp float;", 1)
    if mut.on("K37"):
        s = s + P._LAST_STRING[0]
    if mut.on("K38") and key == "arrow.vs":
        s = s.replace("a_tb1", "a_xy1")
    return ju.sha256_hex(s.encode("utf-8"))[:16]


def shader_sources():
    """the constants as the executor would hand to shaderSource (mutants change them)"""
    out = {}
    for k, s in shaders.SOURCES.items():
        if mut.on("K34") and k == "edge.vs":
            s = s.replace("0.001", "0.0010", 1)
        if mut.on("K35") and k == "arrow.vs":
            s = s.replace("  gl_Position", "\tgl_Position", 1)
        if mut.on("K36") and k == "disc.vs":
            s = s.replace("precision highp float;", "#extension GL_OES_standard_derivatives : enable\nprecision highp float;", 1)
        if mut.on("K37"):
            s = s + P._LAST_STRING[0]
        if mut.on("K38") and k == "arrow.vs":
            s = s.replace("a_tb1", "a_xy1")
        out[k] = s
    return out


def shader_set_bytes():
    d = {}
    for k, s in shader_sources().items():
        p, st = k.split(".")
        d.setdefault(p, {})[st] = s
    if mut.on("K39"):
        return "".join(shader_sources()[k] for k in sorted(shader_sources())).encode("utf-8")
    return ju.cjb(d)


# ---------------------------------------------------------------- creation, frame, deletion

def create_resources(log, fail=None, lost_after=False):
    """7.5.  returns ('ok', None) or (kind, token) with kind in compile, link, lost; appends the calls to log.
    fail: None | ('compile', 'disc.fs') | ('link', 'edge')"""
    alive = []
    for prog in prog_order():
        for stage, sname in (("vs", "VERTEX_SHADER"), ("fs", "FRAGMENT_SHADER")):
            name = "%s.%s" % (prog, stage)
            log.append(["createShader", name, sname])
            alive.append(("shader", name))
            log.append(["shaderSource", name, src_digest(name)])
            log.append(["compileShader", name])
            if mut.on("K110"):
                log.append(["getShaderInfoLog", name])
            log.append(["getShaderParameter", name, "COMPILE_STATUS"])
            if lost_after and name == "arrow.vs":
                return "lost", "CONTEXT_LOST"
            if fail == ("compile", name):
                if not mut.on("K110"):
                    log.append(["getShaderInfoLog", name])
                _cleanup(log, alive)
                return "compile", "COMPILE_FAILED"
        log.append(["createProgram", prog])
        alive.append(("program", prog))
        log.append(["attachShader", prog, prog + ".vs"])
        log.append(["attachShader", prog, prog + ".fs"])
        log.append(["linkProgram", prog])
        if mut.on("K110"):
            log.append(["getProgramInfoLog", prog])
        log.append(["getProgramParameter", prog, "LINK_STATUS"])
        if fail == ("link", prog):
            if not mut.on("K110"):
                log.append(["getProgramInfoLog", prog])
            _cleanup(log, alive)
            return "link", "LINK_FAILED"
        for stage in ("vs", "fs"):
            if mut.on("K41"):
                continue
            log.append(["deleteShader", "%s.%s" % (prog, stage)])
            alive.remove(("shader", "%s.%s" % (prog, stage)))
        for a in ATTRS[prog]:
            log.append(["getAttribLocation", prog, a[0]])
        for u in UNIFORMS:
            log.append(["getUniformLocation", prog, u])
        log.append(["createVertexArray", prog])
        alive.append(("vao", prog))
    for prog in PROGRAMS:
        log.append(["createBuffer", prog])
        alive.append(("buffer", prog))
    return "ok", None


def _cleanup(log, alive):
    seq = list(alive) if mut.on("K103") else list(reversed(alive))
    for kind, name in seq:
        if kind == "shader":
            log.append(["deleteShader", name])
        elif kind == "vao":
            log.append(["deleteVertexArray", name])
        elif kind == "program":
            log.append(["deleteProgram", name])
        else:
            log.append(["deleteBuffer", name])


def detail_of(token, kind):
    """the IgrError detail: closed token, a colon and at most 120 characters of the info log (11.3)"""
    if kind in ("compile", "link"):
        txt = INFO_LOG if mut.on("K104") else INFO_LOG[:120]
        return token + ":" + txt
    return token


def delete_resources(log):
    for p in ("edge", "disc", "arrow"):
        log.append(["deleteBuffer", p])
    for p in ("edge", "disc", "arrow"):
        log.append(["deleteVertexArray", p])
        log.append(["deleteProgram", p])


def release_context(log):
    log.append(["getExtension", "WEBGL_lose_context"])
    log.append(["loseContext"])


def frame_log(log, plan, frame, upload=True):
    """7.5 frame.  frame = {widthPx, heightPx, ink}"""
    hdr = plan.hdr
    w, h = hdr["w"], hdr["h"]
    wpx, hpx = frame["widthPx"], frame["heightPx"]
    if mut.on("K48"):
        wpx, hpx = w, h
    uw, uh = (wpx, hpx) if mut.on("K75") else (w, h)
    r, g, b = frame["ink"]
    log.append(["viewport", 0, 0, wpx, hpx])
    log.append(["clearColor", 0, 0, 0, 1 if mut.on("K43") else 0])
    log.append(["clear", "COLOR_BUFFER_BIT"])
    log.append(["enable", "BLEND"])
    log.append(["blendFunc", "SRC_ALPHA" if mut.on("K42") else "ONE", "ONE_MINUS_SRC_ALPHA"])
    uploaded = []
    for prog in PROGRAMS:
        sz = len(plan.buf[prog])
        if sz > 0 or mut.on("K121"):
            if upload:
                _upload(log, prog, plan.buf[prog])
            uploaded.append(prog)
    draws = hdr["draws"]
    if mut.on("K51") and not draws:
        draws = [{"count": 0, "first": 0, "layer": {"edge": 3, "arrow": 4, "disc": 7}[p], "program": p} for p in PROGRAMS]
    for dr in draws:
        prog = dr["program"]
        if mut.on("K49") and upload:
            _upload(log, prog, plan.buf[prog])
        log.append(["useProgram", prog])
        log.append(["uniform2f", prog + ".u_view", uw, uh])
        ink3 = [r, g, b]
        if mut.on("K76"):
            ink3 = [b, g, r]
        if mut.on("K47"):
            ink3 = [v * 255 for v in ink3]
        log.append(["uniform3f", prog + ".u_ink"] + ink3)
        log.append(["bindVertexArray", prog])
        log.append(["bindBuffer", "ARRAY_BUFFER", prog])
        stride = P.STRIDE[prog]
        for name, size, kind, off in ATTRS[prog]:
            q = prog + "." + name
            log.append(["enableVertexAttribArray", q])
            o = (0 if mut.on("K44") else dr["first"] * stride) + off
            if kind == "F" or (mut.on("K46") and name == "a_meta"):
                if kind == "F":
                    log.append(["vertexAttribPointer", q, size, "FLOAT", False, stride, o])
                else:
                    log.append(["vertexAttribPointer", q, size, "UNSIGNED_BYTE", False, stride, o])
            else:
                log.append(["vertexAttribIPointer", q, size, "UNSIGNED_BYTE", stride, o])
            log.append(["vertexAttribDivisor", q, 0 if mut.on("K45") else 1])
        mode, verts = MODE[prog]
        if prog == "edge" and mut.on("K52"):
            verts = 32
        if mode == "TRIANGLE_STRIP" and mut.on("K53"):
            mode = "TRIANGLES"
        log.append(["drawArraysInstanced", mode, 0, verts, dr["count"]])
    if not mut.on("K50"):
        log.append(["bindVertexArray", None])


def _upload(log, prog, data):
    log.append(["bindBuffer", "ARRAY_BUFFER", prog])
    log.append(["bufferData", "ARRAY_BUFFER", len(data), ju.sha256_hex(data)[:16], "DYNAMIC_DRAW"])


def log_bytes(log):
    return b"".join(ju.line(l) for l in log)


# ---------------------------------------------------------------- the context controller (7.6)

class Ctl:
    def __init__(self, fail_if_caveat=True):
        self.phase = "created"
        self.lost = False
        self.failure = None
        self.listeners = False
        self.has_ctx = False
        self.resources = False
        self.plan = None
        self.log = []
        self.attrs = {"failIfMajorPerformanceCaveat": bool(fail_if_caveat)}

    # ---- helpers
    def status(self):
        s = {"attributes": dict(self.attrs), "contextLost": self.lost, "phase": self.phase}
        if self.failure is not None:
            s["failure"] = self.failure
        return s

    def _status_line(self):
        if mut.on("K107"):
            return
        self.log.append(["onStatus", self.phase, 1 if self.lost else 0, self.failure])

    def _error(self, token):
        self.log.append(["onError", "INVALID_INPUT/INVALID_VALUE", token])

    def _frame_and_labels(self, upload=True):
        if self.plan is None:
            return
        f = {"widthPx": self.plan.hdr["w"], "heightPx": self.plan.hdr["h"], "ink": DEFAULT_INK}
        frame_log(self.log, self.plan, f, upload)
        self.log.append(["labels.draw"])

    def _add_listeners(self):
        if not self.listeners:
            self.log.append(["addEventListener", "webglcontextlost"])
            self.log.append(["addEventListener", "webglcontextrestored"])
            self.listeners = True

    def _remove_listeners(self):
        if self.listeners and not mut.on("K59"):
            self.log.append(["removeEventListener", "webglcontextlost"])
            self.log.append(["removeEventListener", "webglcontextrestored"])
            self.listeners = False

    def _create(self, fail):
        """returns the outcome kind"""
        self.has_ctx = True
        spec = None
        lost_after = False
        if fail == "compile":
            spec = ("compile", "disc.fs")
        elif fail == "link":
            spec = ("link", "edge")
        elif fail == "lost":
            lost_after = True
        kind, token = create_resources(self.log, spec, lost_after)
        if kind == "lost":
            self.lost = True
        return kind, token

    # ---- events
    def init(self, fail=None):
        if self.phase != "created" and not (mut.on("K125") and self.phase == "ready"):
            return
        if self.phase == "ready":
            # K125: a second init re-creates the resources
            self._create(None)
            return
        self._add_listeners()
        kind, token = self._create(fail)
        if mut.on("K63") and kind == "compile":
            # a compile failure ignored: creation carries on as if it had succeeded
            self.resources = True
            self.failure = None
            self.phase = "ready"
            self._frame_and_labels()
            self._status_line()
            return
        if kind == "ok":
            self.resources = True
            self.failure = None
            self.phase = "ready"
            self._frame_and_labels()
            self._status_line()
        else:
            self.failure = token
            if kind == "lost":
                self.failure = "CONTEXT_LOST"
            self._error(token)
            self.log.append(["reject", "INVALID_INPUT/INVALID_VALUE", token])

    def L(self):
        if self.phase == "created" or self.phase == "disposed":
            return
        if not mut.on("K54"):
            self.log.append(["preventDefault"])
        if mut.on("K61"):
            self.log.append(["semantic-event", "focus-changed"])
        self.lost = True
        if self.phase == "ready":
            if mut.on("K56"):
                delete_resources(self.log)
            if not mut.on("K105"):
                self.log.append(["labels.clear"])
            self.phase = "lost"
            self.failure = None
            self._status_line()
        elif self.phase == "failed":
            self.phase = "lost"
            self.failure = None
            self._status_line()
        elif self.phase == "lost":
            if mut.on("K98"):
                self._status_line()

    def R(self, fail=None):
        if self.phase in ("created", "disposed"):
            return
        if self.phase == "ready":
            if mut.on("K99"):
                self._create(None)
            return
        if self.phase == "failed" and mut.on("K100"):
            return
        self.lost = False
        kind, token = self._create(fail)
        if kind == "ok":
            self.resources = True
            self.failure = None
            self.phase = "ready"
            if mut.on("K57"):
                self._frame_and_labels(upload=False)
            elif mut.on("K58"):
                if self.plan is not None:
                    self.log.append(["labels.draw"])
            else:
                self._frame_and_labels()
            self._status_line()
        elif kind == "lost":
            self.lost = True
            if mut.on("K97"):
                self.phase = "failed"
                self.failure = "CONTEXT_LOST"
                self._error("CONTEXT_LOST")
                self._status_line()
            elif self.phase == "failed":
                # (failed, R) lost again: phase lost, failure cleared, no cleanup calls, onStatus (7.6)
                self.phase = "lost"
                self.failure = None
                self._status_line()
        else:
            if mut.on("K62"):
                self.log.append(["throw", "INVALID_INPUT/INVALID_VALUE", token])
                return
            changed = self.phase != "failed"
            self.phase = "failed"
            self.failure = token
            if mut.on("K128"):
                if changed:
                    self._status_line()
                self._error(token)
            else:
                self._error(token)
                if changed:  # onStatus fires only on a phase change (7.6)
                    self._status_line()

    def C(self, plan):
        if self.phase == "disposed":
            return
        if mut.on("K60") and self.phase == "lost":
            return
        self.plan = plan
        if self.phase == "ready":
            self._frame_and_labels()
        elif self.phase == "lost" and mut.on("K106"):
            self.log.append(["labels.draw"])

    def F(self):
        if self.phase == "ready":
            self._frame_and_labels()
        elif self.phase == "lost" and mut.on("K55"):
            self._frame_and_labels()

    def D(self):
        if self.phase == "disposed":
            return
        ph = self.phase
        if ph == "ready":
            delete_resources(self.log)
            if not mut.on("K102"):
                release_context(self.log)
        elif ph == "lost":
            if mut.on("K101"):
                delete_resources(self.log)
        elif ph == "failed":
            if not self.lost and not mut.on("K126"):
                release_context(self.log)
        elif ph == "created":
            if self.has_ctx and not self.lost and not mut.on("K127"):
                release_context(self.log)
        self._remove_listeners()
        self.phase = "disposed"
        self.failure = None
        self._status_line()

    def run(self, events, plans):
        sts = []
        for ev in events:
            op = ev["op"]
            if op == "init":
                self.init(ev.get("fail"))
            elif op == "L":
                self.L()
            elif op == "R":
                self.R(ev.get("fail"))
            elif op == "C":
                self.C(plans[ev["plan"]])
            elif op == "F":
                self.F()
            elif op == "D":
                self.D()
            sts.append(self.status())
        return sts


# ---------------------------------------------------------------- the capability probe (7.7)

ATTR_CONST = {"alpha": True, "antialias": True, "depth": False, "stencil": False, "premultipliedAlpha": True,
              "preserveDrawingBuffer": False, "powerPreference": "default", "failIfMajorPerformanceCaveat": True}


class FakeThrow(Exception):
    pass


class FakeFactory:
    """FAKE of 13.2: the i-th factory() call returns canvases[i] or undefined past the end"""

    def __init__(self, spec, log):
        self.spec = spec
        self.log = log
        self.calls = 0

    def is_function(self):
        return self.spec.get("factory", "function") == "function"

    def __call__(self):
        self.log.append(["factory"])
        i = self.calls
        self.calls += 1
        cv = self.spec.get("canvases", [])
        if i >= len(cv):
            return None
        return FakeCanvas(cv[i], self.log)


class FakeCanvas:
    def __init__(self, spec, log):
        self.spec = spec
        self.log = log
        self.got = None  # context type already handed out

    def getContext(self, typ, attrs=None):
        if typ == "webgl2":
            self.log.append(["getContext", "webgl2", dict(attrs)])
        else:
            self.log.append(["getContext", "2d"])
        if self.spec.get("throws") == "getContext":
            raise FakeThrow("getContext")
        if self.spec.get("one_context_type") and self.got is not None and self.got != typ:
            return None
        if typ == "2d":
            r = True if self.spec.get("2d") else None
        else:
            if attrs.get("failIfMajorPerformanceCaveat") is False and "webgl2_relaxed" in self.spec:
                g = self.spec["webgl2_relaxed"]
            else:
                g = self.spec.get("webgl2")
            r = FakeGL(g, self.log, self.spec) if g is not None else None
        if r is not None:
            self.got = typ
        return r


class FakeGL:
    def __init__(self, spec, log, cspec):
        self.spec, self.log, self.cspec = spec, log, cspec

    def getShaderPrecisionFormat(self, stage):
        self.log.append(["getShaderPrecisionFormat", stage, "HIGH_FLOAT"])
        if self.cspec.get("throws") == "getShaderPrecisionFormat":
            raise FakeThrow("getShaderPrecisionFormat")
        return self.spec["vertexPrecision"] if stage == "VERTEX_SHADER" else self.spec["fragmentPrecision"]

    def getParameter(self, name):
        self.log.append(["getParameter", name])
        if self.cspec.get("throws") == "getParameter":
            raise FakeThrow("getParameter")
        return self.spec["maxVertexAttribs"] if name == "MAX_VERTEX_ATTRIBS" else list(self.spec["maxViewportDims"])

    def getExtension(self, name):
        self.log.append(["getExtension", name])
        if name != "WEBGL_lose_context":
            raise FakeThrow("getExtension " + name)
        return name in self.spec.get("extensions", [])

    def loseContext(self):
        self.log.append(["loseContext"])


def probe(spec, need=None, options=None, for_adapter=False):
    """probeWebgl(factory, need, options) against the fake `spec`; returns (result dict, log).  An escaping
    throw (mutant K80) is returned as ('THROWS', log)."""
    log = []
    need = need or {}
    nw, nh = need.get("widthPx", 1), need.get("heightPx", 1)
    opt = True
    if options and "failIfMajorPerformanceCaveat" in options:
        opt = options["failIfMajorPerformanceCaveat"]
    if mut.on("K122"):
        opt = True
    fac = FakeFactory(spec, log)
    held = []  # GL contexts to release

    skip = [False]

    def release():
        if mut.on("K77") or (mut.on("K109") and for_adapter) or skip[0]:
            return
        while held:
            g = held.pop(0)
            if g.getExtension("WEBGL_lose_context"):
                g.loseContext()

    reasons = {"NO_FACTORY": "NO_FACTORY", "PROBE_ERROR": "PROBE_ERROR", "NO_CONTEXT": "NO_CONTEXT", "PERFORMANCE_CAVEAT": "PERFORMANCE_CAVEAT",
               "NO_HIGHP": "NO_HIGHP", "TOO_FEW_ATTRIBS": "TOO_FEW_ATTRIBS", "TOO_SMALL": "TOO_SMALL", "NO_2D_LAYER": "NO_2D_LAYER"}
    if mut.on("K64"):
        reasons.update({"NO_FACTORY": "PROBE_ERROR", "NO_CONTEXT": "PERFORMANCE_CAVEAT", "PERFORMANCE_CAVEAT": "NO_CONTEXT"})

    def fail(r):
        return {"available": False, "reason": reasons[r]}

    def body():
        if not fac.is_function():
            return fail("NO_FACTORY")
        a = fac()
        if a is None:
            return fail("NO_FACTORY")
        attrs = dict(ATTR_CONST)
        attrs["failIfMajorPerformanceCaveat"] = opt
        if mut.on("K67"):
            attrs["failIfMajorPerformanceCaveat"] = False
        gl = a.getContext("webgl2", attrs)
        if gl is not None:
            held.append(gl)
        if gl is None:
            if opt and not mut.on("K83"):
                b = fac()
                if b is None:
                    return fail("NO_FACTORY")
                attrs2 = dict(attrs)
                attrs2["failIfMajorPerformanceCaveat"] = False
                g2 = b.getContext("webgl2", attrs2)
                if g2 is not None:
                    held.append(g2)
                    release()
                    return fail("PERFORMANCE_CAVEAT")
            return fail("NO_CONTEXT")
        if mut.on("K65"):
            gl.getExtension("WEBGL_debug_renderer_info")
        checks = ["vp", "fp", "va", "vd"]
        if mut.on("K78"):
            checks = ["vd", "vp", "fp", "va"]
        dims = None
        for c in checks:
            if c == "vp" and not mut.on("K81"):
                if gl.getShaderPrecisionFormat("VERTEX_SHADER") < 23:
                    if mut.on("K123"):
                        skip[0] = True
                    else:
                        release()
                    return fail("NO_HIGHP")
            elif c == "fp" and not mut.on("K117"):
                if gl.getShaderPrecisionFormat("FRAGMENT_SHADER") < 23:
                    release()
                    return fail("NO_HIGHP")
            elif c == "va" and not mut.on("K118"):
                if gl.getParameter("MAX_VERTEX_ATTRIBS") < 4:
                    release()
                    return fail("TOO_FEW_ATTRIBS")
            elif c == "vd" and not mut.on("K82"):
                dims = gl.getParameter("MAX_VIEWPORT_DIMS")
                if dims[0] < nw or dims[1] < nh:
                    release()
                    return fail("TOO_SMALL")
        if dims is None:
            dims = gl.getParameter("MAX_VIEWPORT_DIMS")
        release()
        if not mut.on("K66"):
            if mut.on("K79"):
                c2d = a.getContext("2d")
            else:
                c = fac()
                if c is None:
                    return fail("NO_FACTORY")
                c2d = c.getContext("2d")
            if c2d is None:
                return fail("NO_2D_LAYER")
        return {"available": True, "limits": {"maxViewportDims": [dims[0], dims[1]]}}

    try:
        try:
            res = body()
        finally:
            release()
    except FakeThrow:
        if mut.on("K80"):
            return "THROWS", log
        return fail("PROBE_ERROR"), log
    return res, log
