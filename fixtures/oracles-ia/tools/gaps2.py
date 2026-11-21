#!/usr/bin/env python3
"""Rev 4 rows of the oracles-ia corpus (R-H oracle author, 2026-11-20): rows B111.., X178.., E74.. and mutants K201.. against design 32 rev 4.

Additive generator, like gaps.py: it ADDS rows and mutants to a corpus whose earlier files stay byte-identical, and rewrites no earlier line of EXPECT.tsv,
MUTANTS.tsv or AMBIGUITIES.md. Standard library only (Python 3.12). Every expected byte below comes from the reference logic in THIS file, written from design 32
rev 4 (sections 5.1, 6.4, 7.1, 11.2 to 11.5), 27, 30 and 31 and the corpus's own earlier files (O1 scene, layout, state, svg, png fixture) alone. It does not read, import
or run any TypeScript or anything under packages/, and it imports no other tool of this directory (the reference below is self-contained).

    python tools/gaps2.py              dry run: builds every row, self-checks, regression over the earlier rows, mutant matrix; writes nothing
    python tools/gaps2.py --write      writes the new files, appends EXPECT.tsv, MUTANTS.tsv, AMBIGUITIES.md, updates README.md, regenerates SHA256SUMS
    python tools/gaps2.py --root DIR   use another corpus directory (the default is the parent of tools/)
    python tools/gaps2.py --sums-only  regenerates SHA256SUMS alone

Run it once, after gen.py and gaps.py, on a corpus that does not hold the new files (every new path is asserted absent at --write). The dry run may be repeated on a
written corpus: it then checks that every new file already there equals the one it would write. Not part of the regenerating gen.py (gen.py wipes the generated directories).
"""
import decimal
import hashlib
import json
import os
import re
import string
import struct
import sys
import zlib

sys.dont_write_bytecode = True
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


class Unspecified(Exception):
    """a case the design text does not decide: no row may reach it"""


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


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def cj(v):
    """IGR-CJ/1 for the plain values used here: ASCII strings, integers, booleans, arrays, objects with keys in code point order."""
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
    """Ordinary JSON, compact, sorted keys (input files of rows)."""
    return json.dumps(v, separators=(",", ":"), sort_keys=True, ensure_ascii=False).encode("utf-8")


# ----------------------------------------------------------------------- JavaScript coercions (used only by mutants)
def js_string(v):
    if isinstance(v, str):
        return v
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, list):
        return ",".join("" if x is None else js_string(x) for x in v)
    return "[object Object]"


def js_number(v):
    if v is None or v is False:
        return 0
    if v is True:
        return 1
    if isinstance(v, int):
        return v
    if isinstance(v, str):
        try:
            return int(v)
        except ValueError:
            return float("nan")
    if isinstance(v, list):
        return js_number(js_string(v)) if v else 0
    return float("nan")


# ======================================================================= bindings (design 6.1 - 6.4, rev 4)
NAMES = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown", "Enter", "Escape", "Tab", "ContextMenu", "F10", "Backspace", "Delete"]
assert len(NAMES) == 15
PUNCT = set("+-=[],./;")
DIGITS = set("0123456789")
LETTERS = set(string.ascii_lowercase)
TOKENS = set(NAMES) | {"Space"} | LETTERS | DIGITS | PUNCT
SPEC = {
    "spatial": {"dir": "dir", "extend": "bool"}, "step": {"delta": "delta"}, "first": {}, "last": {}, "incident": {"delta": "delta"},
    "endpoint": {"end": "end"}, "toggle-focus": {}, "activate": {}, "clear-selection": {}, "context": {}, "pan": {"dx": "pan", "dy": "pan"},
    "zoom": {"factor": "zoom"}, "fit": {}, "select-all": {}, "marquee-start": {}, "marquee-commit": {}, "marquee-cancel": {},
}
assert len(SPEC) == 17
MODE_RE = re.compile(r"x-[a-z0-9][a-z0-9._-]*")
PAN_LIM = 2 ** 31
ZOOM_LO, ZOOM_HI = 1, 1000000
DIRS = ("left", "right", "up", "down")
ENDS = ("src", "tgt")


def b_field_ok(ty, f, kind, v):
    if kind == "bool":
        return isinstance(v, bool)
    if kind == "pan":
        if not is_int(v):
            return False
        if M("R_pan_nodomain") or (M("R_pan_dx_nodomain") and f == "dx") or (M("R_pan_dy_nodomain") and f == "dy"):
            return True
        lo, hi = -PAN_LIM, PAN_LIM
        if M("R_pan_neg_nodomain"):
            lo = -2 ** 62
        if M("R_pan_hi_open"):
            hi = PAN_LIM - 1
        if M("R_pan_lo_open"):
            lo = -PAN_LIM + 1
        return lo <= v <= hi
    if kind == "zoom":
        if not is_int(v):
            return False
        if M("R_zoom_nodomain"):
            return True
        lo, hi = ZOOM_LO, ZOOM_HI
        if M("R_zoom_zero_ok"):
            lo = 0
        if M("R_zoom_neg_ok"):
            lo = -2 ** 62
        if M("R_zoom_hi_open"):
            hi = ZOOM_HI - 1
        if M("R_zoom_hi_nocheck"):
            hi = 2 ** 62
        return lo <= v <= hi
    if kind == "dir":
        if not isinstance(v, str):
            return False
        if M("R_dir_any"):
            return True
        if M("R_dir_case"):
            return v.lower() in DIRS
        if M("R_dir_trim"):
            return v.strip() in DIRS
        return v in DIRS
    if kind == "end":
        if not isinstance(v, str):
            return False
        if M("R_end_any"):
            return True
        if M("R_end_case"):
            return v.lower() in ENDS
        if M("R_end_trim"):
            return v.strip() in ENDS
        return v in ENDS
    if kind == "delta":
        if not is_int(v):
            return False
        if ty == "step" and M("R_step_delta_any"):
            return True
        if ty == "incident" and M("R_incident_delta_any"):
            return True
        if M("R_delta_zero_ok"):
            return v in (-1, 0, 1)
        if M("R_delta_positive_any"):
            return v == -1 or v >= 1
        return v in (1, -1)
    raise AssertionError(kind)


def verify_bindings(t):
    E = "INVALID_BINDINGS"
    if not isinstance(t, list):
        raise Err(E, "SCHEMA")
    for r in t:
        if not (isinstance(r, dict) and set(r.keys()) == {"action", "key", "mode", "mods"}):
            raise Err(E, "SCHEMA")
    seen = set()
    modes = []
    for r in t:
        def c_mode():
            m = r["mode"]
            if M("R_mode_coerce"):
                m = js_string(m)
            if not isinstance(m, str):
                raise Err(E, "SCHEMA" if M("R_mode_nonstr_schema") else "INVALID_VALUE")
            if not (m in ("normal", "marquee") or MODE_RE.fullmatch(m)):
                raise Err(E, "INVALID_VALUE")

        def c_mods():
            v = r["mods"]
            if M("R_mods_coerce"):
                v = js_number(v)
                ok = isinstance(v, int) and 0 <= v <= 15
            else:
                ok = is_int(v) and 0 <= v <= 15
            if not ok:
                raise Err(E, "INVALID_VALUE")

        def c_key():
            k = r["key"]
            if M("R_key_coerce"):
                k = js_string(k)
            if not isinstance(k, str):
                raise Err(E, "INVALID_VALUE" if M("R_key_nonstr_invalid_value") else ("SCHEMA" if M("R_key_nonstr_schema") else "UNKNOWN_KEY"))
            if k not in TOKENS:
                raise Err(E, "UNKNOWN_KEY")

        def c_atype():
            a = r["action"]
            if M("R_action_str_coerce") and isinstance(a, str):
                a = {"type": a}
            if not isinstance(a, dict):
                raise Err(E, "SCHEMA" if M("R_action_nonobj_schema") else "UNKNOWN_ACTION")
            ty = a.get("type") if "type" in a else None
            if M("R_type_coerce") and isinstance(ty, list):
                ty = js_string(ty)
            if not isinstance(ty, str):
                raise Err(E, "INVALID_VALUE" if M("R_action_notype_invalid_value") else "UNKNOWN_ACTION")
            if ty not in SPEC:
                raise Err(E, "UNKNOWN_ACTION")

        def c_afields():
            a = r["action"]
            if isinstance(a, str):
                a = {"type": a}
            ty = js_string(a["type"]) if isinstance(a["type"], list) else a["type"]
            spec = SPEC[ty]
            if set(a.keys()) - {"type"} != set(spec):
                raise Err(E, "INVALID_VALUE")
            for f, kind in spec.items():
                if not b_field_ok(ty, f, kind, a[f]):
                    raise Err(E, "INVALID_VALUE")

        def c_tab():
            if (js_string(r["key"]) if M("R_key_coerce") else r["key"]) == "Tab":
                raise Err(E, "TAB_BOUND")

        order = [c_mode, c_mods, c_key, c_atype, c_afields, c_tab]
        if M("R_tab_before_fields"):
            order = [c_mode, c_mods, c_key, c_atype, c_tab, c_afields]
        if M("R_fields_before_atype_notype"):
            pass
        for f in order:
            f()
        mode_v, key_v, mods_v = r["mode"], r["key"], r["mods"]
        if M("R_mode_coerce"):
            mode_v = js_string(mode_v)
        if M("R_key_coerce"):
            key_v = js_string(key_v)
        if M("R_mods_coerce"):
            mods_v = js_number(mods_v)
        km = mods_v & ~1 if (key_v in DIGITS or key_v in PUNCT) else mods_v
        ident = (mode_v, key_v, km)
        if ident in seen:
            raise Err(E, "DUPLICATE_BINDING")
        seen.add(ident)
        if mode_v not in modes:
            modes.append(mode_v)
    for m in modes:
        if m == "normal":
            continue
        if not any(q["mode"] == m and q["key"] == "Escape" and q["mods"] == 0 for q in t):
            raise Err(E, "NO_ESCAPE_EXIT")
    return None


# ======================================================================= PNG container (design 11.5, rev 4)
SIG = bytes.fromhex("89504e470d0a1a0a")
KW = b"igr-export"
HEX64 = re.compile(r"[0-9a-f]{64}")


def crc32(b):
    return zlib.crc32(b) & 0xFFFFFFFF


def chunk(typ, data, crc=None):
    return struct.pack(">I", len(data)) + typ + data + struct.pack(">I", crc32(typ + data) if crc is None else crc)


def png_of(chunks, sig=SIG):
    return sig + b"".join(chunks)


def type_ok(t):
    """one chunk type: four ASCII letters (design 11.5 rev 4)"""
    if M("Q_type_any"):
        return True
    if M("Q_type_first_only"):
        t = t[:1]
    if M("Q_type_skip_last"):
        t = t[:3]
    for c in t:
        if 0x41 <= c <= 0x5A or 0x61 <= c <= 0x7A:
            continue
        if M("Q_type_hi_Z") and c == 0x5B:
            continue
        if M("Q_type_lo_A") and c == 0x40:
            continue
        if M("Q_type_hi_z") and c == 0x7B:
            continue
        if M("Q_type_lo_a") and c == 0x60:
            continue
        if M("Q_type_latin1") and bytes([c]).decode("latin-1").isalpha():
            continue
        if M("Q_type_alnum") and 0x30 <= c <= 0x39:
            continue
        return False
    return True


def parse_png(b):
    E = "INVALID_EXPORT"
    if len(b) < 45 and not M("Q_min45_off"):
        raise Err(E, "PNG_MALFORMED")
    if b[:8] != SIG:
        raise Err(E, "PNG_MALFORMED")
    pos = 8
    out = []
    while pos < len(b):
        if pos + 12 > len(b):
            raise Err(E, "PNG_MALFORMED")
        n = struct.unpack(">I", b[pos:pos + 4])[0]
        if n >= 2 ** 31 and not M("Q_len31_off"):
            raise Err(E, "PNG_MALFORMED")
        if pos + 12 + n > len(b):
            raise Err(E, "PNG_MALFORMED")
        typ = b[pos + 4:pos + 8]
        if not type_ok(typ):
            raise Err(E, "PNG_MALFORMED")
        out.append((pos, typ, b[pos + 8:pos + 8 + n], n))
        pos += 12 + n
    if not out:
        raise Err(E, "PNG_MALFORMED")
    first_ok = out[0][1] == b"IHDR" or (M("Q_ihdr_case") and out[0][1].lower() == b"ihdr")
    if not first_ok or out[0][3] != 13:
        raise Err(E, "PNG_MALFORMED")
    last_ok = out[-1][1] == b"IEND" or (M("Q_iend_case") and out[-1][1].lower() == b"iend")
    if M("Q_last"):
        last_ok = True
    if not last_ok:
        raise Err(E, "PNG_MALFORMED")
    if (out[-1][1] == b"IEND" or (M("Q_iend_case") and out[-1][1].lower() == b"iend")) and out[-1][3] != 0 and not M("Q_iend_len_any"):
        raise Err(E, "PNG_MALFORMED")
    return out


def is_binding(c):
    return c[1] == b"tEXt" and c[2].startswith(KW + b"\x00")


def hash_ok(h):
    return isinstance(h, str) and HEX64.fullmatch(h) is not None


def embed_binding(png, binding):
    E = "INVALID_EXPORT"
    if not (isinstance(binding, dict) and (set(binding.keys()) == {"scene", "layout", "state"} or (M("E_binding_open") and {"scene", "layout", "state"} <= set(binding.keys())))):
        raise Err(E, "SCHEMA")
    state = {}

    def c_hash():
        for k in ("scene", "layout", "state"):
            if not hash_ok(binding[k]):
                raise Err(E, "SCHEMA")

    def c_container():
        state["chunks"] = parse_png(png)

    def lenient():
        out, pos = [], 8
        while pos + 12 <= len(png):
            n = struct.unpack(">I", png[pos:pos + 4])[0]
            if pos + 12 + n > len(png):
                break
            out.append((pos, png[pos + 4:pos + 8], png[pos + 8:pos + 8 + n], n))
            pos += 12 + n
        return out

    def c_bound():
        for c in state["chunks"] if "chunks" in state else lenient():
            if is_binding(c):
                raise Err(E, "PNG_ALREADY_BOUND")

    order = [c_hash, c_container, c_bound]
    if M("E_order_container_first"):
        order = [c_container, c_hash, c_bound]
    if M("E_order_bound_before_container"):
        order = [c_hash, c_bound, c_container]
    if M("E_order_bound_before_hash"):
        order = [c_bound, c_hash, c_container]
    for f in order:
        f()
    text = ("igr-export/1 %s %s %s" % (binding["scene"], binding["layout"], binding["state"])).encode("ascii")
    ch = chunk(b"tEXt", KW + b"\x00" + text)
    return png[:33] + ch + png[33:]


def read_binding(png):
    E = "INVALID_EXPORT"
    chunks = parse_png(png)
    hits = [c for c in chunks if is_binding(c)]
    if not hits:
        return None
    if len(hits) > 1:
        raise Err(E, "PNG_MALFORMED")
    m = re.fullmatch(rb"igr-export/1 ([0-9a-f]{64}) ([0-9a-f]{64}) ([0-9a-f]{64})", hits[0][2][len(KW) + 1:])
    if not m:
        raise Err(E, "PNG_MALFORMED")
    return {"scene": m.group(1).decode(), "layout": m.group(2).decode(), "state": m.group(3).decode()}


# ======================================================================= manifest bytes (design 11.3, 11.4, rev 4)
MEDIA = {"layout": "application/octet-stream", "png": "image/png", "scene": "application/octet-stream", "state": "application/octet-stream", "svg": "image/svg+xml"}
TOP = {"artifacts", "export", "igr", "layout_sha256", "scene_sha256", "source_sha256", "state_sha256"}
WS = " \t\n\r"
NUM_RE = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?")


class JErr(Exception):
    pass


class Num:
    def __init__(self, text):
        self.text = text


class Obj:
    def __init__(self, pairs):
        self.pairs = pairs
        self.map = {}
        self.dups = False
        for k, v in pairs:
            if k in self.map:
                self.dups = True
                if M("N_dup_first_wins"):
                    continue
            self.map[k] = v


def jparse(s):
    """strict RFC 8259 reader over a str; keeps the spelling of numbers and every pair of an object (so duplicates stay visible)"""
    pos = [0]
    n = len(s)

    def ws():
        while pos[0] < n and s[pos[0]] in WS:
            pos[0] += 1

    def string():
        assert s[pos[0]] == '"'
        pos[0] += 1
        units = []
        while True:
            if pos[0] >= n:
                raise JErr
            c = s[pos[0]]
            pos[0] += 1
            if c == '"':
                break
            if ord(c) < 0x20:
                raise JErr
            if c == "\\":
                if pos[0] >= n:
                    raise JErr
                e = s[pos[0]]
                pos[0] += 1
                if e in '"\\/':
                    units.append(ord(e))
                elif e in "bfnrt":
                    units.append({"b": 8, "f": 12, "n": 10, "r": 13, "t": 9}[e])
                elif e == "u":
                    h = s[pos[0]:pos[0] + 4]
                    if len(h) != 4 or not re.fullmatch(r"[0-9a-fA-F]{4}", h):
                        raise JErr
                    pos[0] += 4
                    units.append(int(h, 16))
                else:
                    raise JErr
            else:
                cp = ord(c)
                if cp > 0xFFFF:
                    cp -= 0x10000
                    units += [0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF)]
                else:
                    units.append(cp)
        out = []
        i = 0
        while i < len(units):
            u = units[i]
            if 0xD800 <= u <= 0xDBFF and i + 1 < len(units) and 0xDC00 <= units[i + 1] <= 0xDFFF:
                out.append(chr(0x10000 + ((u - 0xD800) << 10) + (units[i + 1] - 0xDC00)))
                i += 2
                continue
            if 0xD800 <= u <= 0xDFFF and M("N_surr_syntax"):
                raise JErr
            out.append(chr(u))
            i += 1
        return "".join(out)

    def val(depth):
        if depth > 200:
            raise JErr
        ws()
        if pos[0] >= n:
            raise JErr
        c = s[pos[0]]
        if c == "{":
            pos[0] += 1
            pairs = []
            ws()
            if pos[0] < n and s[pos[0]] == "}":
                pos[0] += 1
                return Obj(pairs)
            while True:
                ws()
                if pos[0] >= n or s[pos[0]] != '"':
                    raise JErr
                k = string()
                ws()
                if pos[0] >= n or s[pos[0]] != ":":
                    raise JErr
                pos[0] += 1
                pairs.append((k, val(depth + 1)))
                ws()
                if pos[0] >= n:
                    raise JErr
                if s[pos[0]] == ",":
                    pos[0] += 1
                    continue
                if s[pos[0]] == "}":
                    pos[0] += 1
                    o = Obj(pairs)
                    if o.dups and M("N_dup_syntax"):
                        raise JErr
                    return o
                raise JErr
        if c == "[":
            pos[0] += 1
            items = []
            ws()
            if pos[0] < n and s[pos[0]] == "]":
                pos[0] += 1
                return items
            while True:
                items.append(val(depth + 1))
                ws()
                if pos[0] >= n:
                    raise JErr
                if s[pos[0]] == ",":
                    pos[0] += 1
                    continue
                if s[pos[0]] == "]":
                    pos[0] += 1
                    return items
                raise JErr
        if c == '"':
            return string()
        for lit, v in (("true", True), ("false", False), ("null", None)):
            if s.startswith(lit, pos[0]):
                pos[0] += len(lit)
                return v
        m = NUM_RE.match(s, pos[0])
        if not m:
            raise JErr
        pos[0] = m.end()
        return Num(m.group(0))

    v = val(0)
    ws()
    if pos[0] != n:
        raise JErr
    return v


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


def num_int(n):
    """the integer value of a spelled number, None when it is not an integer; -0 raises Err SCHEMA (the owner's ruling, 11.3)"""
    t = n.text
    if t == "-0" and not M("N_negzero_nc"):
        raise Err("INVALID_EXPORT", "SCHEMA")
    d = decimal.Decimal(t)
    if d.is_zero() and t.startswith("-") and t != "-0":
        raise Unspecified("negative zero spelled " + t)
    if d != d.to_integral_value():
        if float(t).is_integer():
            raise Unspecified("not an integer by value, an integer as a double: " + t)
        return None
    return int(d)


def tree_value(v, spelled):
    if isinstance(v, Obj):
        return {k: tree_value(x, spelled) for k, x in v.map.items()}
    if isinstance(v, list):
        return [tree_value(x, spelled) for x in v]
    if isinstance(v, Num):
        return int(decimal.Decimal(v.text))
    return v


def tree_bytes(v, keep_dups, spelled):
    """serialiser of a mutant: keeps duplicate pairs (stable key sort) and/or the spelling of numbers"""
    if isinstance(v, Obj):
        pairs = v.pairs if keep_dups else list(v.map.items())
        return b"{" + b",".join(cj(k) + b":" + tree_bytes(x, keep_dups, spelled) for k, x in sorted(pairs, key=lambda p: p[0])) + b"}"
    if isinstance(v, list):
        return b"[" + b",".join(tree_bytes(x, keep_dups, spelled) for x in v) + b"]"
    if isinstance(v, Num):
        return v.text.encode() if spelled else str(int(decimal.Decimal(v.text))).encode()
    return cj(v)


def hex_ok(v):
    return isinstance(v, str) and HEX64.fullmatch(v) is not None


def parse_manifest(b):
    E = "INVALID_EXPORT"
    if b[:3] == b"\xef\xbb\xbf" and M("N_bom_ok"):
        b0 = b[3:]
    else:
        b0 = b
    try:
        if M("N_utf8_lenient"):
            text = b0.decode("utf-8", errors="replace")
        elif M("N_utf8_surrogatepass"):
            text = b0.decode("utf-8", errors="surrogatepass")
        else:
            text = b0.decode("utf-8")
        root = jparse(text)
    except (UnicodeDecodeError, JErr):
        raise Err(E, "SCHEMA")

    def p1():
        if not isinstance(root, Obj):
            raise Err(E, "SCHEMA")
        m = root.map
        if not (TOP <= set(m) <= TOP | {"svg_format"}):
            raise Err(E, "SCHEMA")
        if m["export"] != "igr-export/1" or m["igr"] != "IGR/1":
            raise Err(E, "SCHEMA")
        for k in ("layout_sha256", "scene_sha256", "source_sha256", "state_sha256"):
            if not hex_ok(m[k]):
                raise Err(E, "SCHEMA")
        if not isinstance(m["artifacts"], list):
            raise Err(E, "SCHEMA")
        for a in m["artifacts"]:
            if not (isinstance(a, Obj) and set(a.map) == {"bytes", "media_type", "name", "sha256"}):
                raise Err(E, "SCHEMA")
            if not isinstance(a.map["media_type"], str):
                raise Err(E, "SCHEMA")
            bv = a.map["bytes"]
            if not isinstance(bv, Num):
                raise Err(E, "SCHEMA")
            if M("N_num_float_schema") and re.search(r"[.eE]", bv.text):
                raise Err(E, "SCHEMA")
            iv = num_int(bv)
            if iv is None or not (0 <= iv <= 2 ** 53 - 1):
                raise Err(E, "SCHEMA")
            if not hex_ok(a.map["sha256"]):
                raise Err(E, "SCHEMA")
            if not isinstance(a.map["name"], str):
                raise Err(E, "SCHEMA")

    def names():
        if not isinstance(root, Obj) or not isinstance(root.map.get("artifacts"), list):
            return []
        return [a.map["name"] for a in root.map["artifacts"] if isinstance(a, Obj) and isinstance(a.map.get("name"), str)]

    def p2():
        for nm in names():
            if nm not in MEDIA:
                raise Err(E, "UNKNOWN_ARTIFACT")

    def p3():
        ns = names()
        for i in range(1, len(ns)):
            if not ns[i - 1] < ns[i]:
                raise Err(E, "SCHEMA")

    def preq():
        for need in ("scene", "layout", "state"):
            if need not in names():
                raise Err(E, "SCHEMA")

    def p4():
        if M("N_canon_skip"):
            return
        if M("N_dup_undetected") or M("N_num_spell_ok"):
            c = tree_bytes(root, M("N_dup_undetected"), M("N_num_spell_ok"))
        else:
            try:
                c = cj(tree_value(root, False))
            except AssertionError:
                return          # a non-ASCII string cannot reach this pass in the baseline order (the name pass refuses it first)
        if c != b:
            raise Err(E, "NON_CANONICAL")

    passes = [p1, p2, p3, preq, p4]
    if M("N_names_before_types"):
        passes = [p2, p1, p3, preq, p4]
    if M("N_canon_after_types"):
        passes = [p1, p4, p2, p3, preq]
    if M("N_canon_after_names"):
        passes = [p1, p2, p4, p3, preq]
    for p in passes:
        p()
    return tree_value(root, False)


def verify_bundle(files, mb):
    E = "INVALID_EXPORT"
    if len(mb) > 1048576:
        raise Err("RESOURCE_LIMIT", "BYTES_LIMIT")
    if scan_depth(mb) > 6:
        raise Err(E, "SCHEMA")
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
        b = read_binding(png)
        want = {"scene": m["scene_sha256"], "layout": m["layout_sha256"], "state": m["state_sha256"]}
        if b is None or b != want:
            raise Err(E, "BINDING_MISMATCH")
    return None


# ======================================================================= machine bytes (design 5.1, rev 4)
LIMS = {"last_t": (-1, 2 ** 52), "x": (-2 ** 39, 2 ** 39), "x0": (-2 ** 39, 2 ** 39), "y": (-2 ** 39, 2 ** 39), "y0": (-2 ** 39, 2 ** 39), "t0": (0, 2 ** 52),
        "id": (0, 2 ** 31 - 1), "mx": (-2 ** 39, 2 ** 39), "my": (-2 ** 39, 2 ** 39), "d": (0, 2 ** 41)}
PTR_KEYS = {"button", "id", "lasso", "long", "mods0", "moved", "ptype", "t0", "x", "x0", "y", "y0"}


def m_rng(name, v, idx=0):
    if not is_int(v):
        raise Err("INVALID_MACHINE", "SCHEMA")
    if M("M_pointer_unchecked") and name != "last_t":
        return
    if M("M_second_unchecked") and idx == 1:
        return
    lo, hi = LIMS[name]
    if M("M_%s_nohi" % name):
        hi = None
    if M("M_%s_nolo" % name):
        lo = None
    if M("M_%s_hiopen" % name):
        hi = hi - 1
    if M("M_%s_loopen" % name):
        lo = lo + 1
    if (lo is not None and v < lo) or (hi is not None and v > hi):
        raise Err("INVALID_MACHINE", "SCHEMA")


def parse_machine(b):
    S = "INVALID_MACHINE"
    if len(b) > 1048576:
        raise Err("RESOURCE_LIMIT", "BYTES_LIMIT")
    try:
        v = json.loads(b.decode("utf-8"))
    except Exception:
        raise Err(S, "SCHEMA")
    try:
        if cj(v) != b:
            raise Err(S, "SCHEMA")
    except AssertionError:
        raise Err(S, "SCHEMA")
    if not isinstance(v, dict):
        raise Err(S, "SCHEMA")
    need = {"gesture", "last_t", "mode", "pointers", "rem_x", "rem_y", "wheel_acc"}
    ks = set(v.keys())
    if not (need <= ks <= need | {"anchor", "pinch"}):
        raise Err(S, "SCHEMA")
    g = v["gesture"]
    if g not in ("idle", "press", "pan", "lasso", "pinch") or v["mode"] not in ("normal", "marquee"):
        raise Err(S, "SCHEMA")
    m_rng("last_t", v["last_t"])
    ps = v["pointers"]
    if not isinstance(ps, list) or len(ps) > 2:
        raise Err(S, "SCHEMA")
    prev_id = None
    for i, p in enumerate(ps):
        if not isinstance(p, dict) or not (PTR_KEYS <= set(p.keys()) <= PTR_KEYS | {"target"}):
            raise Err(S, "SCHEMA")
        for f in ("id", "t0", "x", "x0", "y", "y0"):
            m_rng(f, p[f], i)
        if prev_id is not None and p["id"] <= prev_id:
            raise Err(S, "SCHEMA")
        prev_id = p["id"]
        for f in ("lasso", "long", "moved"):
            if not isinstance(p[f], bool):
                raise Err(S, "SCHEMA")
        if p["ptype"] not in ("mouse", "touch", "pen"):
            raise Err(S, "SCHEMA")
        if p["long"] and p["ptype"] != "touch":
            raise Err(S, "SCHEMA")
    for f in ("rem_x", "rem_y"):
        if not (is_int(v[f]) and -500 <= v[f] <= 499):
            raise Err(S, "SCHEMA")
    if not (is_int(v["wheel_acc"]) and abs(v["wheel_acc"]) < 100000):
        raise Err(S, "SCHEMA")
    if (len(ps) == 0) != (g == "idle"):
        raise Err(S, "SCHEMA")
    if g == "press" and not (len(ps) == 1 and not ps[0]["moved"] and not ps[0]["lasso"]):
        raise Err(S, "SCHEMA")
    if g == "pan" and not (len(ps) >= 1 and all(p["moved"] and not p["lasso"] for p in ps)):
        raise Err(S, "SCHEMA")
    if g == "lasso" and not (len(ps) == 1 and ps[0]["lasso"] and ps[0]["moved"]):
        raise Err(S, "SCHEMA")
    if g == "pinch" and not (len(ps) == 2 and all(p["moved"] and not p["lasso"] for p in ps)):
        raise Err(S, "SCHEMA")
    if ("pinch" in v) != (g == "pinch"):
        raise Err(S, "SCHEMA")
    if "pinch" in v:
        pv = v["pinch"]
        if not (isinstance(pv, dict) and set(pv) == {"d", "mx", "my"}):
            raise Err(S, "SCHEMA")
        for f in ("d", "mx", "my"):
            m_rng(f, pv[f])
    if g not in ("pan", "pinch") and (v["rem_x"] != 0 or v["rem_y"] != 0):
        raise Err(S, "SCHEMA")
    if ("anchor" in v) != (v["mode"] == "marquee"):
        raise Err(S, "SCHEMA")
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
    out, pos = [], 8
    while pos < len(png):
        n = struct.unpack(">I", png[pos:pos + 4])[0]
        out.append((png[pos + 4:pos + 8], png[pos + 8:pos + 8 + n]))
        pos += 12 + n
    return out


FX = chunks_of(FIXTURE)
assert [t for t, _ in FX] == [b"IHDR", b"IDAT", b"IEND"] and FIXTURE[:8] == SIG and len(FIXTURE) == 68
IHDR, IDAT = FX[0][1], FX[1][1]
assert struct.unpack(">II", IHDR[:8]) == (1, 1)
assert png_of([chunk(t, d) for t, d in FX]) == FIXTURE  # the fixture is its own recomputation (design A.8)


def btext(s=BIND["scene"], l=BIND["layout"], t=BIND["state"]):
    return ("igr-export/1 %s %s %s" % (s, l, t)).encode("ascii")


def bchunk(text=None, crc=None):
    return chunk(b"tEXt", KW + b"\x00" + (btext() if text is None else text), crc)


def std(extra_after_ihdr=(), extra_before_iend=(), idat=IDAT, ihdr=IHDR):
    return png_of([chunk(b"IHDR", ihdr)] + list(extra_after_ihdr) + [chunk(b"IDAT", idat)] + list(extra_before_iend) + [chunk(b"IEND", b"")])


def man_dict(png=None, svg=True):
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
assert embed_binding(FIXTURE, BIND) == rd("png/X04.png")  # design A.8 reproduced
assert cj(man_dict(png=embed_binding(FIXTURE, BIND))) == rd("json/X03.manifest.json")  # design A.9 reproduced
BASEB = cj(BASE)
FILES0 = {"layout": "layouts/O1.layout.json", "scene": "scenes/O1.scene.json", "state": "states/O1.initial.state.json"}
FILES_SVG = dict(FILES0, svg="data/O1.decl.svg")
PATHBYTES = {v: rd(v) for v in list(FILES_SVG.values())}

# ======================================================================= row collection
NEW_FILES = {}
ROWS = []
PRE = []          # earlier rows evaluated by this reference for the mutant matrix only: (id, fn, want)
COUNTERS = {"B": 110, "X": 177, "E": 73}
SC, LY = "scenes/O1.scene.json", "layouts/O1.layout.json"


def nid(g):
    COUNTERS[g] += 1
    return "%s%d" % (g, COUNTERS[g]) if COUNTERS[g] >= 100 else "%s%02d" % (g, COUNTERS[g])


def put(path, data):
    assert path not in NEW_FILES, path
    NEW_FILES[path] = data


def run(fn):
    try:
        return ("ok", fn())
    except Err as e:
        return ("err", e.key)


RULE = [""]


def add_row(rid, group, scene, layout, inp, expected, error, fn, want, desc):
    ROWS.append(dict(id=rid, group=group, scene=scene, layout=layout, input=inp, expected=expected, error=error, fn=fn, want=want, desc=desc, rule=RULE[0]))


# ---------------------------------------------------------------------- B rows
DEFAULT = json.loads(rd("json/B12.bindings.json"))
assert len(DEFAULT) == 33
FIT = {"type": "fit"}


def R(mode, key, mods, action=FIT):
    return {"action": action, "key": key, "mode": mode, "mods": mods}


def B(desc, table, want):
    rid = nid("B")
    path = "inputs/%s.bindings.json" % rid
    put(path, jraw(table))
    t = json.loads(jraw(table))
    add_row(rid, "B", "", "", path, "", "" if want == "ok" else want, lambda t=t: verify_bindings(t), ("ok", None) if want == "ok" else ("err", want), desc)
    return rid


V, SCH, UK, UA, TB = ("INVALID_BINDINGS/INVALID_VALUE", "INVALID_BINDINGS/SCHEMA", "INVALID_BINDINGS/UNKNOWN_KEY", "INVALID_BINDINGS/UNKNOWN_ACTION", "INVALID_BINDINGS/TAB_BOUND")
plus = lambda *rows: DEFAULT + list(rows)
pan = lambda dx, dy: {"type": "pan", "dx": dx, "dy": dy}
zoom = lambda f: {"type": "zoom", "factor": f}

# accepted: the limits and every value of the value sets (rows claim only that the function returns)
RULE[0] = "R32-02"
B("pan with dx 2^31 and dy -2^31, and with dx -2^31 and dy 2^31: the limits of the pan domain (6.4, +-2^31) are inside", plus(R("normal", "g", 0, pan(2 ** 31, -2 ** 31)), R("normal", "b", 0, pan(-2 ** 31, 2 ** 31))), "ok")
B("zoom with factor 1 and factor 1000000: the limits of the zoom domain (1 to 1,000,000) are inside", plus(R("normal", "g", 0, zoom(1)), R("normal", "b", 0, zoom(1000000))), "ok")
RULE[0] = "R32-03"
B("every value of the value sets: dir left right up down, end src tgt, delta 1 and -1 for step and for incident, on 11 unused keys",
  plus(*[R("normal", k, 0, a) for k, a in zip("bcdfghijklo", [{"type": "spatial", "dir": d, "extend": e} for d, e in (("left", False), ("right", True), ("up", False), ("down", True))] +
                                                            [{"type": "endpoint", "end": "src"}, {"type": "endpoint", "end": "tgt"}, {"type": "step", "delta": 1}, {"type": "step", "delta": -1},
                                                             {"type": "incident", "delta": 1}, {"type": "incident", "delta": -1}])]), "ok")
# pan and zoom domains (R32-02)
RULE[0] = "R32-02"
B("pan dx 2^31 + 1 (one above the domain)", plus(R("normal", "g", 0, pan(2 ** 31 + 1, 0))), V)
B("pan dx -2^31 - 1 (one below the domain)", plus(R("normal", "g", 0, pan(-2 ** 31 - 1, 0))), V)
B("pan dy 2^31 + 1", plus(R("normal", "g", 0, pan(0, 2 ** 31 + 1))), V)
B("pan dy -2^31 - 1", plus(R("normal", "g", 0, pan(0, -2 ** 31 - 1))), V)
B("pan dx 2^32 (an integer that does not fit 32 bits)", plus(R("normal", "g", 0, pan(2 ** 32, 0))), V)
B("pan dy -2^53 (an integer at the edge of the safe integers)", plus(R("normal", "g", 0, pan(0, -2 ** 53))), V)
B("zoom factor 0 (one below the domain)", plus(R("normal", "g", 0, zoom(0))), V)
B("zoom factor -1", plus(R("normal", "g", 0, zoom(-1))), V)
B("zoom factor 1000001 (one above the domain)", plus(R("normal", "g", 0, zoom(1000001))), V)
B("zoom factor 2^31", plus(R("normal", "g", 0, zoom(2 ** 31))), V)
B("zoom factor 2^53", plus(R("normal", "g", 0, zoom(2 ** 53))), V)
# value sets (R32-03)
RULE[0] = "R32-03"
for v in ["north", "Left", "", "left ", "up\n"]:
    B("spatial dir %s is a string outside left, right, up, down" % json.dumps(v), plus(R("normal", "g", 0, {"type": "spatial", "dir": v, "extend": False})), V)
for v in ["source", "SRC", "", "src ", "target"]:
    B("endpoint end %s is a string outside src, tgt" % json.dumps(v), plus(R("normal", "g", 0, {"type": "endpoint", "end": v})), V)
for ty in ("step", "incident"):
    for v in (2, 0, -2):
        B("%s delta %d is an integer outside 1 and -1" % (ty, v), plus(R("normal", "g", 0, {"type": ty, "delta": v})), V)
# wrong JSON type of the row members (R32-04)
RULE[0] = "R32-04"
for d, v in [("the number 5", 5), ("null", None), ("true", True), ("an array holding normal", ["normal"]), ("an empty object", {})]:
    B("mode is %s (not a string): INVALID_VALUE" % d, plus(R(v, "g", 0)), V)
for d, v in [("null", None), ("true", True), ("false", False), ("an empty array", []), ("an empty object", {})]:
    B("mods is %s (not an integer): INVALID_VALUE" % d, plus(R("normal", "g", v)), V)
for d, v in [("the number 5", 5), ("null", None), ("true", True), ("an array holding a", ["a"]), ("an empty object", {})]:
    B("key is %s (not a string): UNKNOWN_KEY" % d, plus(R("normal", v, 0)), UK)
for d, a in [("the string fit", "fit"), ("null", None), ("an empty array", []), ("an array holding a fit action", [FIT]), ("the number 5", 5), ("true", True), ("an object without type", {}),
             ("an object without type but with a field (dx 1)", {"dx": 1}), ("an object whose type is the number 5", {"type": 5}), ("an object whose type is null", {"type": None}),
             ("an object whose type is true", {"type": True}), ("an object whose type is an array holding fit", {"type": ["fit"]}), ("an object whose type is an empty object", {"type": {}})]:
    B("action is %s: UNKNOWN_ACTION" % d, plus(R("normal", "g", 0, a)), UA)
# order of the per-row checks with the new faults
B("order: mode null before key 5 (INVALID_VALUE)", plus(R(None, 5, 0)), V)
B("order: mods null before key 5 (INVALID_VALUE)", plus(R("normal", 5, None)), V)
B("order: key null before action null (UNKNOWN_KEY)", plus(R("normal", None, 0, None)), UK)
B("order: mods 16 before action null (INVALID_VALUE)", plus(R("normal", "g", 16, None)), V)
B("order: action the string fit before Tab (key Tab, UNKNOWN_ACTION)", plus(R("normal", "Tab", 0, "fit")), UA)
B("order: action fields (pan dx 2^31 + 1) before Tab (INVALID_VALUE)", plus(R("normal", "Tab", 0, pan(2 ** 31 + 1, 0))), V)

# ---------------------------------------------------------------------- X rows
def xrow(rid, desc, inp, fn, want, expected=""):
    add_row(rid, "X", SC, LY, json.dumps(inp, separators=(",", ":"), sort_keys=True), expected, "" if want[0] == "ok" else want[1], fn, want, desc)


def parse_only(mb):
    parse_manifest(mb)
    return None


def x_parse(desc, mb, want):
    rid = nid("X")
    p = "manifests/%s.manifest.json" % rid
    put(p, mb)
    xrow(rid, desc, {"manifest": p, "op": "parse"}, lambda: parse_only(mb), ("ok", None) if want == "ok" else ("err", want))
    return rid


def x_verify(desc, files, mb, want, png=None):
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


def x_embed(desc, png_in, binding, want):
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
    return rid


def x_read(desc, png_in, want):
    rid = nid("X")
    ip = "png/%s.in.png" % rid
    put(ip, png_in)
    if want == "ok":
        out = cj(read_binding(png_in))
        op = "json/%s.binding.json" % rid
        put(op, out)
        xrow(rid, desc, {"op": "read", "png": ip}, lambda: cj(read_binding(png_in)), ("ok", out), expected=op)
    else:
        xrow(rid, desc, {"op": "read", "png": ip}, lambda: cj(read_binding(png_in)), ("err", want))
    return rid


def export_fn(arts, size):
    png = embed_binding(FIXTURE, BIND) if "png" in arts else None
    if size is not None and (png is not None or M("P_size_always")):
        w, h = struct.unpack(">II", (png or FIXTURE)[16:24]) if png is not None else (-1, -1)
        sw, sh = size["width"], size["height"]
        if M("P_size_trunc32"):
            sw, sh = (sw % 2 ** 32 if is_int(sw) else sw), (sh % 2 ** 32 if is_int(sh) else sh)
        if M("P_size_abs"):
            sw, sh = abs(sw), abs(sh)
        if M("P_size_round"):
            sw, sh = round(sw), round(sh)
        ok = (w, h) == (sw, sh)
        if M("P_size_zero_ok") and (sw == 0 or sh == 0):
            ok = True
        if M("P_size_truthy") and not (sw and sh):
            ok = True
        if M("P_size_nonint_schema") and not (is_int(sw) and is_int(sh)):
            raise Err("INVALID_CONFIG", "SCHEMA")
        if not ok:
            raise Err("INVALID_EXPORT", "PNG_SIZE_MISMATCH")
    return cj(man_dict(png=png, svg="svg" in arts))


def x_export(desc, arts, size, want):
    rid = nid("X")
    inp = {"artifacts": arts, "op": "export"}
    if size is not None:
        inp["expectedPngSize"] = size
    fn = lambda: export_fn(arts, size)
    if want == "ok":
        out = fn()
        op = "json/%s.manifest.json" % rid
        put(op, out)
        xrow(rid, desc, inp, fn, ("ok", out), expected=op)
    else:
        xrow(rid, desc, inp, fn, ("err", want))
    return rid


E_ = "INVALID_EXPORT/"
SC_, NC, UN = E_ + "SCHEMA", E_ + "NON_CANONICAL", E_ + "UNKNOWN_ARTIFACT"
MAL, BOUND, MISM = E_ + "PNG_MALFORMED", E_ + "PNG_ALREADY_BOUND", E_ + "PNG_SIZE_MISMATCH"


def sub(b, old, new):
    assert b.count(old) >= 1, old
    return b.replace(old, new, 1)


def mod(f, base=BASEB):
    d = json.loads(base)
    f(d)
    return cj(d)


def pretty(b):
    return json.dumps(json.loads(b), indent=2, sort_keys=True).encode()


def named(raw_name_json, extra=True):
    """the X01 manifest plus one artifact entry (a copy of the scene entry) whose name is the placeholder ZZZZ, replaced by the given raw bytes of the JSON string
    (including the quotes); the placeholder sorts first, so the list stays sorted by ZZZZ"""
    def f(d):
        e = dict(d["artifacts"][1])
        e["name"] = "ZZZZ"
        d["artifacts"] = [e] + d["artifacts"]
    b = mod(f)
    assert b.count(b'"ZZZZ"') == 1
    return b.replace(b'"ZZZZ"', raw_name_json)


RULE[0] = "R32-07"
# --- R32-07: the bytes of the manifest
x_parse("the X01 manifest preceded by a UTF-8 byte order mark (EF BB BF): a syntax fault, SCHEMA", b"\xef\xbb\xbf" + BASEB, SC_)
x_parse("a byte order mark and nothing else", b"\xef\xbb\xbf", SC_)
x_verify("verify: the X01 manifest preceded by a byte order mark, every listed file present: SCHEMA", FILES0, b"\xef\xbb\xbf" + BASEB, SC_)
for d, raw in [("a stray 0xFF byte", b"scene\xff"), ("an overlong NUL (C0 80)", b"\xc0\x80"), ("an encoded surrogate (ED A0 80)", b"\xed\xa0\x80"), ("a truncated two-byte sequence (C3 then the quote)", b"sc\xc3"),
               ("a code point above U+10FFFF (F4 90 80 80)", b"\xf4\x90\x80\x80"), ("a stray continuation byte (80)", b"\x80x")]:
    x_parse("invalid UTF-8 inside an artifact name (%s): SCHEMA, not a replacement character and an unknown name" % d, named(b'"' + raw + b'"'), SC_)
x_parse("valid UTF-8 inside an artifact name (scene with e grave, C3 A8): an unknown name, UNKNOWN_ARTIFACT", named('"scène"'.encode("utf-8")), UN)
x_parse("valid four-byte UTF-8 inside an artifact name (U+1F600): an unknown name, UNKNOWN_ARTIFACT", named('"\U0001F600"'.encode("utf-8")), UN)
# duplicate keys: the last value is read, the re-serialisation differs
x_parse("duplicate top-level key export (same value twice): NON_CANONICAL", sub(BASEB, b'"export":"igr-export/1",', b'"export":"igr-export/1","export":"igr-export/1",'), NC)
x_parse("duplicate key name inside the first artifact entry (same value twice): NON_CANONICAL", sub(BASEB, b'"name":"layout",', b'"name":"layout","name":"layout",'), NC)
x_parse("duplicate key igr: the first value IGR/2 is wrong, the last IGR/1 is right (the last value is read): NON_CANONICAL", sub(BASEB, b'"igr":"IGR/1",', b'"igr":"IGR/2","igr":"IGR/1",'), NC)
x_parse("duplicate key igr: the first value IGR/1 is right, the last IGR/2 is wrong: SCHEMA", sub(BASEB, b'"igr":"IGR/1",', b'"igr":"IGR/1","igr":"IGR/2",'), SC_)
x_parse("duplicate key bytes in the first entry: the first value is the string 398, the last the integer 398: NON_CANONICAL", sub(BASEB, b'"bytes":398,', b'"bytes":"398","bytes":398,'), NC)
x_parse("duplicate key bytes in the first entry: the first value is the integer 398, the last the string 398: SCHEMA", sub(BASEB, b'"bytes":398,', b'"bytes":398,"bytes":"398",'), SC_)
x_parse("duplicate key export AND an unknown artifact name (ZZZZ): the name pass comes first, UNKNOWN_ARTIFACT",
        sub(named(b'"ZZZZ"'), b'"export":"igr-export/1",', b'"export":"igr-export/1","export":"igr-export/1",'), UN)
x_parse("duplicate key export AND an unsorted artifact list (scene before layout): the order pass comes first, SCHEMA",
        sub(mod(lambda d: d.__setitem__("artifacts", [d["artifacts"][1], d["artifacts"][0], d["artifacts"][2]])), b'"export":"igr-export/1",', b'"export":"igr-export/1","export":"igr-export/1",'), SC_)
# number spellings: an integer spelled with a fraction or an exponent re-serialises differently
for sp in [b"398.0", b"3.98e2", b"398E0", b"0.398e3", b"398e+0"]:
    x_parse("the bytes of the first entry spelled %s (the value is the integer 398): NON_CANONICAL" % sp.decode(), sub(BASEB, b'"bytes":398,', b'"bytes":' + sp + b","), NC)
for sp in [b"1e2", b"1E2", b"1e+2", b"100.0", b"10e1"]:
    x_parse("the bytes of the first entry spelled %s (the value is the integer 100): NON_CANONICAL" % sp.decode(), sub(BASEB, b'"bytes":398,', b'"bytes":' + sp + b","), NC)
x_parse("the bytes of the first entry spelled 0.0 (the value is the integer 0): NON_CANONICAL", sub(BASEB, b'"bytes":398,', b'"bytes":0.0,'), NC)
x_parse("the bytes of the first entry spelled 9007199254740991.0 (2^53 - 1 with a fraction): NON_CANONICAL", sub(BASEB, b'"bytes":398,', b'"bytes":9007199254740991.0,'), NC)
x_parse("the bytes of the first entry is -0: not an integer in the canonical form, INVALID_EXPORT/SCHEMA (the owner's ruling)", sub(BASEB, b'"bytes":398,', b'"bytes":-0,'), SC_)
# lone surrogate escapes are valid JSON; the value checks judge them
for d, esc in [("a lone high surrogate \\ud800", b'"\\ud800"'), ("a lone low surrogate \\udc00", b'"\\udc00"'), ("a high surrogate followed by \\u0041", b'"\\ud800\\u0041"'),
               ("a low surrogate before a high one (\\udc00\\ud800)", b'"\\udc00\\ud800"')]:
    x_parse("artifact name %s: valid JSON, an unknown name, UNKNOWN_ARTIFACT (not a syntax fault)" % d, named(esc), UN)
x_parse("artifact name \\ud83d\\ude00 (a valid surrogate pair): valid JSON, an unknown name, UNKNOWN_ARTIFACT", named(b'"\\ud83d\\ude00"'), UN)
x_parse("artifact name scene with a lone surrogate (scene\\ud800): an unknown name, UNKNOWN_ARTIFACT", named(b'"scene\\ud800"'), UN)

RULE[0] = "R32-08"
# --- R32-08: whole-manifest passes, the first failing pass decides whatever entry it concerns
def p1(d):
    e0 = {"bytes": 1, "media_type": "image/png", "name": "aaa", "sha256": "0" * 64}
    d["artifacts"] = [e0] + d["artifacts"]
    d["artifacts"][3]["bytes"] = "398"


x_parse("order: the FIRST entry has an unknown name (aaa), the LAST entry has bytes the string 398: the value-type pass covers every entry before the name pass, SCHEMA", mod(p1), SC_)


def p2(d):
    d["igr"] = "IGR/2"
    d["artifacts"].append({"bytes": 1, "media_type": "image/png", "name": "thumb", "sha256": "0" * 64})


x_parse("order: igr is IGR/2 (a value fault) AND the last entry is named thumb (an unknown name): the value pass first, SCHEMA", mod(p2), SC_)
x_parse("order: unsorted (scene before layout) AND pretty-printed: the order pass comes before the canonical-bytes pass, SCHEMA",
        pretty(mod(lambda d: d.__setitem__("artifacts", [d["artifacts"][1], d["artifacts"][0], d["artifacts"][2]]))), SC_)
x_parse("order: an unknown entry name (ZZZZ) AND pretty-printed: the name pass before the canonical-bytes pass, UNKNOWN_ARTIFACT", pretty(named(b'"ZZZZ"')), UN)
x_parse("order: the scene entry twice (not strictly ascending) AND pretty-printed: SCHEMA from the order pass", pretty(mod(lambda d: d["artifacts"].insert(1, dict(d["artifacts"][1])))), SC_)
x_parse("order: igr is IGR/2 AND pretty-printed: the value pass before the canonical-bytes pass, SCHEMA", pretty(mod(lambda d: d.__setitem__("igr", "IGR/2"))), SC_)
x_parse("order: key bytes the string 398 in the LAST entry AND an unknown name (ZZZZ) in the FIRST entry of a pretty-printed manifest: SCHEMA",
        pretty(mod(lambda d: (d["artifacts"].__setitem__(2, dict(d["artifacts"][2], bytes="398")), d["artifacts"].insert(0, dict(d["artifacts"][1], name="ZZZZ"))))), SC_)

RULE[0] = "R32-06"
# --- R32-05, R32-06: the PNG container and the order of the embed checks
BADHASH = dict(BIND, scene=BIND["scene"][:-1].upper() + "A")
noiend = png_of([chunk(b"IHDR", IHDR), chunk(b"IDAT", IDAT)])
x_embed("embed order: a bad hash (scene with an uppercase digit) AND a container without IEND: the hashes come first, SCHEMA", noiend, BADHASH, SC_)
x_embed("embed order: a bad hash AND a wrong signature byte: the hashes come first, SCHEMA", FIXTURE[:7] + b"\x0b" + FIXTURE[8:], BADHASH, SC_)
x_embed("embed order: a bad hash AND an already bound container (valid): the hashes come before the already-bound check, SCHEMA", std(extra_after_ihdr=[bchunk()]), BADHASH, SC_)
x_embed("embed order: a bad hash AND an already bound container without IEND: SCHEMA", png_of([chunk(b"IHDR", IHDR), bchunk(), chunk(b"IDAT", IDAT)]), BADHASH, SC_)
x_embed("embed order: good hashes, a binding chunk present AND no IEND: the container comes before the already-bound check, PNG_MALFORMED",
        png_of([chunk(b"IHDR", IHDR), bchunk(), chunk(b"IDAT", IDAT)]), BIND, MAL)
x_embed("embed order: good hashes, a binding chunk present AND IHDR of length 12: PNG_MALFORMED", png_of([chunk(b"IHDR", IHDR[:12]), bchunk(), chunk(b"IDAT", IDAT), chunk(b"IEND", b"")]), BIND, MAL)
# the binding object is closed
x_embed("binding without the state key (scene and layout 64 hex), valid PNG: SCHEMA", FIXTURE, {"layout": BIND["layout"], "scene": BIND["scene"]}, SC_)
x_embed("binding without the layout key, valid PNG: SCHEMA", FIXTURE, {"scene": BIND["scene"], "state": BIND["state"]}, SC_)
x_embed("binding without the scene key, valid PNG: SCHEMA", FIXTURE, {"layout": BIND["layout"], "state": BIND["state"]}, SC_)
x_embed("binding that is an empty object, valid PNG: SCHEMA", FIXTURE, {}, SC_)
x_embed("binding with the three hashes and an extra key note (a string), valid PNG: SCHEMA", FIXTURE, dict(BIND, note="x"), SC_)
x_embed("binding with the three hashes and an extra key source holding a valid 64-hex hash, valid PNG: SCHEMA", FIXTURE, dict(BIND, source=SOURCE_SHA), SC_)
x_embed("binding with capitalised keys Scene, Layout, State (three missing and three extra), valid PNG: SCHEMA", FIXTURE, {"Layout": BIND["layout"], "Scene": BIND["scene"], "State": BIND["state"]}, SC_)
RULE[0] = "R32-05"
# chunk types: four ASCII letters
for d, t in [("a digit as the first byte (1bcd)", b"1bcd"), ("a digit as the last byte (abc1)", b"abc1"), ("a NUL byte inside (ab, 00, d)", b"ab\x00d"), ("a space inside (ab d)", b"ab d"),
             ("an underscore inside (ab_d)", b"ab_d"), ("0x40, one below A (@bcd)", b"@bcd"), ("0x5B, one above Z (a[cd)", b"a[cd"), ("0x60, one below a (ab`d)", b"ab`d"),
             ("0x7B, one above z (abc{)", b"abc{"), ("the Latin-1 letter 0xE9 (a, E9, c, d)", b"a\xe9cd")]:
    x_embed("embed: an ancillary chunk after IHDR whose type is not four ASCII letters, %s (length 1, CRC right): PNG_MALFORMED" % d,
            png_of([chunk(b"IHDR", IHDR), chunk(t, b"x"), chunk(b"IDAT", IDAT), chunk(b"IEND", b"")]), BIND, MAL)
x_embed("embed: a chunk type of the four boundary letters A, Z, a, z (AZaz) after IHDR: four ASCII letters, accepted", png_of([chunk(b"IHDR", IHDR), chunk(b"AZaz", b"x"), chunk(b"IDAT", IDAT), chunk(b"IEND", b"")]), BIND, "ok")
x_embed("embed: the first chunk is ihdr in lower case (length 13): not IHDR, PNG_MALFORMED", png_of([chunk(b"ihdr", IHDR), chunk(b"IDAT", IDAT), chunk(b"IEND", b"")]), BIND, MAL)
x_embed("embed: the last chunk is iend in lower case (length 0): not IEND, PNG_MALFORMED", png_of([chunk(b"IHDR", IHDR), chunk(b"IDAT", IDAT), chunk(b"iend", b"")]), BIND, MAL)
# IEND has length 0
x_embed("embed: the last chunk is IEND with one data byte (length 1, CRC right): PNG_MALFORMED", png_of([chunk(b"IHDR", IHDR), chunk(b"IDAT", IDAT), chunk(b"IEND", b"\x00")]), BIND, MAL)
x_embed("embed: the last chunk is IEND with four data bytes: PNG_MALFORMED", png_of([chunk(b"IHDR", IHDR), chunk(b"IDAT", IDAT), chunk(b"IEND", b"\x00" * 4)]), BIND, MAL)
# K158 replacement rows: at least 45 bytes, valid signature, IHDR first with length 13, last chunk not IEND, otherwise acceptable
k158a = png_of([chunk(b"IHDR", IHDR), chunk(b"IDAT", b"")])
assert len(k158a) == 45
x_embed("embed: exactly 45 bytes: signature, IHDR (length 13), then an empty IDAT as the last chunk and no IEND at all: PNG_MALFORMED (replaces X97 as the killer of K158)", k158a, BIND, MAL)
k158b = png_of([chunk(b"IHDR", IHDR), chunk(b"IDAT", IDAT), chunk(b"tEXt", b"Comment\x00hello")])
assert len(k158b) >= 45
x_embed("embed: signature, IHDR, IDAT and a tEXt Comment chunk as the last chunk, no IEND at all (%d bytes): PNG_MALFORMED" % len(k158b), k158b, BIND, MAL)
# read and verify with the same container rules (readPngBinding parses as embedPngBinding does)
x_read("read: a bound PNG with a chunk of type 1bcd after the binding chunk: PNG_MALFORMED", png_of([chunk(b"IHDR", IHDR), bchunk(), chunk(b"1bcd", b"x"), chunk(b"IDAT", IDAT), chunk(b"IEND", b"")]), MAL)
x_read("read: a bound PNG whose last chunk is IEND with one data byte: PNG_MALFORMED", png_of([chunk(b"IHDR", IHDR), bchunk(), chunk(b"IDAT", IDAT), chunk(b"IEND", b"\x00")]), MAL)
x_read("read: a bound PNG with a chunk of the boundary letters AZaz: four ASCII letters, the binding is returned", png_of([chunk(b"IHDR", IHDR), bchunk(), chunk(b"AZaz", b"x"), chunk(b"IDAT", IDAT), chunk(b"IEND", b"")]), "ok")
x_read("read: a bound PNG with the last chunk a tEXt Comment and no IEND, at least 45 bytes: PNG_MALFORMED", png_of([chunk(b"IHDR", IHDR), bchunk(), chunk(b"IDAT", IDAT), chunk(b"tEXt", b"Comment\x00hello")]), MAL)
FULL = FILES_SVG


def bundle(desc, png, want):
    return x_verify(desc, FULL, cj(man_dict(png=png)), want, png=png)


bundle("verify: bound PNG with a chunk of type ab_d: PNG_MALFORMED", png_of([chunk(b"IHDR", IHDR), bchunk(), chunk(b"ab_d", b"x"), chunk(b"IDAT", IDAT), chunk(b"IEND", b"")]), MAL)
bundle("verify: bound PNG whose last chunk is IEND with one data byte: PNG_MALFORMED", png_of([chunk(b"IHDR", IHDR), bchunk(), chunk(b"IDAT", IDAT), chunk(b"IEND", b"\x00")]), MAL)
bundle("verify: bound PNG with the chunk type a[cd (0x5B): PNG_MALFORMED", png_of([chunk(b"IHDR", IHDR), bchunk(), chunk(b"a[cd", b"x"), chunk(b"IDAT", IDAT), chunk(b"IEND", b"")]), MAL)

RULE[0] = "R32-09"
# --- R32-09: exportBundle and expectedPngSize
x_export("export: svg only with expectedPngSize 2x2 and no png: the size is ignored, the manifest of A.9 X02", ["svg"], {"height": 2, "width": 2}, "ok")
x_export("export: no artifact (no svg, no png) with expectedPngSize 1x1: ignored, the manifest of A.9 X01", [], {"height": 1, "width": 1}, "ok")
x_export("export: svg only with expectedPngSize 0x0 (a size no png can have): ignored without a png", ["svg"], {"height": 0, "width": 0}, "ok")
x_export("export: no artifact with expectedPngSize width 1.5 and height -3: ignored without a png", [], {"height": -3, "width": 1.5}, "ok")
for d, sz in [("width 1.5, height 1", {"height": 1, "width": 1.5}), ("width 1, height 1.5", {"height": 1.5, "width": 1}), ("width 1.0000001, height 1", {"height": 1, "width": 1.0000001}),
              ("width 0, height 0", {"height": 0, "width": 0}), ("width 0, height 1", {"height": 1, "width": 0}), ("width 1, height 0", {"height": 0, "width": 1}),
              ("width -1, height 1", {"height": 1, "width": -1}), ("width 1, height -1", {"height": -1, "width": 1}),
              ("width 4294967297 (2^32 + 1), height 1", {"height": 1, "width": 4294967297}), ("width 1, height 4294967297", {"height": 4294967297, "width": 1}),
              ("width 3, height 3", {"height": 3, "width": 3})]:
    x_export("export: a png of 1x1 with expectedPngSize %s: it does not match the IHDR, PNG_SIZE_MISMATCH" % d, ["png"], sz, MISM)
x_export("export: svg and png (the png is 1x1) with expectedPngSize 2x1: PNG_SIZE_MISMATCH", ["svg", "png"], {"height": 1, "width": 2}, MISM)

RULE[0] = "R32-10"
# --- R32-10: parseMachine pointer-field ranges (rows E74 ..)
def P_(id_=1, **kw):
    d = {"button": 0, "id": id_, "lasso": False, "long": False, "mods0": 0, "moved": False, "ptype": "mouse", "t0": 0, "x": 0, "x0": 0, "y": 0, "y0": 0}
    d.update(kw)
    return d


def press_m(p, last_t=0):
    return {"gesture": "press", "last_t": last_t, "mode": "normal", "pointers": [p], "rem_x": 0, "rem_y": 0, "wheel_acc": 0}


def pinch_m(p1, p2, d=1, mx=0, my=0, last_t=0):
    return {"gesture": "pinch", "last_t": last_t, "mode": "normal", "pinch": {"d": d, "mx": mx, "my": my}, "pointers": [dict(p1, moved=True), dict(p2, moved=True)], "rem_x": 0, "rem_y": 0, "wheel_acc": 0}


def e_machine(desc, m, want):
    rid = nid("E")
    b = cj(m)
    p = "inputs/%s.machine.json" % rid
    put(p, b)
    add_row(rid, "E", "", "", json.dumps({"machine": p}, separators=(",", ":"), sort_keys=True), "", "" if want == "ok" else want, lambda b=b: parse_machine(b), ("ok", None) if want == "ok" else ("err", want), desc)
    return rid


MS = "INVALID_MACHINE/SCHEMA"
H39, L39, H52, H31, H41 = 2 ** 39, -2 ** 39, 2 ** 52, 2 ** 31 - 1, 2 ** 41
e_machine("accepted: a press pointer at the top of every pointer range: id 2^31 - 1, x, x0, y, y0 = 2^39, t0 = 2^52, last_t = 2^52", press_m(P_(H31, x=H39, x0=H39, y=H39, y0=H39, t0=H52), H52), "ok")
e_machine("accepted: a press pointer at the bottom of every pointer range: id 0, x, x0, y, y0 = -2^39, t0 = 0, last_t = 0", press_m(P_(0, x=L39, x0=L39, y=L39, y0=L39, t0=0), 0), "ok")
e_machine("accepted: an idle machine with last_t = 2^52 (the top of the last_t range)", {"gesture": "idle", "last_t": H52, "mode": "normal", "pointers": [], "rem_x": 0, "rem_y": 0, "wheel_acc": 0}, "ok")
e_machine("accepted: a pinch at the top: ids 0 and 2^31 - 1, second pointer x = 2^39 and t0 = 2^52, pinch d = 2^41, mx = my = 2^39, last_t = 2^52",
          pinch_m(P_(0), P_(H31, x=H39, y=H39, x0=H39, y0=H39, t0=H52), H41, H39, H39, H52), "ok")
e_machine("accepted: a pinch at the bottom: pinch d = 0 (zero distance), mx = my = -2^39, pointers at x = -2^39", pinch_m(P_(0, x=L39, x0=L39, y=L39, y0=L39), P_(1, x=L39, x0=L39, y=L39, y0=L39), 0, L39, L39, 0), "ok")
for f in ("x", "x0", "y", "y0"):
    e_machine("pointer %s = 2^39 + 1 (one above the event domain): SCHEMA" % f, press_m(P_(1, **{f: H39 + 1})), MS)
    e_machine("pointer %s = -2^39 - 1 (one below the event domain): SCHEMA" % f, press_m(P_(1, **{f: L39 - 1})), MS)
e_machine("pointer t0 = 2^52 + 1 (one above), last_t = 2^52: SCHEMA", press_m(P_(1, t0=H52 + 1), H52), MS)
e_machine("pointer t0 = -1 (one below 0): SCHEMA", press_m(P_(1, t0=-1), 0), MS)
e_machine("pointer id = 2^31 (one above 2^31 - 1): SCHEMA", press_m(P_(H31 + 1)), MS)
e_machine("pointer id = -1 (one below 0): SCHEMA", press_m(P_(-1)), MS)
e_machine("pinch mx = 2^39 + 1: SCHEMA", pinch_m(P_(1), P_(2), 1, H39 + 1, 0), MS)
e_machine("pinch mx = -2^39 - 1: SCHEMA", pinch_m(P_(1), P_(2), 1, L39 - 1, 0), MS)
e_machine("pinch my = 2^39 + 1: SCHEMA", pinch_m(P_(1), P_(2), 1, 0, H39 + 1), MS)
e_machine("pinch my = -2^39 - 1: SCHEMA", pinch_m(P_(1), P_(2), 1, 0, L39 - 1), MS)
e_machine("pinch d = 2^41 + 1 (one above): SCHEMA", pinch_m(P_(1), P_(2), H41 + 1), MS)
e_machine("pinch d = -1 (one below 0): SCHEMA", pinch_m(P_(1), P_(2), -1), MS)
e_machine("last_t = 2^52 + 1 (one above): SCHEMA", {"gesture": "idle", "last_t": H52 + 1, "mode": "normal", "pointers": [], "rem_x": 0, "rem_y": 0, "wheel_acc": 0}, MS)
e_machine("last_t = -2 (one below -1): SCHEMA", {"gesture": "idle", "last_t": -2, "mode": "normal", "pointers": [], "rem_x": 0, "rem_y": 0, "wheel_acc": 0}, MS)
e_machine("second pointer of a pinch: x = 2^39 + 1: SCHEMA", pinch_m(P_(1), P_(2, x=H39 + 1)), MS)
e_machine("second pointer of a pinch: y0 = -2^39 - 1: SCHEMA", pinch_m(P_(1), P_(2, y0=L39 - 1)), MS)
e_machine("second pointer of a pinch: t0 = 2^52 + 1, last_t = 2^52: SCHEMA", pinch_m(P_(1), P_(2, t0=H52 + 1), 1, 0, 0, H52), MS)
e_machine("second pointer of a pinch: id = 2^31: SCHEMA", pinch_m(P_(1), P_(H31 + 1)), MS)

# the earlier row E60 (an idle machine, last_t -1) also exercises the bottom of last_t: evaluated for the mutant matrix only
PRE.append(("E60", lambda: parse_machine(rd("inputs/E60.machine.json")), ("ok", None)))
PRE.append(("E61", lambda: parse_machine(rd("inputs/E61.machine.json")), ("err", MS)))
PRE.append(("E63", lambda: parse_machine(rd("inputs/E63.machine.json")), ("err", MS)))

# ======================================================================= mutants (K201 ..)
MUTANTS = [
    # bindings (R32-02, R32-03, R32-04)
    ("R_pan_nodomain", "pan dx and dy not range-checked (any integer accepted)"), ("R_pan_dx_nodomain", "pan dx not range-checked"), ("R_pan_dy_nodomain", "pan dy not range-checked"),
    ("R_pan_neg_nodomain", "pan lower bound not checked (only the upper bound)"), ("R_pan_hi_open", "pan upper bound 2^31 refused (strict below 2^31)"), ("R_pan_lo_open", "pan lower bound -2^31 refused (strict above -2^31)"),
    ("R_zoom_nodomain", "zoom factor not range-checked (any integer accepted)"), ("R_zoom_zero_ok", "zoom factor 0 accepted (lower bound 0 instead of 1)"), ("R_zoom_neg_ok", "zoom lower bound not checked (negative factors accepted)"),
    ("R_zoom_hi_open", "zoom factor 1000000 refused (strict below 1,000,000)"), ("R_zoom_hi_nocheck", "zoom upper bound not checked"),
    ("R_dir_any", "any string accepted as a spatial dir"), ("R_dir_case", "spatial dir compared case-insensitively"), ("R_dir_trim", "spatial dir trimmed of white space before the comparison"),
    ("R_end_any", "any string accepted as an endpoint end"), ("R_end_case", "endpoint end compared case-insensitively"), ("R_end_trim", "endpoint end trimmed of white space before the comparison"),
    ("R_step_delta_any", "any integer accepted as a step delta"), ("R_incident_delta_any", "any integer accepted as an incident delta"), ("R_delta_zero_ok", "delta 0 accepted"),
    ("R_delta_positive_any", "any positive integer accepted as a delta"),
    ("R_mode_nonstr_schema", "a non-string mode reported as SCHEMA instead of INVALID_VALUE"), ("R_mode_coerce", "mode converted with String() before the check (an array holding normal accepted)"),
    ("R_mods_coerce", "mods converted with Number() before the check (null, false, an empty array read as 0)"), ("R_key_nonstr_invalid_value", "a non-string key reported as INVALID_VALUE instead of UNKNOWN_KEY"),
    ("R_key_nonstr_schema", "a non-string key reported as SCHEMA instead of UNKNOWN_KEY"), ("R_key_coerce", "key converted with String() before the check (an array holding a accepted)"),
    ("R_action_nonobj_schema", "an action that is not an object reported as SCHEMA instead of UNKNOWN_ACTION"), ("R_action_notype_invalid_value", "an action without a string type reported as INVALID_VALUE instead of UNKNOWN_ACTION"),
    ("R_action_str_coerce", "an action given as a string read as its type"), ("R_type_coerce", "an action type converted with String() (an array holding fit read as fit)"),
    ("R_tab_before_fields", "Tab checked before the action fields"),
    # embed and container (R32-05, R32-06)
    ("E_order_container_first", "embed checks the container before the hashes"), ("E_order_bound_before_container", "embed checks the already-bound state before the container"),
    ("E_order_bound_before_hash", "embed checks the already-bound state before the hashes"), ("E_binding_open", "embed ignores extra keys of the binding object"),
    ("Q_type_any", "chunk types not checked"), ("Q_type_first_only", "only the first byte of a chunk type checked"), ("Q_type_skip_last", "the fourth byte of a chunk type not checked"),
    ("Q_type_hi_Z", "0x5B accepted as a letter (range A to [)"), ("Q_type_lo_A", "0x40 accepted as a letter (range @ to Z)"), ("Q_type_hi_z", "0x7B accepted as a letter (range a to {)"),
    ("Q_type_lo_a", "0x60 accepted as a letter (range ` to z)"), ("Q_type_latin1", "Latin-1 letters accepted in a chunk type"), ("Q_type_alnum", "digits accepted in a chunk type"),
    ("Q_ihdr_case", "the first chunk compared to IHDR case-insensitively"), ("Q_iend_case", "the last chunk compared to IEND case-insensitively"), ("Q_iend_len_any", "IEND length not required to be 0"),
    # manifest bytes (R32-07, R32-08)
    ("N_bom_ok", "a leading byte order mark skipped"), ("N_utf8_lenient", "invalid UTF-8 decoded with replacement characters"), ("N_utf8_surrogatepass", "UTF-8 encoded surrogates (ED A0 80) accepted"),
    ("N_dup_first_wins", "the first value of a repeated key read instead of the last"), ("N_dup_syntax", "a duplicate key reported as a syntax fault (SCHEMA)"),
    ("N_dup_undetected", "a duplicate key not detected by the canonical-bytes check"), ("N_num_spell_ok", "numbers compared by value in the canonical-bytes check (398.0 and 1e2 accepted)"),
    ("N_num_float_schema", "a number spelled with a fraction or an exponent reported as SCHEMA instead of NON_CANONICAL"), ("N_negzero_nc", "-0 read as 0 and reported as NON_CANONICAL instead of SCHEMA"),
    ("N_surr_syntax", "a lone surrogate escape reported as a syntax fault (SCHEMA)"), ("N_names_before_types", "artifact names judged before the closed key set and value types (entry order of passes swapped)"),
    ("N_canon_after_types", "canonical bytes judged right after the value-type pass, before names and order"), ("N_canon_after_names", "canonical bytes judged after the name pass but before the order pass"),
    # export (R32-09)
    ("P_size_always", "expectedPngSize checked (and mismatching) even when no png is supplied"), ("P_size_nonint_schema", "a non-integer expectedPngSize reported as a configuration error instead of PNG_SIZE_MISMATCH"),
    ("P_size_zero_ok", "an expectedPngSize dimension of 0 treated as any size"), ("P_size_trunc32", "expectedPngSize compared modulo 2^32"), ("P_size_abs", "expectedPngSize compared by absolute value"),
    ("P_size_round", "expectedPngSize rounded before the comparison"), ("P_size_truthy", "a falsy expectedPngSize dimension skips the check"),
]
for f, (lo, hi) in LIMS.items():
    nm = {"last_t": "last_t", "x": "pointer x", "x0": "pointer x0", "y": "pointer y", "y0": "pointer y0", "t0": "pointer t0", "id": "pointer id", "mx": "pinch mx", "my": "pinch my", "d": "pinch d"}[f]
    MUTANTS += [("M_%s_nohi" % f, "%s: upper bound not checked" % nm), ("M_%s_nolo" % f, "%s: lower bound not checked" % nm),
                ("M_%s_hiopen" % f, "%s: the upper limit value itself refused (off by one)" % nm), ("M_%s_loopen" % f, "%s: the lower limit value itself refused (off by one)" % nm)]
MUTANTS += [("M_pointer_unchecked", "pointer and pinch fields not range-checked (the rev 3 reading, 'not range-checked again')"), ("M_second_unchecked", "pointer ranges checked on the first pointer only")]
# the corrected K158: the same mutation as K158 (last chunk not required to be IEND) with the 45-byte minimum kept, killed by rows of at least 45 bytes
K158_MUT = ("Q_last", "K158 restated (correction): last chunk not required to be IEND, the 45-byte minimum kept; X97 (33 bytes) is refused by the minimum and does not kill it, rows of at least 45 bytes do")


def outcomes():
    out = {}
    for r in ROWS:
        try:
            out[r["id"]] = run(r["fn"])
        except Unspecified:
            raise
        except Exception as e:
            out[r["id"]] = ("crash", type(e).__name__)
    for rid, fn, want in PRE:
        try:
            out[rid] = run(fn)
        except Exception as e:
            out[rid] = ("crash", type(e).__name__)
    return out


def main():
    MUT.clear()
    base = outcomes()
    bad = [(r["id"], r["desc"], base[r["id"]], r["want"]) for r in ROWS if base[r["id"]] != r["want"]]
    bad += [(rid, "pre-existing row", base[rid], want) for rid, fn, want in PRE if base[rid] != want]
    if bad:
        for b in bad:
            print("SELF-CHECK FAIL", b, file=sys.stderr)
        sys.exit(1)
    kill = []
    for name, desc in MUTANTS + [K158_MUT]:
        MUT.clear()
        MUT.add(name)
        o = outcomes()
        changed = [i for i in base if o[i] != base[i] and o[i][0] != "crash"]
        crashed = [i for i in base if o[i][0] == "crash"]
        kill.append((name, desc, changed, crashed))
    MUT.clear()
    survivors = [k for k in kill if not k[2]]
    crashers = [k for k in kill if k[3]]
    print("rows: B %d, E %d, X %d; new files %d; mutants %d (+1 correction); survivors %d; crashes %d" % (
        sum(1 for r in ROWS if r["group"] == "B"), sum(1 for r in ROWS if r["group"] == "E"), sum(1 for r in ROWS if r["group"] == "X"), len(NEW_FILES), len(MUTANTS), len(survivors), len(crashers)))
    for k in survivors:
        print("SURVIVOR", k[0], k[1])
    for k in crashers:
        print("CRASH", k[0], k[3])
    # equivalent mutants (recorded in AMBIGUITIES.md): the 45-byte minimum and the 2^31 length cap cannot be told apart from the exact-fill rule
    for name in ("Q_min45_off", "Q_len31_off"):
        MUT.clear()
        MUT.add(name)
        o = outcomes()
        MUT.clear()
        ch = [i for i in base if o[i] != base[i]]
        print("EQUIVALENT-CHECK", name, "rows changed:", ch)
        assert not ch, (name, ch)
    if survivors or crashers:
        sys.exit(2)
    return base, kill


# ======================================================================= regression: the earlier rows read with the rev 4 reference
def regress():
    """every earlier B, E (machine) and X (parse, embed, read, export, and the verify rows whose steps 3-5 need no model) row, evaluated by this reference and compared with EXPECT.tsv"""
    MUT.clear()
    skip_verify = {"X09", "X10", "X14", "X15", "X26"}     # need buildRenderModel / parseState / renderSvg (steps 3-5)
    n = ok = 0
    problems = []
    with open(os.path.join(ROOT, "EXPECT.tsv"), "rb") as f:
        lines = f.read().decode("utf-8").split("\n")[1:]
    for ln in lines:
        if not ln:
            continue
        c = ln.split("\t")
        rid, grp, scene, layout, inp, exp, err = c[0], c[1], c[3], c[4], c[5], c[6], c[7]
        if rid in {r["id"] for r in ROWS}:
            continue
        want = ("err", err) if err else ("ok", None)
        res = None
        try:
            if grp == "B" and inp.endswith(".bindings.json"):
                res = run(lambda: verify_bindings(json.loads(rd(inp))))
            elif grp == "E" and inp.startswith('{"machine"'):
                res = run(lambda: parse_machine(rd(json.loads(inp)["machine"])))
            elif grp == "X" and inp.startswith("{"):
                j = json.loads(inp)
                op = j["op"]
                if op == "parse":
                    res = run(lambda: parse_only(rd(j["manifest"])))
                elif op == "embed":
                    r1 = run(lambda: embed_binding(rd(j["png"]), j["binding"]))
                    if r1[0] == "ok":
                        assert exp and rd(exp) == r1[1], rid
                        r1 = ("ok", None)
                    res = r1
                elif op == "read":
                    r1 = run(lambda: cj(read_binding(rd(j["png"]))))
                    if r1[0] == "ok":
                        assert exp and rd(exp) == r1[1], rid
                        r1 = ("ok", None)
                    res = r1
                elif op == "export":
                    r1 = run(lambda: export_fn(j["artifacts"], j.get("expectedPngSize")))
                    if r1[0] == "ok":
                        assert exp and rd(exp) == r1[1], rid
                        r1 = ("ok", None)
                    res = r1
                elif op == "verify" and rid not in skip_verify and j["manifest"] != "generated/X24.manifest.bin":
                    files = {k: rd(v) for k, v in j["files"].items()}
                    res = run(lambda: verify_bundle(files, rd(j["manifest"])))
        except Unspecified as e:
            problems.append((rid, "UNSPECIFIED", str(e)))
            continue
        if res is None:
            continue
        n += 1
        if res == want:
            ok += 1
        else:
            problems.append((rid, res, want))
    return n, ok, problems


def write_all(base, kill):
    with open(os.path.join(ROOT, "EXPECT.tsv"), "rb") as f:
        old_expect = f.read()
    with open(os.path.join(ROOT, "MUTANTS.tsv"), "rb") as f:
        old_mut = f.read()
    ids = {l.split(b"\t")[0].decode() for l in old_expect.split(b"\n") if l}
    new_ids = [r["id"] for r in ROWS]
    kids = ["K%d" % (201 + i) for i in range(len(kill))]
    for i in new_ids + kids:
        assert i not in ids, i
    assert len(set(new_ids + kids)) == len(new_ids) + len(kids)
    lines = ["\t".join([r["id"], r["group"], "core", r["scene"], r["layout"], r["input"], r["expected"], r["error"]]) for r in ROWS]
    lines += ["\t".join([k, "K", "", "", "", "", "", ""]) for k in kids]
    assert old_expect.endswith(b"\n") and b"\r" not in old_expect
    new_expect = old_expect + ("\n".join(lines) + "\n").encode("utf-8")
    mlines = []
    for k, (name, desc, changed, crashed) in zip(kids, kill):
        ch = ",".join(changed)
        mlines.append("\t".join([k, "KILLED", ch, ch, desc]))
    assert old_mut.endswith(b"\n")
    new_mut = old_mut + ("\n".join(mlines) + "\n").encode("utf-8")
    for p, d in NEW_FILES.items():
        full = os.path.join(ROOT, p)
        assert not os.path.exists(full), p
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "wb") as f:
            f.write(d)
    with open(os.path.join(ROOT, "EXPECT.tsv"), "wb") as f:
        f.write(new_expect)
    with open(os.path.join(ROOT, "MUTANTS.tsv"), "wb") as f:
        f.write(new_mut)
    return kids


def check_existing_equal():
    """dry run on a written corpus: every file this script would write is already there and equal"""
    for p, d in NEW_FILES.items():
        full = os.path.join(ROOT, p)
        if os.path.exists(full):
            assert rd(p) == d, "differs: " + p


if __name__ == "__main__":
    base, kill = main()
    n, ok, problems = regress()
    print("regression over earlier rows: %d evaluated, %d agree, %d differ" % (n, ok, len(problems)))
    for p in problems:
        print("REGRESSION", p)
    if problems:
        sys.exit(3)
    if WRITE:
        kids = write_all(base, kill)
        sys.path.insert(0, HERE)
        import gaps2_text
        gaps2_text.apply(ROOT, ROWS, kill, kids, NEW_FILES, n)
        print("sums", regen_sums())
        print("written")
    else:
        check_existing_equal()
        for k in kill[:0]:
            pass
