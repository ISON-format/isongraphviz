"""Arithmetic, canonical JSON and text helpers (standard library only)."""
import hashlib
import math

BS = chr(92)  # backslash, spelled out so no editor or shell can eat it


def floor_div(a, b):
    assert b > 0
    return a // b


def div_round(a, b):
    """round half toward +infinity (27 section 3)."""
    assert b > 0
    return (2 * a + b) // (2 * b)


def isqrt(n):
    assert n >= 0
    return math.isqrt(n)


def sha256_hex(b):
    return hashlib.sha256(b).hexdigest()


def u16len(s):
    return len(s.encode("utf-16-le", "surrogatepass")) // 2


def _key16(k):
    return k.encode("utf-16-be", "surrogatepass")


_ESC = {
    0x22: BS + '"',
    0x5C: BS + BS,
    0x08: BS + "b",
    0x09: BS + "t",
    0x0A: BS + "n",
    0x0C: BS + "f",
    0x0D: BS + "r",
}


def cj_str(s):
    out = ['"']
    for ch in s:
        o = ord(ch)
        if 0xD800 <= o <= 0xDFFF:
            raise ValueError("lone surrogate in canonical string")
        if o in _ESC:
            out.append(_ESC[o])
        elif o < 0x20:
            out.append(BS + "u%04x" % o)
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def cj(v):
    """IGS-CJ/1 + signed integers (IGL-CJ/1): sorted keys (UTF-16), no whitespace."""
    if v is True:
        return "true"
    if v is False:
        return "false"
    if v is None:
        return "null"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, str):
        return cj_str(v)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(cj(x) for x in v) + "]"
    if isinstance(v, dict):
        return "{" + ",".join(cj_str(k) + ":" + cj(v[k]) for k in sorted(v, key=_key16)) + "}"
    raise TypeError("not canonical: %r" % (type(v),))


def cjb(v):
    return cj(v).encode("utf-8")


def line(v):
    """one canonical line with its LF (4.2)"""
    return cjb(v) + b"\n"


_XS_BAD = set(list(range(0, 9)) + [0x0B, 0x0C] + list(range(0x0E, 0x20)) + [0xFFFE, 0xFFFF])


def xs(s):
    return "".join("�" if ord(c) in _XS_BAD else c for c in s)


def dl_text(s):
    """drawn label dl(s) (30 section 7.5(a)): TAB LF CR -> space, xs, truncate to 24 UTF-16 units"""
    s = s.replace("\t", " ").replace("\n", " ").replace("\r", " ")
    s = xs(s)
    if u16len(s) <= 24:
        return s
    out = []
    n = 0
    for ch in s:
        l = 2 if ord(ch) > 0xFFFF else 1
        if n + l > 23:
            break
        out.append(ch)
        n += l
    return "".join(out) + "…"


def ojson(v):
    """ordinary JSON (test inputs and outcome files that may hold non-integers): sorted keys, indent 1, one LF"""
    import json
    return (json.dumps(v, sort_keys=True, indent=1, ensure_ascii=False) + chr(10)).encode("utf-8")


def ijson(v):
    """compact inline JSON for EXPECT.tsv cells"""
    import json
    return json.dumps(v, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
