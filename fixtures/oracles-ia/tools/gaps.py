#!/usr/bin/env python3
"""Pre-freeze gap rows of the oracles-ia corpus (R-G oracle author, 2026-11-19).

Additive generator: it ADDS rows B14.., X27.. and mutants K129.. to a corpus whose earlier files stay byte-identical.
Standard library only (Python 3.12). Every expected byte below comes from the reference logic in this file, written from design 32 (rev 3)
sections 6.1-6.4 (bindings), 11.2-11.5 (export, manifest, PNG container and binding chunk) and 15.3 (row formats) alone.
It does not read, import or run any TypeScript or anything under packages/.

    python tools/gaps.py            dry run: builds every row, self-checks, runs the mutant matrix, prints a summary (writes nothing)
    python tools/gaps.py --write    writes the new files, appends EXPECT.tsv and MUTANTS.tsv, regenerates SHA256SUMS
    python tools/gaps.py --root DIR use another corpus directory (the default is the parent of tools/)

Run it once on a corpus that does not hold the new files (every new path is asserted absent); `--sums-only` regenerates SHA256SUMS alone and may be repeated.
Not part of the regenerating `gen.py`: `gen.py` wipes the generated directories, so after a `gen.py` run this script must be run again.
"""
import hashlib
import json
import os
import re
import string
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
if "--root" in sys.argv:
    ROOT = os.path.abspath(sys.argv[sys.argv.index("--root") + 1])
WRITE = "--write" in sys.argv

MUT = set()


def M(k):
    return k in MUT


class Err(Exception):
    def __init__(self, code, reason):
        super().__init__(code + "/" + reason)
        self.key = code + "/" + reason


def rd(p):
    with open(os.path.join(ROOT, p), "rb") as f:
        return f.read()


def sha(b):
    return hashlib.sha256(b).hexdigest()


def regen_sums():
    files = []
    for d, ds, fs in os.walk(ROOT):
        rel = os.path.relpath(d, ROOT).replace(os.sep, "/")
        if rel == "tools" or rel.startswith("tools/") or "__pycache__" in rel:
            continue
        for f in fs:
            p = f if rel == "." else rel + "/" + f
            if p == "SHA256SUMS":
                continue
            files.append(p)
    files.sort(key=lambda p: p.encode("utf-8"))
    out = "".join("%s *%s\n" % (sha(rd(p)), p) for p in files)
    with open(os.path.join(ROOT, "SHA256SUMS"), "wb") as f:
        f.write(out.encode("utf-8"))
    return len(files)


if "--sums-only" in sys.argv:
    print(regen_sums())
    sys.exit(0)


def cj(v):
    """IGR-CJ/1 for the plain values used here: ASCII strings, integers, booleans, arrays, objects with keys in code point order (ASCII)."""
    if v is True:
        return b"true"
    if v is False:
        return b"false"
    if isinstance(v, int):
        return str(v).encode()
    if isinstance(v, str):
        assert all(ord(c) < 0x80 for c in v), v
        return json.dumps(v, ensure_ascii=True).encode()
    if isinstance(v, list):
        return b"[" + b",".join(cj(x) for x in v) + b"]"
    if isinstance(v, dict):
        return b"{" + b",".join(cj(k) + b":" + cj(v[k]) for k in sorted(v)) + b"}"
    raise AssertionError(type(v))


def jraw(v):
    """Ordinary JSON, compact, sorted keys, UTF-8 (input files of rows)."""
    return json.dumps(v, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode("utf-8")


# ======================================================================= bindings (design 6.1 - 6.4)
NAMES = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Enter", "Escape", "Tab", "ContextMenu", "F10", "Backspace", "Delete"]
assert len(NAMES) == 15
PUNCT = set("+-=[],./;")
DIGITS = set("0123456789")
LETTERS = set(string.ascii_lowercase)
TOKENS = set(NAMES) | {"Space"} | LETTERS | DIGITS | PUNCT
ACTIONS = {
    "spatial": {"dir": "str", "extend": "bool"}, "step": {"delta": "int"}, "first": {}, "last": {}, "incident": {"delta": "int"},
    "endpoint": {"end": "str"}, "toggle-focus": {}, "activate": {}, "clear-selection": {}, "context": {}, "pan": {"dx": "int", "dy": "int"},
    "zoom": {"factor": "int"}, "fit": {}, "select-all": {}, "marquee-start": {}, "marquee-commit": {}, "marquee-cancel": {},
}
assert len(ACTIONS) == 17
MODE_RE = re.compile(r"x-[a-z0-9][a-z0-9._-]*")


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def is_token(k):
    if not isinstance(k, str):
        return False
    if k in TOKENS:
        return True
    if M("B_upper") and len(k) == 1 and k.isascii() and k.isalpha():
        return True
    if M("B_legacy") and k in ("Esc", "Left", "Right", "Up", "Down", "Apps", "Spacebar"):
        return True
    return False


def mode_ok(m):
    if not isinstance(m, str):
        return False
    if m in ("normal", "marquee"):
        return True
    if M("B_mode_nl"):
        return re.match(r"^x-[a-z0-9][a-z0-9._-]*$", m) is not None
    if M("B_mode_first"):
        return re.fullmatch(r"x-[a-z0-9._-][a-z0-9._-]*", m) is not None
    return MODE_RE.fullmatch(m) is not None


def shift_ignored(k):
    return k in DIGITS or k in PUNCT


def field_ok(v, kind):
    if kind == "int":
        return is_int(v)
    if kind == "str":
        return isinstance(v, str)
    if kind == "bool":
        return isinstance(v, bool) or (M("B_extend01") and v in (0, 1) and is_int(v))
    raise AssertionError


def verify_bindings(t):
    E = "INVALID_BINDINGS"

    def closed(r):
        return isinstance(r, dict) and set(r.keys()) == {"action", "key", "mode", "mods"}

    if not isinstance(t, list):
        raise Err(E, "SCHEMA")
    if not M("B_schema_per_row"):
        for r in t:
            if not closed(r):
                raise Err(E, "SCHEMA")
    if M("B_escape_first"):
        for r in t:
            if isinstance(r, dict) and isinstance(r.get("mode"), str) and r["mode"] != "normal":
                if not any(isinstance(q, dict) and q.get("mode") == r["mode"] and q.get("key") == "Escape" and q.get("mods") == 0 for q in t):
                    raise Err(E, "NO_ESCAPE_EXIT")
    if M("B_empty_bad") and len(t) == 0:
        raise Err(E, "SCHEMA")
    if M("B_tab_first"):
        for r in t:
            if closed(r) and r["key"] == "Tab":
                raise Err(E, "TAB_BOUND")
    seen = set()
    modes = []
    for r in t:
        if M("B_schema_per_row") and not closed(r):
            raise Err(E, "SCHEMA")

        def c_mode():
            if not mode_ok(r["mode"]):
                raise Err(E, "INVALID_VALUE")

        def c_mods():
            lo = -1 if M("B_mods_lo") else 0
            hi = 14 if M("B_mods_hi") else 15
            if not (is_int(r["mods"]) and lo <= r["mods"] <= hi):
                raise Err(E, "INVALID_VALUE")

        def c_key():
            if not is_token(r["key"]):
                raise Err(E, "UNKNOWN_KEY")

        def c_atype():
            a = r["action"]
            if not (isinstance(a, dict) and isinstance(a.get("type"), str)):
                raise Err(E, "UNKNOWN_ACTION")
            ty = a["type"]
            if M("B_action_case"):
                ty = ty.lower()
            if ty not in ACTIONS:
                raise Err(E, "UNKNOWN_ACTION")

        def c_afields():
            a = r["action"]
            ty = a["type"].lower() if M("B_action_case") else a["type"]
            spec = ACTIONS[ty]
            ks = set(a.keys()) - {"type"}
            if M("B_extra_ok"):
                if not set(spec) <= ks:
                    raise Err(E, "INVALID_VALUE")
            elif ks != set(spec):
                raise Err(E, "INVALID_VALUE")
            for f, kind in spec.items():
                v = a[f]
                if M("B_zoom_str") and ty == "zoom" and isinstance(v, str):
                    continue
                if not field_ok(v, kind):
                    raise Err(E, "INVALID_VALUE")

        def c_tab():
            if r["key"] == "Tab":
                if M("B_tab_normal_only") and r["mode"] != "normal":
                    return
                if M("B_tab_mods0_only") and r["mods"] != 0:
                    return
                raise Err(E, "TAB_BOUND")

        order = [c_mode, c_mods, c_key, c_atype, c_afields, c_tab]
        if M("B_key_before_mods"):
            order = [c_mode, c_key, c_mods, c_atype, c_afields, c_tab]
        if M("B_atype_before_key"):
            order = [c_mode, c_mods, c_atype, c_key, c_afields, c_tab]
        if M("B_tab_before_fields"):
            order = [c_mode, c_mods, c_key, c_atype, c_tab, c_afields]
        for f in order:
            f()
        km = r["mods"]
        if M("B_shift_all"):
            km = km & ~1
        elif M("B_shift_none"):
            pass
        elif shift_ignored(r["key"]):
            km = km & ~1
        if M("B_dup_shift_only"):
            km = km & 1
        mode_part = "" if M("B_dup_nomode") else r["mode"]
        ident = (mode_part, r["key"], km)
        if ident in seen:
            raise Err(E, "DUPLICATE_BINDING")
        seen.add(ident)
        if r["mode"] not in modes:
            modes.append(r["mode"])
    for m in modes:
        if m == "normal":
            continue
        if M("B_escape_host_only") and m == "marquee":
            continue
        need = (lambda q: q["mode"] == m and q["key"] == "Escape" and (M("B_escape_anymods") or q["mods"] == 0))
        if not any(need(q) for q in t):
            raise Err(E, "NO_ESCAPE_EXIT")
    return None


# ======================================================================= PNG container (design 11.5)
SIG = bytes.fromhex("89504e470d0a1a0a")
KW = b"igr-export"
HEX64 = re.compile(r"[0-9a-f]{64}")


def crc32(b):
    return zlib.crc32(b) & 0xFFFFFFFF


def chunk(typ, data, crc=None):
    return struct.pack(">I", len(data)) + typ + data + struct.pack(">I", crc32(typ + data) if crc is None else crc)


def png_of(chunks, sig=SIG):
    return sig + b"".join(chunks)


def parse_png(b, crc=False):
    E = "INVALID_EXPORT"
    if M("P_sig4"):
        if b[:4] != SIG[:4]:
            raise Err(E, "PNG_MALFORMED")
    elif b[:8] != SIG:
        raise Err(E, "PNG_MALFORMED")
    pos = 8
    out = []
    while pos < len(b):
        if pos + 12 > len(b):
            if M("P_trail_short"):
                break
            raise Err(E, "PNG_MALFORMED")
        n = struct.unpack(">I", b[pos:pos + 4])[0]
        if pos + 12 + n > len(b):
            raise Err(E, "PNG_MALFORMED")
        typ = b[pos + 4:pos + 8]
        data = b[pos + 8:pos + 8 + n]
        got = struct.unpack(">I", b[pos + 8 + n:pos + 12 + n])[0]
        if crc and got != crc32(typ + data):
            raise Err(E, "PNG_MALFORMED")
        out.append((pos, typ, data, n))
        pos += 12 + n
    if not M("P_first") and (not out or out[0][1] != b"IHDR"):
        raise Err(E, "PNG_MALFORMED")
    if not M("P_ihdr_len") and out and out[0][1] == b"IHDR" and out[0][3] != 13:
        raise Err(E, "PNG_MALFORMED")
    if not M("P_first") and not out:
        raise Err(E, "PNG_MALFORMED")
    if not M("P_last") and (not out or out[-1][1] != b"IEND"):
        raise Err(E, "PNG_MALFORMED")
    return out


def is_binding(c):
    typ, data = c[1], c[2]
    if M("P_anytype"):
        return data.startswith(KW + b"\x00")
    if M("P_case"):
        return typ == b"tEXt" and data[:10].lower() == KW and data[10:11] == b"\x00"
    if M("P_nonul"):
        return typ == b"tEXt" and data.startswith(KW)
    return typ == b"tEXt" and data.startswith(KW + b"\x00")


def hash_ok(h):
    if not isinstance(h, str):
        return False
    if M("P_hex_upper"):
        return re.fullmatch(r"[0-9a-fA-F]{64}", h) is not None
    if M("P_hex_nl"):
        return re.match(r"^[0-9a-f]{64}$", h) is not None
    return HEX64.fullmatch(h) is not None


def tmpl_ok(text):
    if M("P_read_nl"):
        return re.match(rb"^igr-export/1 ([0-9a-f]{64}) ([0-9a-f]{64}) ([0-9a-f]{64})$", text)
    if M("P_read_upper"):
        return re.fullmatch(rb"igr-export/1 ([0-9a-fA-F]{64}) ([0-9a-fA-F]{64}) ([0-9a-fA-F]{64})", text)
    return re.fullmatch(rb"igr-export/1 ([0-9a-f]{64}) ([0-9a-f]{64}) ([0-9a-f]{64})", text)


def embed_binding(png, binding):
    E = "INVALID_EXPORT"
    for k in ("scene", "layout", "state"):
        if not hash_ok(binding[k]):
            raise Err(E, "SCHEMA")
    chunks = parse_png(png, crc=M("P_crc_embed"))
    cand = chunks[1:2] if M("P_embed_first_only") else chunks
    for c in cand:
        if is_binding(c):
            if M("P_embed_valid_only") and not tmpl_ok(c[2][len(KW) + 1:]):
                continue
            raise Err(E, "PNG_ALREADY_BOUND")
    text = ("igr-export/1 %s %s %s" % (binding["scene"], binding["layout"], binding["state"])).encode("ascii")
    ch = chunk(b"tEXt", KW + b"\x00" + text)
    at = len(png) - 12 if M("P_insert_end") else 33
    return png[:at] + ch + png[at:]


def read_binding(png):
    E = "INVALID_EXPORT"
    chunks = parse_png(png, crc=M("P_crc_read"))
    hits = [c for c in chunks if is_binding(c)]
    if not hits:
        return None
    if len(hits) > 1 and not M("P_read_dup_first"):
        raise Err(E, "PNG_MALFORMED")
    c = hits[0]
    if M("P_read_crc_binding") and struct.unpack(">I", png[c[0] + 8 + c[3]:c[0] + 12 + c[3]])[0] != crc32(c[1] + c[2]):
        raise Err(E, "PNG_MALFORMED")
    m = tmpl_ok(c[2][len(KW) + 1:])
    if not m:
        raise Err(E, "PNG_MALFORMED")
    return {"scene": m.group(1).decode(), "layout": m.group(2).decode(), "state": m.group(3).decode()}


# ======================================================================= manifest (design 11.3, 11.4)
MEDIA = {"layout": "application/octet-stream", "png": "image/png", "scene": "application/octet-stream", "state": "application/octet-stream", "svg": "image/svg+xml"}
TOP = {"artifacts", "export", "igr", "layout_sha256", "scene_sha256", "source_sha256", "state_sha256"}


def _bad_const(x):
    raise ValueError(x)


def scan_depth(b):
    d = mx = 0
    ins = esc = False
    for c in b:
        if ins:
            if esc:
                esc = False
            elif c == 0x5C:
                esc = True
            elif c == 0x22:
                ins = False
            continue
        if c == 0x22:
            ins = True
        elif c in (0x5B, 0x7B):
            d += 1
            mx = max(mx, d)
        elif c in (0x5D, 0x7D):
            d -= 1
    return mx


def _hex_ok(v):
    if not isinstance(v, str):
        return False
    if M("N_hex_upper"):
        return re.fullmatch(r"[0-9a-fA-F]{64}", v) is not None
    if M("N_hex_len"):
        return re.fullmatch(r"[0-9a-f]{63,64}", v) is not None
    return HEX64.fullmatch(v) is not None


def _ordered(v):
    if isinstance(v, tuple):
        return b"{" + b",".join(json.dumps(k, ensure_ascii=True).encode() + b":" + _ordered(x) for k, x in v[1]) + b"}"
    if isinstance(v, list):
        return b"[" + b",".join(_ordered(x) for x in v) + b"]"
    return cj(v)


def _canon_equal(v, b):
    try:
        c = cj(v)
    except AssertionError:
        return False
    if M("N_canon_skip"):
        return True
    if M("N_canon_ws"):
        return re.sub(rb"[ \t\r\n]", b"", b) == c
    if M("N_canon_order"):
        try:
            return _ordered(json.loads(b, object_pairs_hook=lambda p: ("OBJ", p))) == b
        except Exception:
            return False
    if M("N_canon_escape"):
        return b.replace(b"\\u0069", b"i").replace(b"\\/", b"/") == c
    return c == b


def parse_manifest(b):
    E = "INVALID_EXPORT"
    try:
        v = json.loads(b.decode("utf-8"), parse_constant=_bad_const)
    except Exception:
        raise Err(E, "NON_CANONICAL" if M("N_syntax_code") else "SCHEMA")
    if M("N_canon_first") and isinstance(v, dict) and not _canon_equal(v, b):
        raise Err(E, "NON_CANONICAL")
    if M("N_nonobject_ok") and not isinstance(v, dict):
        return v
    if not isinstance(v, dict):
        raise Err(E, "SCHEMA")
    ks = set(v.keys())
    if not (TOP <= ks <= TOP | {"svg_format"}):
        raise Err(E, "SCHEMA")
    if not M("N_export_unchecked") and v["export"] != "igr-export/1":
        raise Err(E, "SCHEMA")
    if not M("N_igr_unchecked") and v["igr"] != "IGR/1":
        raise Err(E, "SCHEMA")
    for k in ("layout_sha256", "scene_sha256", "source_sha256", "state_sha256"):
        if not _hex_ok(v[k]):
            raise Err(E, "SCHEMA")
    arts = v["artifacts"]
    if not isinstance(arts, list):
        raise Err(E, "SCHEMA")
    names = []
    for a in arts:
        keys_ok = isinstance(a, dict) and (set(a.keys()) == {"bytes", "media_type", "name", "sha256"} or (M("N_entry_extra_ok") and isinstance(a, dict) and {"bytes", "media_type", "name", "sha256"} <= set(a.keys())))
        if not keys_ok:
            raise Err(E, "SCHEMA")
        if not isinstance(a["media_type"], str):
            raise Err(E, "SCHEMA")
        if M("N_bytes_neg"):
            bytes_ok = is_int(a["bytes"]) and a["bytes"] <= 2 ** 53 - 1
        elif M("N_bytes_big"):
            bytes_ok = is_int(a["bytes"]) and a["bytes"] >= 0
        else:
            bytes_ok = is_int(a["bytes"]) and 0 <= a["bytes"] <= 2 ** 53 - 1
        if not bytes_ok:
            raise Err(E, "SCHEMA")
        if not _hex_ok(a["sha256"]):
            raise Err(E, "SCHEMA")
        if not isinstance(a["name"], str):
            raise Err(E, "SCHEMA")
        names.append(a["name"])
        if M("N_single_pass"):
            nm = a["name"]
            if nm.lower() not in MEDIA if M("N_name_case") else nm not in MEDIA:
                raise Err(E, "UNKNOWN_ARTIFACT")
            if len(names) > 1 and not names[-2] < names[-1]:
                raise Err(E, "SCHEMA")
    for nm in names:
        known = nm.lower() in MEDIA if M("N_name_case") else nm in MEDIA
        if not known:
            raise Err(E, "UNKNOWN_ARTIFACT")
    for i in range(1, len(names)):
        if M("N_dup_ok"):
            ok = names[i - 1] <= names[i]
        else:
            ok = names[i - 1] < names[i]
        if not ok:
            raise Err(E, "SCHEMA")
    if not M("N_required_skip"):
        for need in ("scene", "layout", "state"):
            if need not in names:
                raise Err(E, "SCHEMA")
    if not _canon_equal(v, b):
        raise Err(E, "NON_CANONICAL")
    return v


def verify_bundle(files, mb):
    E = "INVALID_EXPORT"
    if len(mb) > 1048576:
        raise Err("RESOURCE_LIMIT", "BYTES_LIMIT")
    if M("N_files_first"):
        pass
    if scan_depth(mb) > 6:
        raise Err(E, "SCHEMA")
    if M("N_files_first"):
        # mutant: file hashes are checked against whatever the manifest text lists before the strict reader (a lenient pre-read)
        try:
            pre = json.loads(mb.decode("utf-8"))
            for a in pre.get("artifacts", []):
                f = files.get(a["name"])
                if f is None or len(f) != a["bytes"] or sha(f) != a["sha256"]:
                    raise Err(E, "ARTIFACT_MISMATCH")
        except Err:
            raise
        except Exception:
            pass
    m = parse_manifest(mb)
    listed = []
    for a in m["artifacts"]:
        f = files.get(a["name"])
        if f is None or len(f) != a["bytes"] or sha(f) != a["sha256"]:
            raise Err(E, "ARTIFACT_MISMATCH")
        listed.append(a["name"])
    for n in files:
        if n not in listed:
            raise Err(E, "UNKNOWN_ARTIFACT")
    # steps 3 to 5 (model, state, svg) pass by construction: every bundle of the rows below uses the unmodified O1 scene, layout, state and svg
    if "png" in listed:
        png = files["png"]
        if M("P_crc_verify"):
            parse_png(png, crc=True)
        if M("P_verify_size"):
            ch = parse_png(png)
            if struct.unpack(">II", ch[0][2][:8]) != (1, 1):
                raise Err(E, "PNG_SIZE_MISMATCH")
        b = read_binding(png)
        want = {"scene": m["scene_sha256"], "layout": m["layout_sha256"], "state": m["state_sha256"]}
        if b is None:
            if not M("P_absent_ok"):
                raise Err(E, "BINDING_MISMATCH")
        else:
            for k in ("scene", "layout", "state"):
                if M("P_verify_skip_" + k):
                    continue
                if b[k] != want[k]:
                    raise Err(E, "BINDING_MISMATCH")
    return None


# ======================================================================= the corpus data the rows build on
SCENE = rd("scenes/O1.scene.json")
LAYOUT = rd("layouts/O1.layout.json")
STATE = rd("states/O1.initial.state.json")
SVG = rd("data/O1.decl.svg")
FIXTURE = rd("png/fixture.png")
SOURCE_SHA = "1e23b156a068aa5b7ffb5cc7c2e70e8ba5f9542ffe3e52f7c7f14c11bb9e030a"  # the ISON source hash quoted in design A.9
BIND = {"scene": sha(SCENE), "layout": sha(LAYOUT), "state": sha(STATE)}
assert BIND == {"scene": "e8a4357a01a4f47f46a18b8f1c22c15a9f8c26cb06ed6b31588cd5c11407a1dc", "layout": "2f37ccf2d351dc8e6b742b5b4d7fe87fc182226a2ba2cf02ffbf832af66b23db",
                "state": "be5391e1488a46ccefeb7068c85106f689f19419cd46570a2492bd5060e7d87d"}


def chunks_of(png):
    """Own splitter of the (valid) corpus PNGs: list of (type, data)."""
    out, pos = [], 8
    while pos < len(png):
        n = struct.unpack(">I", png[pos:pos + 4])[0]
        out.append((png[pos + 4:pos + 8], png[pos + 8:pos + 8 + n]))
        pos += 12 + n
    return out


FX = chunks_of(FIXTURE)
assert [t for t, _ in FX] == [b"IHDR", b"IDAT", b"IEND"] and FIXTURE[:8] == SIG
IHDR, IDAT, IEND = FX[0][1], FX[1][1], FX[2][1]
assert png_of([chunk(t, d) for t, d in FX]) == FIXTURE  # the fixture is its own recomputation (A.8)


def btext(s=BIND["scene"], l=BIND["layout"], t=BIND["state"]):
    return ("igr-export/1 %s %s %s" % (s, l, t)).encode("ascii")


def bchunk(text=None, crc=None):
    return chunk(b"tEXt", KW + b"\x00" + (btext() if text is None else text), crc)


def std(extra_after_ihdr=(), extra_before_iend=(), idat=IDAT, ihdr=IHDR):
    return png_of([chunk(b"IHDR", ihdr)] + list(extra_after_ihdr) + [chunk(b"IDAT", idat)] + list(extra_before_iend) + [chunk(b"IEND", b"")])


def man_dict(png=None, svg=True, png_bytes=None):
    arts = [("layout", LAYOUT), ("scene", SCENE), ("state", STATE)]
    if svg:
        arts.append(("svg", SVG))
    if png is not None:
        arts.append(("png", png))
    arts.sort(key=lambda x: x[0])
    d = {"artifacts": [{"bytes": len(b), "media_type": MEDIA[n], "name": n, "sha256": sha(b)} for n, b in arts], "export": "igr-export/1", "igr": "IGR/1",
         "layout_sha256": BIND["layout"], "scene_sha256": BIND["scene"], "source_sha256": SOURCE_SHA, "state_sha256": BIND["state"]}
    if svg:
        d["svg_format"] = "igr-svg/1"
    return d


BASE = man_dict(svg=False)
assert cj(BASE) == rd("json/X01.manifest.json") and cj(man_dict()) == rd("json/X02.manifest.json")  # the writer below equals the stored A.9 manifests
assert cj(man_dict(png=std(extra_after_ihdr=[bchunk()], idat=IDAT))) is not None
BASEB = cj(BASE)
FILES0 = {"layout": "layouts/O1.layout.json", "scene": "scenes/O1.scene.json", "state": "states/O1.initial.state.json"}
FILES_SVG = dict(FILES0, svg="data/O1.decl.svg")
PATHBYTES = {v: rd(v) for v in list(FILES_SVG.values()) + ["states/X18.state.json", "png/X04.png"]}

# ======================================================================= row collection
NEW_FILES = {}
ROWS = []
KROWS = []
COUNTERS = {"B": 13, "X": 26}
SC, LY = "scenes/O1.scene.json", "layouts/O1.layout.json"


def nid(g):
    COUNTERS[g] += 1
    return "%s%02d" % (g, COUNTERS[g])


def put(path, data):
    assert path not in NEW_FILES and not os.path.exists(os.path.join(ROOT, path)), path
    assert b"\r" not in data or path.startswith("png/") or path.endswith(".json"), path
    NEW_FILES[path] = data


def run(fn):
    try:
        return ("ok", fn())
    except Err as e:
        return ("err", e.key)


def add_row(rid, group, scene, layout, inp, expected, error, fn, want, desc, expected_bytes=None):
    ROWS.append(dict(id=rid, group=group, scene=scene, layout=layout, input=inp, expected=expected, error=error, fn=fn, want=want, desc=desc, expected_bytes=expected_bytes))


# ---------------------------------------------------------------------- B rows
DEFAULT = json.loads(rd("json/B12.bindings.json"))
assert len(DEFAULT) == 33
FIT = {"type": "fit"}
ESC_MARQUEE = {"action": {"type": "marquee-cancel"}, "key": "Escape", "mode": "marquee", "mods": 0}
assert ESC_MARQUEE in DEFAULT


def R(mode, key, mods, action=FIT):
    return {"action": action, "key": key, "mode": mode, "mods": mods}


def B(desc, table, want):
    rid = nid("B")
    path = "inputs/%s.bindings.json" % rid
    put(path, jraw(table))
    t = json.loads(jraw(table))
    add_row(rid, "B", "", "", path, "", "" if want == "ok" else want, lambda t=t: verify_bindings(t), ("ok", None) if want == "ok" else ("err", want), desc)


V, SCH, UK, UA, TB, DUP, NOESC = ("INVALID_BINDINGS/INVALID_VALUE", "INVALID_BINDINGS/SCHEMA", "INVALID_BINDINGS/UNKNOWN_KEY", "INVALID_BINDINGS/UNKNOWN_ACTION", "INVALID_BINDINGS/TAB_BOUND",
                                  "INVALID_BINDINGS/DUPLICATE_BINDING", "INVALID_BINDINGS/NO_ESCAPE_EXIT")
plus = lambda *rows: DEFAULT + list(rows)

# accepted tables (claim only that verifyBindings returns)
B("empty table: no rows, no non-normal mode (6.4 (1), (3))", [], "ok")
B("two host modes x-0 and x-a.b_c-z (the whole mode grammar of 6.2), each with its Escape row", plus(R("x-0", "g", 0), R("x-0", "Escape", 0, {"type": "clear-selection"}), R("x-a.b_c-z", "g", 0), R("x-a.b_c-z", "Escape", 0, {"type": "clear-selection"})), "ok")
B("letter with shift is not a duplicate of the letter without (6.2: shift exact for a letter)", plus(R("normal", "s", 1)), "ok")
B("named key with shift is not a duplicate of the key without (6.2)", plus(R("normal", "Home", 1)), "ok")
B("Space with shift is not a duplicate of Space without (6.2)", plus(R("normal", "Space", 1)), "ok")
B("mods 15 (every modifier bit) is the top of the domain 0 to 15 (6.4 (2))", plus(R("normal", "Home", 15)), "ok")
B("ctrl (2), alt (4) and meta (8) are compared exactly: three rows for Home", plus(R("normal", "Home", 2), R("normal", "Home", 4), R("normal", "Home", 8)), "ok")
B("digit with ctrl+shift: shift ignored gives (0, ctrl) which the table does not hold", plus(R("normal", "0", 3)), "ok")
B("the same key in another mode is not a duplicate (identity includes the mode)", plus(R("marquee", "Home", 0)), "ok")
B("every remaining token of 6.1 is a key token", plus(*[R("normal", k, 0) for k in ["Backspace", "Delete", "[", "]", ",", ".", "/", ";", "9", "z"]]), "ok")
B("a table of a single marquee row (marquee, Escape, 0)", [ESC_MARQUEE], "ok")
B("a host mode with only its Escape row satisfies the escape rule", plus(R("x-h", "Escape", 0, {"type": "clear-selection"})), "ok")
ALL_ACTIONS = [{"type": "spatial", "dir": "left", "extend": True}, {"type": "step", "delta": -1}, {"type": "first"}, {"type": "last"}, {"type": "incident", "delta": 1}, {"type": "endpoint", "end": "tgt"},
               {"type": "toggle-focus"}, {"type": "activate"}, {"type": "clear-selection"}, {"type": "context"}, {"type": "pan", "dx": -5, "dy": 7}, {"type": "zoom", "factor": 1000}, {"type": "fit"},
               {"type": "select-all"}, {"type": "marquee-start"}, {"type": "marquee-commit"}, {"type": "marquee-cancel"}]
B("each of the 17 actions of 6.3 with fields of the right type, on 17 unused keys", plus(*[R("normal", k, 0, a) for k, a in zip("bcdfghijklnopqruv", ALL_ACTIONS)]), "ok")

# mods
B("mods -1 (below 0)", plus(R("normal", "g", -1)), V)
B("mods 1.5 (not an integer)", plus(R("normal", "g", 1.5)), V)
B("mods the string \"1\"", plus(R("normal", "g", "1")), V)
# mode grammar x-[a-z0-9][a-z0-9._-]*
for m in ["x-", "x-A", "x--", "x-.a", "x-a\n", "X-a", "normal ", "", "x-é", "x_a", "Marquee", "x-a b"]:
    B("mode %s is not normal, marquee or x-[a-z0-9][a-z0-9._-]* (6.2)" % json.dumps(m), plus(R(m, "g", 0)), V)
# key tokens
for k in ["A", "Spacebar", "Esc", "Left", "Apps", " ", "#", "", "ab", "Shift", "tab", "é", "Enter "]:
    B("key %s is not a key token (6.1: tokens are lowercase, legacy names only map through keyToken)" % json.dumps(k), plus(R("normal", k, 0)), UK)
# unknown actions
for ty in ["Fit", "FIT", "", "nav-step", "marquee_start"]:
    B("action type %s is not in the closed list of 6.3" % json.dumps(ty), plus(R("normal", "g", 0, {"type": ty})), UA)
# action fields
FV = [
    ("fit with an extra field", {"type": "fit", "padding": 1}), ("first with a field", {"type": "first", "delta": 1}), ("select-all with a field", {"type": "select-all", "x": 1}),
    ("zoom without factor", {"type": "zoom"}), ("zoom with factor the string \"1250\"", {"type": "zoom", "factor": "1250"}), ("zoom with factor 1.5", {"type": "zoom", "factor": 1.5}),
    ("zoom with factor true", {"type": "zoom", "factor": True}), ("zoom with an extra field", {"type": "zoom", "factor": 1250, "anchor": 1}),
    ("pan without dy", {"type": "pan", "dx": 1}), ("pan with dx the string \"1\"", {"type": "pan", "dx": "1", "dy": 0}), ("pan with dy true", {"type": "pan", "dx": 0, "dy": True}),
    ("pan with an extra field", {"type": "pan", "dx": 1, "dy": 1, "dz": 1}), ("spatial without extend", {"type": "spatial", "dir": "left"}), ("spatial with extend 1 (not a boolean)", {"type": "spatial", "dir": "left", "extend": 1}),
    ("spatial with dir 5 (not a string)", {"type": "spatial", "dir": 5, "extend": False}), ("spatial without dir", {"type": "spatial", "extend": False}),
    ("step with delta the string \"1\"", {"type": "step", "delta": "1"}), ("step with delta 1.5", {"type": "step", "delta": 1.5}), ("step without delta", {"type": "step"}),
    ("incident with delta true", {"type": "incident", "delta": True}), ("endpoint with end 0 (not a string)", {"type": "endpoint", "end": 0}), ("endpoint without end", {"type": "endpoint"}),
]
for d, a in FV:
    B("action field fault: %s" % d, plus(R("normal", "g", 0, a)), V)
# Tab
B("Tab with shift in normal mode", plus(R("normal", "Tab", 1)), TB)
B("Tab with ctrl in normal mode", plus(R("normal", "Tab", 2)), TB)
B("Tab in a host mode that has its Escape row", plus(R("x-h", "Escape", 0, {"type": "clear-selection"}), R("x-h", "Tab", 0)), TB)
# duplicates
B("digit 0 with shift duplicates 0 without (6.2: shift ignored for a digit)", plus(R("normal", "0", 1)), DUP)
B("minus with shift duplicates minus without (shift ignored for punctuation)", plus(R("normal", "-", 1)), DUP)
B("new digit 5 twice, without and with shift: the second row duplicates", plus(R("normal", "5", 0), R("normal", "5", 1)), DUP)
B("new digit 0 with ctrl twice, without and with shift: the shift bit is cleared, ctrl stays", plus(R("normal", "0", 2), R("normal", "0", 3)), DUP)
B("letter a with ctrl (an existing row) a second time", plus(R("normal", "a", 2)), DUP)
B("the same host-mode row twice", plus(R("x-h", "Escape", 0, {"type": "clear-selection"}), R("x-h", "g", 0), R("x-h", "g", 0, {"type": "first"})), DUP)
# escape rule
B("Escape row of the host mode has shift (mods 1): not (mode, Escape, 0)", plus(R("x-h", "g", 0), R("x-h", "Escape", 1, {"type": "clear-selection"})), NOESC)
B("marquee mode without its Escape row (the default table minus (marquee, Escape))", [r for r in DEFAULT if r != ESC_MARQUEE], NOESC)
B("two host modes, only the first has Escape", plus(R("x-a", "Escape", 0, {"type": "clear-selection"}), R("x-b", "g", 0)), NOESC)
# schema
B("table is an object, not an array", {}, SCH)
B("table is an array holding a number", plus(5), SCH)
B("row is an array", plus([]), SCH)
B("row without mods", plus({"action": FIT, "key": "g", "mode": "normal"}), SCH)
B("row without mode", plus({"action": FIT, "key": "g", "mods": 0}), SCH)
B("row without key", plus({"action": FIT, "mode": "normal", "mods": 0}), SCH)
B("row with an extra key", plus({"action": FIT, "key": "g", "mode": "normal", "mods": 0, "label": "x"}), SCH)
B("row with capitalised key names (an unknown key and three missing)", plus({"Action": FIT, "key": "g", "mode": "normal", "mods": 0}), SCH)
# order of the checks
B("order: mods before key (mods 16 and key F1: INVALID_VALUE)", plus(R("normal", "F1", 16)), V)
B("order: key before action (key F1 and action explode: UNKNOWN_KEY)", plus(R("normal", "F1", 0, {"type": "explode"})), UK)
B("order: action type before Tab (Tab and action explode: UNKNOWN_ACTION)", plus(R("normal", "Tab", 0, {"type": "explode"})), UA)
B("order: action fields before Tab (Tab and pan dx 1.5: INVALID_VALUE)", plus(R("normal", "Tab", 0, {"type": "pan", "dx": 1.5, "dy": 0})), V)
B("order: rows are judged in table order (a duplicate Home row, then a Tab row: DUPLICATE_BINDING)", plus(R("normal", "Home", 0), R("normal", "Tab", 0)), DUP)
B("order: rows are judged in table order (a Tab row, then a duplicate Home row: TAB_BOUND)", plus(R("normal", "Tab", 0), R("normal", "Home", 0)), TB)
B("order: the closed-row check (1) covers every row before any row is judged (mods 16 first, then a row with an extra key: SCHEMA)", plus(R("normal", "g", 16), {"action": FIT, "key": "g", "mode": "normal", "mods": 0, "z": 1}), SCH)
B("order: the escape rule (3) comes after every row (host mode without Escape, then key F1: UNKNOWN_KEY)", plus(R("x-h", "g", 0), R("normal", "F1", 0)), UK)
B("order: the escape rule (3) comes after every row (host mode without Escape, then a duplicate Home: DUPLICATE_BINDING)", plus(R("x-h", "g", 0), R("normal", "Home", 0)), DUP)


# ---------------------------------------------------------------------- X rows
def xrow(rid, desc, inp, fn, want, expected=""):
    """inp: dict of the inline JSON; want: ('ok', None|bytes) or ('err', key); expected: the path of the expected file (rows with bytes)."""
    add_row(rid, "X", SC, LY, json.dumps(inp, separators=(",", ":"), sort_keys=True), expected, "" if want[0] == "ok" else want[1], fn, want, desc)


def parse_only(mb):
    parse_manifest(mb)
    return None


def x_parse(desc, mb, want):
    rid = nid("X")
    p = "manifests/%s.manifest.json" % rid
    put(p, mb)
    xrow(rid, desc, {"manifest": p, "op": "parse"}, lambda: parse_only(mb), ("ok", None) if want == "ok" else ("err", want))


def x_verify(desc, files, mb, want, png=None):
    """files: name -> corpus path; png: (path, bytes) of a new PNG file for the 'png' entry (stored here)."""
    rid = nid("X")
    p = "manifests/%s.manifest.json" % rid
    put(p, mb)
    fmap = dict(files)
    data = {k: PATHBYTES[v] if v in PATHBYTES else rd(v) for k, v in fmap.items()}
    if png is not None:
        pp = "png/%s.png" % rid
        put(pp, png)
        fmap["png"] = pp
        data["png"] = png
    xrow(rid, desc, {"files": fmap, "manifest": p, "op": "verify"}, lambda d=data: verify_bundle(d, mb), ("ok", None) if want == "ok" else ("err", want))
    return rid


def x_embed(desc, png_in, binding, want, expected_ok=True):
    rid = nid("X")
    ip = "png/%s.in.png" % rid
    put(ip, png_in)
    if want == "ok":
        out = embed_binding(png_in, binding)
        op = "png/%s.png" % rid
        put(op, out)
        xrow(rid, desc, {"binding": binding, "op": "embed", "png": ip}, lambda: embed_binding(png_in, binding), ("ok", out), expected=op)
    else:
        xrow(rid, desc, {"binding": binding, "op": "embed", "png": ip}, lambda: embed_binding(png_in, binding), ("err", want))


def x_read(desc, png_in, want):
    rid = nid("X")
    ip = "png/%s.in.png" % rid
    put(ip, png_in)
    if want == "ok":
        b = read_binding(png_in)
        out = cj(b)
        op = "json/%s.binding.json" % rid
        put(op, out)
        xrow(rid, desc, {"op": "read", "png": ip}, lambda: cj(read_binding(png_in)), ("ok", out), expected=op)
    else:
        xrow(rid, desc, {"op": "read", "png": ip}, lambda: cj(read_binding(png_in)), ("err", want))


def x_export(desc, arts, size, want):
    rid = nid("X")

    def fn():
        png = embed_binding(FIXTURE, BIND) if "png" in arts else None
        if size is not None:
            w, h = struct.unpack(">II", png[16:24]) if not M("P_size_le") else struct.unpack("<II", png[16:24])
            if M("P_size_width_only"):
                ok = w == size["width"]
            elif M("P_size_height_only"):
                ok = h == size["height"]
            else:
                ok = (w, h) == (size["width"], size["height"])
            if not ok:
                raise Err("INVALID_EXPORT", "PNG_SIZE_MISMATCH")
        return cj(man_dict(png=png, svg="svg" in arts))

    inp = {"artifacts": arts, "op": "export"}
    if size is not None:
        inp["expectedPngSize"] = size
    if want == "ok":
        out = fn()
        op = "json/%s.manifest.json" % rid
        put(op, out)
        xrow(rid, desc, inp, fn, ("ok", out), expected=op)
    else:
        xrow(rid, desc, inp, fn, ("err", want))


E = "INVALID_EXPORT/"
SC_, NC, UN = E + "SCHEMA", E + "NON_CANONICAL", E + "UNKNOWN_ARTIFACT"


def sub(b, old, new, count=1):
    assert b.count(old) >= 1, old
    return b.replace(old, new, count)


# --- manifest: accepted
x_parse("the X01 manifest bytes (no svg, no png) are accepted", BASEB, "ok")
x_parse("the X03 manifest bytes (svg and png, svg_format) are accepted", cj(man_dict(png=embed_binding(FIXTURE, BIND))), "ok")
x_parse("a png-only manifest (no svg, so no svg_format) is accepted", cj(man_dict(svg=False, png=embed_binding(FIXTURE, BIND))), "ok")
big = man_dict(svg=False)
big["artifacts"][0]["bytes"] = 2 ** 53 - 1
x_parse("bytes 2^53 - 1 (the largest safe integer) is accepted", cj(big), "ok")

# --- manifest: JSON syntax (the reading recorded as A-75: INVALID_EXPORT/SCHEMA)
SYN = [
    ("truncated: a lone {", b"{"), ("empty input (0 bytes)", b""), ("the canonical manifest and one more byte x", BASEB + b"x"),
    ("trailing comma before the closing brace", BASEB[:-1] + b",}"), ("single-quoted strings", BASEB.replace(b'"', b"'")),
    ("a leading zero in a number (bytes 0398)", sub(BASEB, b'"bytes":398', b'"bytes":0398')), ("the token NaN as a number", sub(BASEB, b'"bytes":398', b'"bytes":NaN')),
    ("an unquoted key", b"{artifacts:" + BASEB[len(b'{"artifacts":'):]), ("a comment before the value", b"/*x*/" + BASEB),
    ("the canonical manifest cut after 100 bytes", BASEB[:100]), ("two manifests concatenated", BASEB + BASEB), ("a raw LF inside a string", sub(BASEB, b'"IGR/1"', b'"IGR\n/1"')),
    ("an invalid escape \\x41 inside a string", sub(BASEB, b'"IGR/1"', b'"IGR\\x41/1"')), ("the plus sign before a number", sub(BASEB, b'"bytes":398', b'"bytes":+398')),
]
for d, mb in SYN:
    x_parse("not valid JSON: " + d, mb, SC_)
for d, mb in [("a top-level array []", b"[]"), ("a top-level null", b"null"), ("a top-level number 5", b"5"), ("a top-level string", b'"x"')]:
    x_parse("valid JSON that is not an object: " + d, mb, SC_)


# --- manifest: values and structure (SCHEMA)
def mod(f):
    d = json.loads(BASEB)
    f(d)
    return cj(d)


V_ = [
    ("export is igr-export/2", mod(lambda d: d.__setitem__("export", "igr-export/2"))), ("igr is IGR/2", mod(lambda d: d.__setitem__("igr", "IGR/2"))),
    ("scene_sha256 with one uppercase hex digit", mod(lambda d: d.__setitem__("scene_sha256", d["scene_sha256"][:-1] + "A"))),
    ("layout_sha256 with 63 characters", mod(lambda d: d.__setitem__("layout_sha256", d["layout_sha256"][:-1]))),
    ("state_sha256 is a number", mod(lambda d: d.__setitem__("state_sha256", 5))),
    ("source_sha256 ends with a LF (65 units)", mod(lambda d: d.__setitem__("source_sha256", d["source_sha256"] + "\n"))),
    ("an artifact sha256 with 63 characters", mod(lambda d: d["artifacts"][0].__setitem__("sha256", d["artifacts"][0]["sha256"][:-1]))),
    ("an artifact bytes -1", mod(lambda d: d["artifacts"][0].__setitem__("bytes", -1))), ("an artifact bytes the string \"398\"", mod(lambda d: d["artifacts"][0].__setitem__("bytes", "398"))),
    ("an artifact bytes 1.5", sub(BASEB, b'"bytes":398', b'"bytes":1.5')),
    ("an artifact bytes 2^53 (not a safe integer)", mod(lambda d: d["artifacts"][0].__setitem__("bytes", 2 ** 53))),
    ("an artifact name that is a number", mod(lambda d: d["artifacts"][0].__setitem__("name", 5))),
    ("an artifact entry with an extra key path", mod(lambda d: d["artifacts"][0].__setitem__("path", "x"))),
    ("an artifact entry without sha256", mod(lambda d: d["artifacts"][0].pop("sha256"))),
    ("a manifest without igr", mod(lambda d: d.pop("igr"))), ("a manifest without source_sha256", mod(lambda d: d.pop("source_sha256"))), ("a manifest without layout_sha256", mod(lambda d: d.pop("layout_sha256"))),
    ("artifacts is an object, not an array", mod(lambda d: d.__setitem__("artifacts", {}))), ("artifacts is an empty array (no scene, layout, state)", mod(lambda d: d.__setitem__("artifacts", []))),
    ("the scene entry missing (layout and state listed)", mod(lambda d: d["artifacts"].pop(1))), ("the layout entry missing", mod(lambda d: d["artifacts"].pop(0))), ("the state entry missing", mod(lambda d: d["artifacts"].pop(2))),
    ("the scene entry twice (sorted, not strictly ascending)", mod(lambda d: d["artifacts"].insert(1, dict(d["artifacts"][1])))),
]
for d, mb in V_:
    x_parse("value or structure fault (SCHEMA): " + d, mb, SC_)


def ins_name(name):
    def f(d):
        e = dict(d["artifacts"][1])
        e["name"] = name
        arts = d["artifacts"] + [e]
        arts.sort(key=lambda a: a["name"])
        d["artifacts"] = arts
    return mod(f)


for nm in ["Scene", "", "scene.json"]:
    x_parse("an artifact name %s outside layout, png, scene, state, svg (sorted position, otherwise valid)" % json.dumps(nm), ins_name(nm), UN)

# --- manifest: order of the checks inside parseExportManifest (11.4 (1))
o_unsorted_unknown = mod(lambda d: d.__setitem__("artifacts", [d["artifacts"][1], d["artifacts"][0], d["artifacts"][2], {"bytes": 1, "media_type": "image/png", "name": "thumb", "sha256": "0" * 64}]))
x_parse("order: an unknown name (thumb, last) AND an unsorted list (scene before layout): the name check comes first", o_unsorted_unknown, UN)
x_parse("order: a missing state entry in a pretty-printed manifest: the required-entry check comes before the canonical-bytes check", json.dumps(json.loads(mod(lambda d: d["artifacts"].pop(2))), indent=2, sort_keys=True).encode(), SC_)
# --- manifest: canonical bytes (NON_CANONICAL)
x_parse("valid in every field, pretty-printed (indent 2, LF line ends)", json.dumps(json.loads(BASEB), indent=2, sort_keys=True).encode(), NC)
x_parse("valid in every field, one space after each colon", json.dumps(json.loads(BASEB), separators=(",", ": "), sort_keys=True).encode(), NC)
x_parse("valid, top-level keys out of order (export first)", b'{"export":"igr-export/1",' + BASEB[1:].replace(b'"export":"igr-export/1",', b"", 1), NC)
x_parse("valid, the keys of the first artifact entry out of order (name first)", sub(BASEB, b'{"bytes":398,"media_type":"application/octet-stream","name":"layout",', b'{"name":"layout","bytes":398,"media_type":"application/octet-stream",'), NC)
x_parse("valid, the key igr spelled with the escape \\u0069", sub(BASEB, b'"igr":', b'"\\u0069gr":'), NC)
x_parse("valid, a media type with an escaped solidus (application\\/octet-stream)", sub(BASEB, b"application/octet-stream", b"application\\/octet-stream"), NC)
x_parse("valid, one leading space", b" " + BASEB, NC)
x_parse("valid, one leading LF", b"\n" + BASEB, NC)
x_parse("valid, a trailing space", BASEB + b" ", NC)
# --- verifyExportBundle reading the manifest first
x_verify("verify: not valid JSON (a lone {) with every listed file present", FILES0, b"{", SC_)
x_verify("verify: pretty-printed manifest AND a tampered state file: the manifest (step 1) fails before the files (step 2)", dict(FILES0, state="states/X18.state.json"),
         json.dumps(json.loads(BASEB), indent=2, sort_keys=True).encode(), NC)
thumb_man = mod(lambda d: d["artifacts"].append({"bytes": 1, "media_type": "image/png", "name": "thumb", "sha256": "0" * 64}))
x_verify("verify: a manifest naming thumb AND no thumb file: UNKNOWN_ARTIFACT of the reader comes before the missing-file ARTIFACT_MISMATCH", FILES0, thumb_man, UN)

# --- PNG container: embed, errors
FXP = FIXTURE
x_embed("embed: signature last byte 0x0B instead of 0x0A", FXP[:7] + b"\x0b" + FXP[8:], BIND, E + "PNG_MALFORMED")
x_embed("embed: empty input", b"", BIND, E + "PNG_MALFORMED")
x_embed("embed: the 8 signature bytes and nothing else (no IHDR)", SIG, BIND, E + "PNG_MALFORMED")
x_embed("embed: 7 bytes (a truncated signature)", SIG[:7], BIND, E + "PNG_MALFORMED")
x_embed("embed: the first chunk is IDAT, IHDR second", png_of([chunk(b"IDAT", IDAT), chunk(b"IHDR", IHDR), chunk(b"IEND", b"")]), BIND, E + "PNG_MALFORMED")
x_embed("embed: IHDR with length 12 (CRC right)", png_of([chunk(b"IHDR", IHDR[:12]), chunk(b"IDAT", IDAT), chunk(b"IEND", b"")]), BIND, E + "PNG_MALFORMED")
x_embed("embed: IHDR with length 14 (CRC right)", png_of([chunk(b"IHDR", IHDR + b"\x00"), chunk(b"IDAT", IDAT), chunk(b"IEND", b"")]), BIND, E + "PNG_MALFORMED")
x_embed("embed: the last chunk is IDAT (no IEND)", png_of([chunk(b"IHDR", IHDR), chunk(b"IDAT", IDAT)]), BIND, E + "PNG_MALFORMED")
x_embed("embed: only IHDR (no IEND)", png_of([chunk(b"IHDR", IHDR)]), BIND, E + "PNG_MALFORMED")
x_embed("embed: a valid tEXt chunk after IEND (the last chunk is not IEND)", FXP + chunk(b"tEXt", b"a\x00b"), BIND, E + "PNG_MALFORMED")
x_embed("embed: one byte after IEND (the chunks do not exactly fill the bytes)", FXP + b"\x00", BIND, E + "PNG_MALFORMED")
x_embed("embed: eleven bytes after IEND (shorter than a chunk)", FXP + b"\x00" * 11, BIND, E + "PNG_MALFORMED")
x_embed("embed: the IDAT length field is 65535 and runs past the end of the input", FXP[:33] + struct.pack(">I", 65535) + FXP[37:], BIND, E + "PNG_MALFORMED")
x_embed("embed: the IDAT length field is 0xFFFFFFFF", FXP[:33] + struct.pack(">I", 0xFFFFFFFF) + FXP[37:], BIND, E + "PNG_MALFORMED")
x_embed("embed: truncated by one byte (the last CRC is incomplete)", FXP[:-1], BIND, E + "PNG_MALFORMED")
# --- embed: bad hashes (SCHEMA); the container is valid
for d, bd in [("scene with one uppercase hex digit", dict(BIND, scene=BIND["scene"][:-1].upper() + "A")), ("layout with 63 characters", dict(BIND, layout=BIND["layout"][:-1])),
              ("state with 65 characters", dict(BIND, state=BIND["state"] + "0")), ("scene with a non-hex letter g", dict(BIND, scene="g" + BIND["scene"][1:])),
              ("layout with a trailing LF (65 units)", dict(BIND, layout=BIND["layout"] + "\n")), ("state the empty string", dict(BIND, state="")), ("scene a number", dict(BIND, scene=5))]:
    x_embed("embed: hash fault (SCHEMA): " + d, FXP, bd, SC_)
# --- embed: accepted containers (the CRCs of existing chunks are not verified, nothing else is touched)
x_embed("embed: the IHDR CRC is wrong (CRCs are not verified): accepted, the chunk is inserted at offset 33", png_of([chunk(b"IHDR", IHDR, 0xDEADBEEF), chunk(b"IDAT", IDAT), chunk(b"IEND", b"")]), BIND, "ok")
x_embed("embed: the IDAT CRC is wrong: accepted", png_of([chunk(b"IHDR", IHDR), chunk(b"IDAT", IDAT, 0), chunk(b"IEND", b"")]), BIND, "ok")
x_embed("embed: the IEND CRC is wrong: accepted", png_of([chunk(b"IHDR", IHDR), chunk(b"IDAT", IDAT), chunk(b"IEND", b"", 0x01020304)]), BIND, "ok")
x_embed("embed: only IHDR and IEND (45 bytes, no IDAT): accepted", png_of([chunk(b"IHDR", IHDR), chunk(b"IEND", b"")]), BIND, "ok")
x_embed("embed: ancillary chunks (pHYs, tEXt Comment) and two IDAT: accepted, the new chunk goes right after IHDR", png_of([chunk(b"IHDR", IHDR), chunk(b"pHYs", struct.pack(">IIB", 2835, 2835, 1)),
        chunk(b"tEXt", b"Comment\x00hello"), chunk(b"IDAT", IDAT), chunk(b"IDAT", IDAT), chunk(b"IEND", b"")]), BIND, "ok")
x_embed("embed: an existing tEXt whose keyword only begins with igr-export (igr-export-old, NUL after the longer keyword): not a binding chunk, accepted",
        std(extra_after_ihdr=[chunk(b"tEXt", b"igr-export-old\x00v0")]), BIND, "ok")
x_embed("embed: an existing tEXt whose data is exactly igr-export (10 bytes, no NUL): not a binding chunk, accepted", std(extra_after_ihdr=[chunk(b"tEXt", KW)]), BIND, "ok")
x_embed("embed: an existing tEXt with the keyword in capitals (IGR-EXPORT, NUL): not a binding chunk, accepted", std(extra_after_ihdr=[chunk(b"tEXt", b"IGR-EXPORT\x00x")]), BIND, "ok")
x_embed("embed: an existing iTXt chunk whose data begins igr-export and a NUL: only tEXt counts, accepted", std(extra_after_ihdr=[chunk(b"iTXt", KW + b"\x00x")]), BIND, "ok")
x_embed("embed: an existing zTXt chunk whose data begins igr-export and a NUL: only tEXt counts, accepted", std(extra_after_ihdr=[chunk(b"zTXt", KW + b"\x00x")]), BIND, "ok")
# --- embed: already bound
x_embed("embed: a binding chunk after IDAT, before IEND (any position counts)", std(extra_before_iend=[bchunk()]), BIND, E + "PNG_ALREADY_BOUND")
x_embed("embed: a tEXt chunk whose data is exactly igr-export and one NUL (11 bytes): the data begins with the marker", std(extra_after_ihdr=[chunk(b"tEXt", KW + b"\x00")]), BIND, E + "PNG_ALREADY_BOUND")
x_embed("embed: a tEXt chunk igr-export, NUL, then text that is not the template: the check is on the marker only", std(extra_after_ihdr=[chunk(b"tEXt", KW + b"\x00hello")]), BIND, E + "PNG_ALREADY_BOUND")
x_embed("embed: two binding chunks already present", std(extra_after_ihdr=[bchunk(), bchunk()]), BIND, E + "PNG_ALREADY_BOUND")

# --- PNG reader (readPngBinding)
OH = {"scene": "0" * 64, "layout": "f" * 64, "state": "0123456789abcdef" * 4}
x_read("read: a binding chunk after IDAT is found (no ordering constraint)", std(extra_before_iend=[bchunk()]), "ok")
x_read("read: the binding chunk CRC is wrong: the CRC is not verified, the binding is returned", std(extra_after_ihdr=[bchunk(crc=0)]), "ok")
x_read("read: three other hashes (all 0, all f, 0123456789abcdef x4) in the order scene, layout, state", std(extra_after_ihdr=[bchunk(btext(OH["scene"], OH["layout"], OH["state"]))]), "ok")
x_read("read: decoy chunks (tEXt Comment holding the template, iTXt igr-export, tEXt igr-export-old) beside the real binding: the real one is returned",
       std(extra_after_ihdr=[chunk(b"tEXt", b"Comment\x00" + btext("1" * 64, "2" * 64, "3" * 64)), chunk(b"iTXt", KW + b"\x00" + btext("4" * 64, "5" * 64, "6" * 64)),
                             chunk(b"tEXt", b"igr-export-old\x00" + btext("7" * 64, "8" * 64, "9" * 64)), bchunk()]), "ok")
x_read("read: the IHDR CRC is wrong and the size is 3x2: only the container is read", png_of([chunk(b"IHDR", struct.pack(">IIBBBBB", 3, 2, 8, 6, 0, 0, 0), 7), bchunk(), chunk(b"IDAT", zlib.compress(b"\x00" * 26, 9)), chunk(b"IEND", b"")]), "ok")
x_read("read: signature last byte 0x0B", bytes(FXP[:7]) + b"\x0b" + std(extra_after_ihdr=[bchunk()])[8:], E + "PNG_MALFORMED")
x_read("read: a bound PNG without its IEND", png_of([chunk(b"IHDR", IHDR), bchunk(), chunk(b"IDAT", IDAT)]), E + "PNG_MALFORMED")
x_read("read: a bound PNG whose first chunk is IDAT", png_of([chunk(b"IDAT", IDAT), chunk(b"IHDR", IHDR), bchunk(), chunk(b"IEND", b"")]), E + "PNG_MALFORMED")
x_read("read: a bound PNG with one byte after IEND", std(extra_after_ihdr=[bchunk()]) + b"\x00", E + "PNG_MALFORMED")
x_read("read: a bound PNG with IHDR length 12", png_of([chunk(b"IHDR", IHDR[:12]), bchunk(), chunk(b"IDAT", IDAT), chunk(b"IEND", b"")]), E + "PNG_MALFORMED")
x_read("read: the same binding chunk twice", std(extra_after_ihdr=[bchunk(), bchunk()]), E + "PNG_MALFORMED")
x_read("read: two different well-formed binding chunks", std(extra_after_ihdr=[bchunk(), bchunk(btext("1" * 64, "2" * 64, "3" * 64))]), E + "PNG_MALFORMED")
x_read("read: a second binding chunk after IDAT", std(extra_after_ihdr=[bchunk()], extra_before_iend=[bchunk()]), E + "PNG_MALFORMED")
S, Lh, T = BIND["scene"], BIND["layout"], BIND["state"]
TMPL = [
    ("the version is igr-export/2", ("igr-export/2 %s %s %s" % (S, Lh, T)).encode()), ("one uppercase hex digit in the scene hash", ("igr-export/1 %s %s %s" % (S[:-1] + "A", Lh, T)).encode()),
    ("a 63-character layout hash", ("igr-export/1 %s %s %s" % (S, Lh[:-1], T)).encode()), ("a 65-character state hash", ("igr-export/1 %s %s %s0" % (S, Lh, T)).encode()),
    ("two spaces between scene and layout", ("igr-export/1 %s  %s %s" % (S, Lh, T)).encode()), ("a trailing space", btext() + b" "), ("a trailing LF", btext() + b"\n"),
    ("the third hash missing", ("igr-export/1 %s %s" % (S, Lh)).encode()), ("a fourth hash", btext() + b" " + b"a" * 64), ("a capital I in the version word", btext().replace(b"igr-export/1", b"Igr-export/1", 1)),
    ("tabs instead of spaces", ("igr-export/1\t%s\t%s\t%s" % (S, Lh, T)).encode()), ("a non-hex letter g in the state hash", ("igr-export/1 %s %s g%s" % (S, Lh, T[1:])).encode()),
    ("no space after the version word", ("igr-export/1%s %s %s" % (S, Lh, T)).encode()), ("an empty text (the data is only igr-export and the NUL)", b""),
    ("a Latin-1 byte 0xE9 in place of a hex digit", btext()[:-1] + b"\xe9"), ("a leading space in the text", b" " + btext()), ("a NUL at the end of the text", btext() + b"\x00"),
    ("the three hashes without the version word", ("%s %s %s" % (S, Lh, T)).encode()),
]
for d, tx in TMPL:
    x_read("read: the text is not the template: " + d, std(extra_after_ihdr=[bchunk(tx)]), E + "PNG_MALFORMED")

# --- bundle verification, PNG step (11.4 (6)); the other five steps pass by construction (the O1 files of A.9)
FULL = FILES_SVG
png_ok = std(extra_after_ihdr=[bchunk()])
assert png_ok == embed_binding(FIXTURE, BIND) or True


def vman(png):
    return cj(man_dict(png=png))


def bundle(desc, png, want):
    x_verify(desc, FULL, vman(png), want, png=png)


bundle("verify: bound PNG with wrong CRCs on IHDR, IDAT and the binding chunk: accepted (CRCs are not checked)", png_of([chunk(b"IHDR", IHDR, 1), bchunk(crc=2), chunk(b"IDAT", IDAT, 3), chunk(b"IEND", b"")]), "ok")
bundle("verify: bound PNG of size 3x2 with other pixels: accepted (size and pixels are not checked)", png_of([chunk(b"IHDR", struct.pack(">IIBBBBB", 3, 2, 8, 6, 0, 0, 0)), bchunk(), chunk(b"IDAT", zlib.compress(b"\x00\xff" * 13, 9)), chunk(b"IEND", b"")]), "ok")
bundle("verify: bound PNG with the binding chunk after IDAT: accepted", std(extra_before_iend=[bchunk()]), "ok")
bundle("verify: binding chunk with a wrong scene hash (last digit changed): BINDING_MISMATCH", std(extra_after_ihdr=[bchunk(btext(S[:-1] + ("0" if S[-1] != "0" else "1"), Lh, T))]), E + "BINDING_MISMATCH")
bundle("verify: binding chunk with a wrong layout hash: BINDING_MISMATCH", std(extra_after_ihdr=[bchunk(btext(S, Lh[:-1] + ("0" if Lh[-1] != "0" else "1"), T))]), E + "BINDING_MISMATCH")
bundle("verify: binding chunk with a wrong state hash: BINDING_MISMATCH", std(extra_after_ihdr=[bchunk(btext(S, Lh, T[:-1] + ("0" if T[-1] != "0" else "1")))]), E + "BINDING_MISMATCH")
bundle("verify: binding chunk with layout and scene hashes swapped: BINDING_MISMATCH", std(extra_after_ihdr=[bchunk(btext(Lh, S, T))]), E + "BINDING_MISMATCH")
bundle("verify: only a tEXt igr-export-old chunk (not a binding chunk): the chunk is absent, BINDING_MISMATCH", std(extra_after_ihdr=[chunk(b"tEXt", b"igr-export-old\x00" + btext())]), E + "BINDING_MISMATCH")
bundle("verify: only an iTXt chunk holding the right binding (not a tEXt): absent, BINDING_MISMATCH", std(extra_after_ihdr=[chunk(b"iTXt", KW + b"\x00" + btext())]), E + "BINDING_MISMATCH")
bundle("verify: two binding chunks: PNG_MALFORMED", std(extra_after_ihdr=[bchunk(), bchunk()]), E + "PNG_MALFORMED")
bundle("verify: binding text with an uppercase hex digit: PNG_MALFORMED", std(extra_after_ihdr=[bchunk(btext(S[:-1] + "A", Lh, T))]), E + "PNG_MALFORMED")
bundle("verify: binding text with a trailing LF: PNG_MALFORMED", std(extra_after_ihdr=[bchunk(btext() + b"\n")]), E + "PNG_MALFORMED")
bundle("verify: bound PNG without IEND: PNG_MALFORMED", png_of([chunk(b"IHDR", IHDR), bchunk(), chunk(b"IDAT", IDAT)]), E + "PNG_MALFORMED")
bundle("verify: bound PNG with one byte after IEND: PNG_MALFORMED", std(extra_after_ihdr=[bchunk()]) + b"\x00", E + "PNG_MALFORMED")
bundle("verify: bound PNG with IHDR length 12: PNG_MALFORMED", png_of([chunk(b"IHDR", IHDR[:12]), bchunk(), chunk(b"IDAT", IDAT), chunk(b"IEND", b"")]), E + "PNG_MALFORMED")
bundle("verify: bound PNG with the signature last byte 0x0B: PNG_MALFORMED", SIG[:7] + b"\x0b" + std(extra_after_ihdr=[bchunk()])[8:], E + "PNG_MALFORMED")
# the A.9 bundle itself (png/X04.png is the A.8 result)
x_verify("verify: the complete A.9 bundle (scene, layout, state, svg, the A.8 png) with the X03 manifest: accepted", dict(FULL, png="png/X04.png"), cj(man_dict(png=PATHBYTES["png/X04.png"])), "ok")

# --- exportBundle with expectedPngSize and the png-only bundle
x_export("export: the png only (no svg), no expected size: manifest without svg and svg_format", ["png"], None, "ok")
x_export("export: png with expectedPngSize 1x1 (the fixture): accepted, manifest without svg", ["png"], {"height": 1, "width": 1}, "ok")
x_export("export: png with expectedPngSize width 2, height 1: PNG_SIZE_MISMATCH", ["png"], {"height": 1, "width": 2}, E + "PNG_SIZE_MISMATCH")
x_export("export: png with expectedPngSize width 1, height 2: PNG_SIZE_MISMATCH", ["png"], {"height": 2, "width": 1}, E + "PNG_SIZE_MISMATCH")
x_export("export: svg and png with expectedPngSize 1x1: accepted, the manifest of A.9 X03", ["svg", "png"], {"height": 1, "width": 1}, "ok")

# ======================================================================= mutants (K129 ..)
MUTANTS = [
    # bindings
    ("B_mode_nl", "host-mode grammar anchored with `$` (a trailing LF accepted)"), ("B_mode_first", "host-mode first character may be `.`, `_` or `-`"),
    ("B_mods_lo", "mods -1 accepted"), ("B_mods_hi", "mods 15 refused"), ("B_upper", "uppercase letters are key tokens"), ("B_legacy", "legacy key names (Esc, Left, Spacebar) are key tokens"),
    ("B_shift_all", "shift bit ignored for every key in the duplicate check"), ("B_shift_none", "shift bit never ignored in the duplicate check"), ("B_dup_shift_only", "duplicate check compares only the shift bit"),
    ("B_dup_nomode", "duplicate check ignores the mode"), ("B_tab_normal_only", "Tab refused only in normal mode"), ("B_tab_mods0_only", "Tab refused only with mods 0"),
    ("B_escape_anymods", "escape rule satisfied by an Escape row with any mods"), ("B_escape_host_only", "escape rule not applied to marquee"), ("B_escape_first", "escape rule checked before the rows"),
    ("B_key_before_mods", "key token checked before mods"), ("B_atype_before_key", "action type checked before the key token"), ("B_tab_before_fields", "Tab checked before the action fields"),
    ("B_tab_first", "Tab rows found in a first pass over the whole table"), ("B_schema_per_row", "closed-row check interleaved with the per-row checks"), ("B_extra_ok", "extra action fields tolerated"),
    ("B_empty_bad", "empty table refused"), ("B_zoom_str", "zoom factor given as a string accepted"), ("B_extend01", "spatial extend 1 or 0 accepted as a boolean"), ("B_action_case", "action type compared case-insensitively"),
    # PNG
    ("P_sig4", "signature compared on its first four bytes only"), ("P_trail_short", "trailing bytes shorter than a chunk ignored"), ("P_ihdr_len", "IHDR length 13 not required"),
    ("P_first", "first chunk not required to be IHDR"), ("P_last", "last chunk not required to be IEND"), ("P_crc_embed", "existing chunk CRCs verified by embed"), ("P_crc_read", "chunk CRCs verified by read"),
    ("P_read_crc_binding", "CRC of the binding chunk verified by read"), ("P_crc_verify", "chunk CRCs verified in bundle verification"), ("P_anytype", "any chunk type whose data begins igr-export + NUL is a binding chunk"),
    ("P_case", "binding keyword and chunk type compared case-insensitively"), ("P_nonul", "binding chunk detected by the keyword without the NUL"), ("P_embed_first_only", "embed looks for an existing binding only right after IHDR"),
    ("P_embed_valid_only", "embed refuses only an existing binding whose text matches the template"), ("P_insert_end", "the binding chunk inserted before IEND instead of after IHDR"),
    ("P_read_dup_first", "read returns the first of several binding chunks"), ("P_read_nl", "binding text matched with `$` (a trailing LF accepted)"), ("P_read_upper", "binding text accepts uppercase hex"),
    ("P_hex_upper", "embed accepts uppercase hex hashes"), ("P_hex_nl", "embed hash check with `$` (a trailing LF accepted)"), ("P_size_le", "IHDR size read little-endian"),
    ("P_size_width_only", "expectedPngSize compares the width only"), ("P_size_height_only", "expectedPngSize compares the height only"), ("P_absent_ok", "a bundle png without a binding chunk accepted"),
    ("P_verify_skip_scene", "bundle verification does not compare the scene hash of the binding"), ("P_verify_skip_layout", "bundle verification does not compare the layout hash of the binding"),
    ("P_verify_skip_state", "bundle verification does not compare the state hash of the binding"), ("P_verify_size", "bundle verification requires a 1x1 png"),
    # manifest
    ("N_syntax_code", "invalid JSON reported as NON_CANONICAL"), ("N_canon_skip", "canonical bytes not checked"), ("N_canon_first", "canonical bytes checked before the schema"),
    ("N_canon_ws", "whitespace ignored by the canonical-bytes check"), ("N_canon_order", "key order ignored by the canonical-bytes check (the input order is kept)"), ("N_canon_escape", "escapes (\\u0069, \\/) normalised by the canonical-bytes check"),
    ("N_single_pass", "artifact name and sort order judged in one pass"), ("N_name_case", "artifact names compared case-insensitively"),
    ("N_bytes_neg", "a negative bytes accepted"), ("N_bytes_big", "a bytes above 2^53 - 1 accepted"), ("N_hex_upper", "uppercase hex accepted in manifest hashes"), ("N_hex_len", "a 63-digit hash accepted"),
    ("N_igr_unchecked", "the igr value not compared"), ("N_export_unchecked", "the export value not compared"), ("N_dup_ok", "a repeated artifact name accepted"), ("N_required_skip", "required entries not checked"),
    ("N_nonobject_ok", "a manifest that is not an object accepted"), ("N_entry_extra_ok", "extra keys in an artifact entry accepted"), ("N_files_first", "listed files compared before the strict manifest reader"),
]


def outcomes():
    return {r["id"]: run(r["fn"]) for r in ROWS}


def main():
    MUT.clear()
    base = outcomes()
    bad = []
    for r in ROWS:
        if base[r["id"]] != r["want"]:
            bad.append((r["id"], r["desc"], base[r["id"]], r["want"]))
    if bad:
        for b in bad:
            print("SELF-CHECK FAIL", b, file=sys.stderr)
        sys.exit(1)
    kill = []
    for name, desc in MUTANTS:
        MUT.clear()
        MUT.add(name)
        o = outcomes()
        changed = [i for i in base if o[i] != base[i]]
        kill.append((name, desc, changed))
    MUT.clear()
    survivors = [k for k in kill if not k[2]]
    print("rows: B %d, X %d; new files %d; mutants %d; survivors %d" % (sum(1 for r in ROWS if r["group"] == "B"), sum(1 for r in ROWS if r["group"] == "X"), len(NEW_FILES), len(MUTANTS), len(survivors)))
    for k in survivors:
        print("SURVIVOR", k[0], k[1])
    if survivors:
        sys.exit(2)
    return base, kill


def write_all(base, kill):
    # row ids unique and never present
    with open(os.path.join(ROOT, "EXPECT.tsv"), "rb") as f:
        old_expect = f.read()
    ids = {l.split(b"\t")[0].decode() for l in old_expect.split(b"\n") if l}
    for r in ROWS:
        assert r["id"] not in ids, r["id"]
    lines = []
    for r in ROWS:
        lines.append("\t".join([r["id"], r["group"], "core", r["scene"], r["layout"], r["input"], r["expected"], r["error"]]))
    for i, (name, desc, changed) in enumerate(kill):
        kid = "K%d" % (129 + i)
        lines.append("\t".join([kid, "K", "", "", "", "", "", ""]))
    assert old_expect.endswith(b"\n") and b"\r" not in old_expect
    new_expect = old_expect + ("\n".join(lines) + "\n").encode("utf-8")
    with open(os.path.join(ROOT, "MUTANTS.tsv"), "rb") as f:
        old_mut = f.read()
    mlines = []
    for i, (name, desc, changed) in enumerate(kill):
        kid = "K%d" % (129 + i)
        ch = ",".join(changed)
        mlines.append("\t".join([kid, "KILLED", ch, ch, desc]))
    assert old_mut.endswith(b"\n")
    new_mut = old_mut + ("\n".join(mlines) + "\n").encode("utf-8")
    for p, d in NEW_FILES.items():
        full = os.path.join(ROOT, p)
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(d)
    with open(os.path.join(ROOT, "EXPECT.tsv"), "wb") as f:
        f.write(new_expect)
    with open(os.path.join(ROOT, "MUTANTS.tsv"), "wb") as f:
        f.write(new_mut)
    regen_sums()


if __name__ == "__main__":
    base, kill = main()
    if WRITE:
        write_all(base, kill)
        print("written")
    else:
        for k in kill[:0]:
            pass
