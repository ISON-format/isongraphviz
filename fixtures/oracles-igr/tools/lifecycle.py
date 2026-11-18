#!/usr/bin/env python3
"""Lifecycle (L group) script author: a tiny reference simulation of section 9, written from the design text only.
The simulation exists so that every `expect` in a generated script is computed from the rules, not typed in."""
import sys

sys.dont_write_bytecode = True
import igr
from igr import IgrError

ASYNC = {"initialize", "loadScene", "render", "export", "dispose"}
SYNC = {"dispatch", "getState", "hitTest", "probe", "setReducedMotion"}
FORMATS = ("scene", "svg", "png")


def run_lifecycle(lid, models, env, listener, calls, ctx, extras):
    put, read, load = ctx["put"], ctx["read"], ctx["load"]
    default_model = load(*models)
    S = dict(phase="created", model=None, state=None, size=(env["size"]["width"], env["size"]["height"]), reduced=bool(env.get("reducedMotion")))
    recorded, listener_errors = [], []
    counters = dict(on_error=0)
    out = [None] * len(calls)
    queue = []

    def err(tag):
        return {"expect": tag}

    def ok(**kw):
        d = {"expect": "ok"}
        d.update(kw)
        return d

    def phase_err_sync():
        ph = S["phase"]
        if ph == "disposed":
            return "INVALID_LIFECYCLE/DISPOSED"
        if ph == "created":
            return "INVALID_LIFECYCLE/NOT_INITIALIZED"
        if ph == "initialized":
            return "INVALID_LIFECYCLE/NOT_LOADED"
        return None

    def save_state(idx):
        rel = f"states/{lid}.c{idx}.state.json"
        put(rel, igr.serialize_state(S["model"], S["state"]))
        return rel

    def execute(idx, spec):
        op, arg = spec["op"], spec.get("arg")
        if op == "initialize":
            if S["phase"] == "disposed":
                return err("INVALID_LIFECYCLE/DISPOSED")
            if S["phase"] != "created":
                return err("INVALID_LIFECYCLE/ALREADY_INITIALIZED")
            w, h = S["size"]
            if isinstance(arg, dict) and "size" in arg:       # rev 4 (13.3a): `initialize` arg is a partial env override
                w, h = arg["size"]["width"], arg["size"]["height"]
            if not (1 <= w <= igr.VIEWPORT_MAX_PX and 1 <= h <= igr.VIEWPORT_MAX_PX):
                return err("INVALID_INPUT/OUT_OF_RANGE")
            if isinstance(arg, dict) and "limits" in arg:      # rev 5 (L27): RenderLimits validation through initialize
                try:
                    igr.validate_limits(arg["limits"])
                except IgrError as e:
                    return err(e.tag())
            S["phase"] = "initialized"
            S["size"] = (w, h)
            return ok()
        if op == "loadScene":
            if S["phase"] == "disposed":
                return err("INVALID_LIFECYCLE/DISPOSED")
            if S["phase"] == "created":
                return err("INVALID_LIFECYCLE/NOT_INITIALIZED")
            a = arg or {}
            if a.get("plain_object_model"):
                return err("INVALID_INPUT/NOT_A_RENDER_MODEL")
            if a.get("at_capacity"):
                S["phase"] = "loaded"                         # a kit-built model exactly at capacity is accepted (L26)
                return dict(ok(), applies_if="capacity-at-most-1000000")
            if a.get("over_capacity") == "nodes":
                return err("RESOURCE_LIMIT/NODE_LIMIT")
            if a.get("over_capacity") == "edges":
                return err("RESOURCE_LIMIT/EDGE_LIMIT")
            mdl = load(a["model"]["scene"], a["model"]["layout"]) if "model" in a else default_model
            if "initial" in a:
                try:
                    st = igr.parse_state(mdl, read(a["initial"]), {"maxStateBytes": 2 ** 60})   # rev 5 (9): loadScene applies no maxStateBytes
                except IgrError as e:
                    return err(e.tag())
            else:
                st = igr.initial_state(mdl, *S["size"])
            S["model"], S["state"], S["phase"] = mdl, st, "loaded"
            S["size"] = (st["viewport"]["width"], st["viewport"]["height"])
            return ok()
        if op == "render":
            return err(phase_err_sync()) if phase_err_sync() else ok()
        if op == "export":
            pe = phase_err_sync()
            if pe:
                return err(pe)
            if arg == "@first-undeclared-export-format":
                return dict(err("UNSUPPORTED_CAPABILITY/NOT_SUPPORTED"), applies_if="has-undeclared-export-format")
            if not isinstance(arg, str):
                return err("INVALID_INPUT/SCHEMA")              # rev 3 (9): a non-string argument
            if arg not in FORMATS:
                return err("INVALID_INPUT/UNKNOWN_FORMAT")
            if arg == "scene":
                return ok(expect_bytes=models[0], expect_media_type="application/octet-stream")
            return ok()                      # svg / png contents are V5/V6/V11
        if op == "dispose":
            S["phase"] = "disposed"
            return ok()
        if op == "applySceneDelta":
            if S["phase"] == "disposed" or S.get("dispose_called"):
                return err("INVALID_LIFECYCLE/DISPOSED")
            return err("UNSUPPORTED_CAPABILITY/RESERVED")
        raise AssertionError(op)

    def execute_sync(idx, spec):
        op, arg = spec["op"], spec.get("arg")
        if op == "setReducedMotion":
            if S["phase"] == "disposed":
                return err("INVALID_LIFECYCLE/DISPOSED")
            S["reduced"] = bool(arg)
            return ok()
        if queue:
            return err("INVALID_LIFECYCLE/BUSY")
        pe = phase_err_sync()
        if pe:
            return err(pe)
        if op == "getState":
            return ok(expect_state=save_state(idx))
        if op == "hitTest":
            hit = igr.hit_test(S["model"], S["state"], (arg["x"], arg["y"]))
            return ok(expect_hit=hit)
        if op == "probe":
            r = ok(expect_state=save_state(idx))
            if S["reduced"]:
                r["expect_motion"] = "none"
            return r
        if op == "dispatch":
            try:
                st2, ev = igr.reduce(S["model"], S["state"], arg)
            except IgrError as e:
                return err(e.tag())
            S["state"] = st2
            S["size"] = (st2["viewport"]["width"], st2["viewport"]["height"])
            for _ in ev:
                if listener == "record":
                    pass
                elif listener == "throw":
                    counters["on_error"] += 1
                elif listener == "dispatch-inside":
                    listener_errors.append("INVALID_LIFECYCLE/REENTRANT")
            recorded.extend(ev)
            ep = f"events/{lid}.c{idx}.events.json"
            put(ep, igr.serialize_events(ev))
            return ok(expect_events=ep, expect_state=save_state(idx))
        raise AssertionError(op)

    def drain():
        while queue:
            i = queue.pop(0)
            out[i] = execute(i, calls[i])

    for idx, spec in enumerate(calls):
        op = spec["op"]
        if op == "dispose":
            S["dispose_called"] = True                       # rev 4 (9.7): after dispose() was called, pending or settled
        if op in ASYNC:
            if spec.get("aw", True):
                drain()
                out[idx] = execute(idx, spec)
            else:
                queue.append(idx)
        elif op == "applySceneDelta":
            out[idx] = execute(idx, spec)          # rev 3 (9.7): immediate, never queued, never BUSY
        else:
            out[idx] = execute_sync(idx, spec)
    drain()

    script = {"model": {"scene": models[0], "layout": models[1]}, "env": env, "listener": listener, "calls": []}
    for idx, spec in enumerate(calls):
        c = {"op": spec["op"]}
        if spec.get("arg") is not None:
            c["arg"] = spec["arg"]
        c["await"] = bool(spec.get("aw", True))
        o = dict(out[idx])
        c["expect"] = o.pop("expect")
        for k, v in o.items():
            c[k] = v
        script["calls"].append(c)
    if listener == "record":
        rp = f"events/{lid}.recorded.events.json"
        put(rp, igr.serialize_events(recorded))
        script["expect_recorded_events"] = rp
    if listener == "dispatch-inside":
        script["expect_listener_errors"] = listener_errors
    if listener == "throw":
        script["expect_on_error_count"] = counters["on_error"]
    if extras.get("settle_order"):
        script["expect_settle_order"] = [i for i, sp in enumerate(calls) if sp["op"] in ASYNC]
    return script
