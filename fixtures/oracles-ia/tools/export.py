"""Export, PNG container, igr-svg/1 and igr-dl/1 writers (own re-implementation), headless, manifests."""
import re
import struct
import zlib

from base import *  # noqa
import base
from companion import build_tree, tree_bytes

# =============================================================== igr-svg/1 writer (design 30)
CSS = """.igr-svg{font:12px sans-serif}
.igr-shape{stroke:#fff;stroke-width:2}
.igr-k0 .igr-shape{fill:#2a78d6}
.igr-k1 .igr-shape{fill:#eb6834}
.igr-k2 .igr-shape{fill:#1baf7a}
.igr-k3 .igr-shape{fill:#eda100}
.igr-k4 .igr-shape{fill:#e87ba4}
.igr-k5 .igr-shape{fill:#008300}
.igr-k6 .igr-shape{fill:#4a3aa7}
.igr-k7 .igr-shape{fill:#e34948}
.igr-kx .igr-shape{fill:#7a7975}
.igr-line{fill:none;stroke:currentColor;stroke-opacity:.6;stroke-width:2}
.igr-pick{fill:none;stroke:transparent;stroke-width:10;pointer-events:stroke}
.igr-arrow{fill:currentColor;fill-opacity:.6}
.igr-ring-sel{fill:none;stroke:currentColor;stroke-width:3}
.igr-ring-foc{fill:none;stroke:currentColor;stroke-width:2;stroke-dasharray:4 3}
.igr-halo-sel{fill:none;stroke:currentColor;stroke-width:6;stroke-opacity:.35}
.igr-halo-foc{fill:none;stroke:currentColor;stroke-width:10;stroke-opacity:.25;stroke-dasharray:6 4}
.igr-label,.igr-elabel{fill:currentColor;unicode-bidi:isolate;pointer-events:none}"""


def fmt(v):
    mm = div_round(v, 1000)
    if mm == 0:
        return "0"
    sign = "-" if mm < 0 else ""
    q, r = divmod(abs(mm), 1000)
    if r == 0:
        return "%s%d" % (sign, q)
    return "%s%d.%s" % (sign, q, ("%03d" % r).rstrip("0"))


def xs(s):
    out = []
    for ch in s:
        o = ord(ch)
        if o in (9, 10, 13) or 0x20 <= o <= 0xD7FF or 0xE000 <= o <= 0xFFFD or o >= 0x10000:
            out.append(ch)
        else:
            out.append("�")
    return "".join(out)


def TEXT(s):
    return xs(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "&#10;").replace("\r", "&#13;")


def ATTR(s):
    return (xs(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
            .replace("\t", "&#9;").replace("\n", "&#10;").replace("\r", "&#13;"))


def drawn_label(s):
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


def trim(P, Q, t):
    qx, qy = Q[0] - P[0], Q[1] - P[1]
    lam = isqrt(qx * qx + qy * qy)
    return (P[0] + div_round(qx * t, lam), P[1] + div_round(qy * t, lam))


def edge_geometry(m, st, ve):
    """returns dict edge index -> (form, pts(list of micro-pixel tuples), anchor)"""
    S = {}
    for i in range(len(m.nodes)):
        S[i] = screen_node(m, st, i)
    groups = {}
    for ei in ve:
        e = m.edges[ei]
        if e["src"] != e["tgt"]:
            groups.setdefault((min(e["src"], e["tgt"]), max(e["src"], e["tgt"])), []).append(ei)
    loops = {}
    res = {}
    for ei in ve:
        e = m.edges[ei]
        A, B = S[e["src"]], S[e["tgt"]]
        if e["src"] == e["tgt"]:
            r = loops.setdefault(e["src"], 0)
            loops[e["src"]] += 1
            u, h = 8 + 4 * r, 24 + 12 * r
            X, Y = A
            E6 = 10 ** 6
            pts = [(X - 7 * E6, Y - 7 * E6), (X - (7 + u) * E6, Y - (7 + h) * E6), (X + (7 + u) * E6, Y - (7 + h) * E6),
                   (X + 7 * E6, Y - 7 * E6)]
            res[ei] = (2, pts, (X, Y - (25 + 9 * r) * E6))
            continue
        dx, dy = B[0] - A[0], B[1] - A[1]
        L = isqrt(dx * dx + dy * dy)
        if L <= 24 * 10 ** 6:
            res[ei] = (0, [A, B], (div_round(A[0] + B[0], 2), div_round(A[1] + B[1], 2)))
            continue
        g = groups[(min(e["src"], e["tgt"]), max(e["src"], e["tgt"]))]
        if len(g) == 1:
            A1, B1 = trim(A, B, 12 * 10 ** 6), trim(B, A, 12 * 10 ** 6)
            res[ei] = (0, [A1, B1], (div_round(A1[0] + B1[0], 2), div_round(A1[1] + B1[1], 2)))
        else:
            k = len(g)
            p = g.index(ei)
            lo, hi = min(e["src"], e["tgt"]), max(e["src"], e["tgt"])
            Fx, Fy = S[hi][0] - S[lo][0], S[hi][1] - S[lo][1]
            Lf = isqrt(Fx * Fx + Fy * Fy)
            off = (2 * p - (k - 1)) * 16 * 10 ** 6
            Mx, My = div_round(A[0] + B[0], 2), div_round(A[1] + B[1], 2)
            C = (Mx + div_round(-Fy * off, Lf), My + div_round(Fx * off, Lf))
            A1, B1 = trim(A, C, 12 * 10 ** 6), trim(B, C, 12 * 10 ** 6)
            res[ei] = (1, [A1, C, B1], (div_round(A1[0] + 2 * C[0] + B1[0], 4), div_round(A1[1] + 2 * C[1] + B1[1], 4)))
    return res, S


def _path(form, pts):
    f = [(fmt(x), fmt(y)) for x, y in pts]
    if form == 0:
        return "M %s %s L %s %s" % (f[0][0], f[0][1], f[1][0], f[1][1])
    if form == 1:
        return "M %s %s Q %s %s %s %s" % (f[0][0], f[0][1], f[1][0], f[1][1], f[2][0], f[2][1])
    return "M %s %s C %s %s %s %s %s %s" % (f[0][0], f[0][1], f[1][0], f[1][1], f[2][0], f[2][1], f[3][0], f[3][1])


def render_svg(m, st, xml_decl=False, prefix="igr", labels=True, edge_labels=True, style=True, max_label_units=1048576):
    hn, he, sel, foc, vn, ve = st_sets(m, st)
    vp = st["viewport"]
    W, H = vp["width"], vp["height"]
    L = []
    if xml_decl:
        L.append('<?xml version="1.0" encoding="UTF-8"?>')
    L.append('<svg xmlns="http://www.w3.org/2000/svg" class="igr-svg" width="%d" height="%d" viewBox="0 0 %d %d" '
             'role="graphics-document" aria-roledescription="graph" aria-labelledby="%s-title" aria-describedby="%s-desc" '
             'data-igr-svg="igr-svg/1" data-igr-artifact="%s" data-igr-scene="%s" data-igr-layout="%s">'
             % (W, H, W, H, prefix, prefix, m.artifact, m.scene_sha, m.layout_sha))
    L.append('<title id="%s-title">%s</title>' % (prefix, TEXT(summary_text(m))))
    L.append('<desc id="%s-desc">%s</desc>' % (prefix, TEXT(status_text(m, st))))
    if style:
        L.append("<style>")
        L.extend(CSS.split("\n"))
        L.append("</style>")
    if m.directed:
        L.append('<defs><marker id="%s-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="10" markerHeight="10" '
                 'markerUnits="userSpaceOnUse" orient="auto"><path class="igr-arrow" d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>' % prefix)
    trv = [("n", i) for i in vn] + [("e", i) for i in ve]
    stop = foc if foc is not None else (trv[0] if trv else None)
    geo, S = edge_geometry(m, st, ve)
    # label budget walk
    keep = {}
    total = 0
    stopped = False
    if labels:
        cand = [("n", i) for i in vn] + ([("e", i) for i in ve] if edge_labels else [])
        for el in cand:
            s = m.nodes[el[1]]["label"] if el[0] == "n" else m.edges[el[1]]["label"]
            d = drawn_label(s)
            if d == "":
                continue
            if stopped or total + u16len(d) > max_label_units:
                stopped = True
                continue
            total += u16len(d)
            keep[el] = d
    L.append('<g class="igr-nodes">')
    for i in vn:
        n = m.nodes[i]
        el = ("n", i)
        c = m.categories.index(n["category"])
        cls = "igr-k%d" % c if c < 8 else "igr-kx"
        X, Y = S[i]
        cx, cy = fmt(X), fmt(Y)
        L.append('<g id="%s" class="igr-node %s%s%s" role="graphics-symbol" aria-roledescription="node" aria-label="%s" tabindex="%s">'
                 % (element_hex_id(prefix, n["ref"], "n"), cls, " igr-selected" if el in sel else "", " igr-focused" if el == foc else "",
                    ATTR(node_name(m, i)), "0" if el == stop else "-1"))
        L.append("<title>%s</title>" % TEXT(node_name(m, i)))
        if el in sel:
            L.append('<circle class="igr-ring-sel" cx="%s" cy="%s" r="14"/>' % (cx, cy))
        if el == foc:
            L.append('<circle class="igr-ring-foc" cx="%s" cy="%s" r="18"/>' % (cx, cy))
        L.append('<circle class="igr-shape" cx="%s" cy="%s" r="10"/>' % (cx, cy))
        if el in keep:
            L.append('<text class="igr-label" x="%s" y="%s" text-anchor="middle">%s</text>' % (cx, fmt(Y + 24 * 10 ** 6), TEXT(keep[el])))
        L.append("</g>")
    L.append("</g>")
    L.append('<g class="igr-edges">')
    for ei in ve:
        e = m.edges[ei]
        el = ("e", ei)
        form, pts, anc = geo[ei]
        D = _path(form, pts)
        L.append('<g id="%s" class="igr-edge%s%s" role="graphics-symbol" aria-roledescription="edge" aria-label="%s" tabindex="%s">'
                 % (element_hex_id(prefix, e["ref"], "e"), " igr-selected" if el in sel else "", " igr-focused" if el == foc else "",
                    ATTR(e["label"]), "0" if el == stop else "-1"))
        L.append("<title>%s</title>" % TEXT(e["label"]))
        L.append("<desc>%s</desc>" % TEXT(edge_desc(m, ei)))
        if el in sel:
            L.append('<path class="igr-halo-sel" d="%s"/>' % D)
        if el == foc:
            L.append('<path class="igr-halo-foc" d="%s"/>' % D)
        L.append('<path class="igr-line" d="%s"%s/>' % (D, (' marker-end="url(#%s-arrow)"' % prefix) if m.directed else ""))
        L.append('<path class="igr-pick" d="%s"/>' % D)
        if el in keep:
            L.append('<text class="igr-elabel" x="%s" y="%s" text-anchor="middle">%s</text>' % (fmt(anc[0]), fmt(anc[1] - 4 * 10 ** 6), TEXT(keep[el])))
        L.append("</g>")
    L.append("</g>")
    L.append("</svg>")
    return ("\n".join(L) + "\n").encode("utf-8")


# =============================================================== igr-dl/1 writer (design 31)
def mpx(v):
    return div_round(v, 1000)


def render_dl(m, st, labels=True, edge_labels=True, max_label_units=1048576):
    hn, he, sel, foc, vn, ve = st_sets(m, st)
    vp = st["viewport"]
    geo, S = edge_geometry(m, st, ve)
    nd, ed = len(vn), len(ve)
    pid_n = {i: k + 1 for k, i in enumerate(vn)}
    pid_e = {ei: nd + k + 1 for k, ei in enumerate(ve)}
    recs = [["H", "igr-dl/1", vp["width"], vp["height"], 1 if m.directed else 0, m.artifact, m.scene_sha, m.layout_sha, nd, ed]]
    for i in vn:
        recs.append(["n", m.nodes[i]["ref"]])
    for ei in ve:
        recs.append(["e", m.edges[ei]["ref"]])
    for ei in ve:
        form, pts, anc = geo[ei]
        flags = (1 if ("e", ei) in sel else 0) + (2 if ("e", ei) == foc else 0)
        nums = []
        for x, y in pts:
            nums += [mpx(x), mpx(y)]
        recs.append(["E", pid_e[ei], flags, form] + nums)
        if m.directed:
            tx, ty = nums[-2], nums[-1]
            if form == 0:
                px, py = nums[0], nums[1]
            elif form == 1:
                px, py = nums[2], nums[3]
            else:
                px, py = nums[4], nums[5]
            dx, dy = tx - px, ty - py
            if dx == 0 and dy == 0:
                dx, dy = 1, 0
            lam = isqrt(dx * dx + dy * dy)
            bcx, bcy = tx - div_round(dx * 10000, lam), ty - div_round(dy * 10000, lam)
            b1 = (bcx + div_round(-dy * 5000, lam), bcy + div_round(dx * 5000, lam))
            b2 = (bcx + div_round(dy * 5000, lam), bcy + div_round(-dx * 5000, lam))
            recs.append(["A", pid_e[ei], tx, ty, b1[0], b1[1], b2[0], b2[1]])
    for i in vn:
        el = ("n", i)
        flags = (1 if el in sel else 0) + (2 if el == foc else 0)
        c = m.categories.index(m.nodes[i]["category"])
        X, Y = S[i]
        recs.append(["N", pid_n[i], min(c, 8), flags, mpx(X), mpx(Y)])
    if labels:
        total = 0
        stopped = False
        cand = [("n", i) for i in vn] + ([("e", i) for i in ve] if edge_labels else [])
        for el in cand:
            s = m.nodes[el[1]]["label"] if el[0] == "n" else m.edges[el[1]]["label"]
            d = drawn_label(s)
            if d == "":
                continue
            if stopped or total + u16len(d) > max_label_units:
                stopped = True
                continue
            total += u16len(d)
            if el[0] == "n":
                X, Y = S[el[1]]
                recs.append(["T", pid_n[el[1]], 0, mpx(X), mpx(Y + 24 * 10 ** 6), d])
            else:
                anc = geo[el[1]][2]
                recs.append(["T", pid_e[el[1]], 1, mpx(anc[0]), mpx(anc[1] - 4 * 10 ** 6), d])
    # T records: all role 0 ascending pid then role 1 ascending pid (already in that order)
    return "".join(cj(r) + "\n" for r in recs).encode("utf-8")


# =============================================================== PNG
PNG_SIG = b"\x89PNG\r\n\x1a\n"


def png_chunk(typ, data):
    return struct.pack(">I", len(data)) + typ + data + struct.pack(">I", zlib.crc32(typ + data) & 0xFFFFFFFF)


def make_png_fixture():
    ihdr = struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0)
    idat = zlib.compress(b"\x00\x00\x00\x00\x00", 9)
    return PNG_SIG + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", idat) + png_chunk(b"IEND", b"")


def parse_png(b):
    E = "INVALID_EXPORT"
    if not M("K67") and b[:8] != PNG_SIG:
        raise IaErr(E, "PNG_MALFORMED")
    pos = 8 if not M("K67") else 8
    chunks = []
    while pos < len(b):
        if pos + 12 > len(b):
            raise IaErr(E, "PNG_MALFORMED")
        ln = struct.unpack(">I", b[pos:pos + 4])[0]
        typ = b[pos + 4:pos + 8]
        if pos + 12 + ln > len(b):
            raise IaErr(E, "PNG_MALFORMED")
        chunks.append((pos, typ, b[pos + 8:pos + 8 + ln], ln))
        pos += 12 + ln
    if pos != len(b) or not chunks:
        raise IaErr(E, "PNG_MALFORMED")
    if not M("K119"):
        if chunks[0][1] != b"IHDR" or chunks[0][3] != 13:
            raise IaErr(E, "PNG_MALFORMED")
    if chunks[-1][1] != b"IEND":
        raise IaErr(E, "PNG_MALFORMED")
    return chunks


KEYWORD = b"igr-export"


def _is_binding(c):
    return c[1] == b"tEXt" and c[2].startswith(KEYWORD + b"\x00")


HEX64 = re.compile(r"^[0-9a-f]{64}$")


def embed_binding(png, binding):
    E = "INVALID_EXPORT"
    if not isinstance(binding, dict) or set(binding.keys()) != {"scene", "layout", "state"}:
        raise IaErr(E, "SCHEMA")
    for k in ("scene", "layout", "state"):
        if not isinstance(binding[k], str) or not HEX64.match(binding[k]):
            raise IaErr(E, "SCHEMA")
    chunks = parse_png(png)
    if any(_is_binding(c) for c in chunks) and not M("K66"):
        raise IaErr(E, "PNG_ALREADY_BOUND")
    text = ("igr-export/1 %s %s %s" % (binding["scene"], binding["layout"], binding["state"])).encode("ascii")
    sep = b"" if M("K64") else b"\x00"
    data = KEYWORD + sep + text
    typ = b"tEXt"
    crc = zlib.crc32(data) if M("K63") else zlib.crc32(typ + data)
    ch = struct.pack(">I", len(data)) + typ + data + struct.pack(">I", crc & 0xFFFFFFFF)
    if M("K65"):
        return png[:-12] + ch + png[-12:]
    return png[:33] + ch + png[33:]


def read_binding(png):
    E = "INVALID_EXPORT"
    chunks = parse_png(png)
    bs = [c for c in chunks if _is_binding(c)]
    if not bs:
        return None
    if len(bs) > 1:
        raise IaErr(E, "PNG_MALFORMED")
    txt = bs[0][2][len(KEYWORD) + 1:]
    try:
        s = txt.decode("ascii")
    except Exception:
        raise IaErr(E, "PNG_MALFORMED")
    mt = re.match(r"^igr-export/1 ([0-9a-f]{64}) ([0-9a-f]{64}) ([0-9a-f]{64})$", s)
    if not mt:
        raise IaErr(E, "PNG_MALFORMED")
    return {"scene": mt.group(1), "layout": mt.group(2), "state": mt.group(3)}


def png_size(png):
    return struct.unpack(">II", png[16:24])


# =============================================================== export manifest
MEDIA = {"layout": "application/octet-stream", "png": "image/png", "scene": "application/octet-stream",
         "state": "application/octet-stream", "svg": "image/svg+xml"}
LIMITS = {"maxArtifactBytes": 268435456, "maxPngBytes": 67108864, "maxManifestBytes": 1048576}


def svg_export_bytes(m, st):
    b = render_svg(m, st, xml_decl=not M("K71"))
    return b


def export_bundle(m, st, layout_bytes, svg=True, png=None, expected_png_size=None):
    E = "INVALID_EXPORT"
    if sha(layout_bytes) != m.layout_sha:
        raise IaErr(E, "BINDING_MISMATCH")
    sb = state_bytes(st)
    files = {"scene": m.scene_bytes, "layout": layout_bytes, "state": sb}
    if svg:
        files["svg"] = svg_export_bytes(m, st)
    if png is not None:
        if len(png) > LIMITS["maxPngBytes"]:
            raise IaErr("RESOURCE_LIMIT", "BYTES_LIMIT")
        bound = embed_binding(png, {"scene": m.scene_sha, "layout": m.layout_sha, "state": sha(sb)})
        if expected_png_size is not None and not M("K110"):
            w, h = png_size(png)
            if (w, h) != (expected_png_size["width"], expected_png_size["height"]):
                raise IaErr(E, "PNG_SIZE_MISMATCH")
        files["png"] = bound
    order = ["scene", "layout", "state", "svg", "png"] if M("K68") else ["layout", "png", "scene", "state", "svg"]
    arts = [{"bytes": len(files[n]), "media_type": MEDIA[n], "name": n, "sha256": sha(files[n])} for n in order if n in files]
    man = {"artifacts": arts, "export": "igr-export/1", "igr": "IGR/1", "layout_sha256": m.layout_sha,
           "scene_sha256": m.scene_sha, "source_sha256": m.artifact, "state_sha256": sha(sb)}
    if "svg" in files and not M("K109"):
        man["svg_format"] = "igr-svg/1"
    if M("K69"):
        man["producer"] = "x"
    return files, man, cjb(man)


def _scan_depth(b):
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


def parse_manifest(b):
    E = "INVALID_EXPORT"
    try:
        v = json.loads(b.decode("utf-8"))
    except Exception:
        raise IaErr(E, "SCHEMA")
    if not isinstance(v, dict):
        raise IaErr(E, "SCHEMA")
    need = {"artifacts", "export", "igr", "layout_sha256", "scene_sha256", "source_sha256", "state_sha256"}
    ks = set(v.keys())
    if not (need <= ks <= need | {"svg_format"}):
        raise IaErr(E, "SCHEMA")
    if v["export"] != "igr-export/1" or v["igr"] != "IGR/1":
        raise IaErr(E, "SCHEMA")
    for k in ("layout_sha256", "scene_sha256", "source_sha256", "state_sha256"):
        if not (isinstance(v[k], str) and HEX64.match(v[k])):
            raise IaErr(E, "SCHEMA")
    arts = v["artifacts"]
    if not isinstance(arts, list):
        raise IaErr(E, "SCHEMA")
    names = []
    for a in arts:
        if not isinstance(a, dict) or set(a.keys()) != {"bytes", "media_type", "name", "sha256"}:
            raise IaErr(E, "SCHEMA")
        if not isinstance(a["name"], str):
            raise IaErr(E, "SCHEMA")
        if a["name"] not in MEDIA:
            raise IaErr(E, "UNKNOWN_ARTIFACT")
        if a["media_type"] != MEDIA[a["name"]]:
            raise IaErr(E, "SCHEMA")
        if not (isinstance(a["bytes"], int) and not isinstance(a["bytes"], bool) and 0 <= a["bytes"] <= 2 ** 53 - 1):
            raise IaErr(E, "SCHEMA")
        if not (isinstance(a["sha256"], str) and HEX64.match(a["sha256"])):
            raise IaErr(E, "SCHEMA")
        names.append(a["name"])
    if names != sorted(set(names)) and not M("K68"):
        raise IaErr(E, "SCHEMA")
    for need_n in ("scene", "layout", "state"):
        if need_n not in names:
            raise IaErr(E, "SCHEMA")
    if "svg_format" in v and not isinstance(v["svg_format"], str):
        raise IaErr(E, "SCHEMA")
    if ("svg_format" in v) != ("svg" in names) and not M("K109"):
        raise IaErr(E, "SCHEMA")
    if cjb(v) != b and not M("K113"):
        raise IaErr(E, "NON_CANONICAL")
    return v


def parse_state_bytes(m, b):
    try:
        v = json.loads(b.decode("utf-8"))
    except Exception:
        raise IaErr("INVALID_STATE", "SCHEMA")
    if cjb(v) != b:
        raise IaErr("INVALID_STATE", "NON_CANONICAL")
    validate_state(m, v)
    return v


def verify_bundle(files, mbytes):
    E = "INVALID_EXPORT"
    if len(mbytes) > LIMITS["maxManifestBytes"] and not M("K111"):
        raise IaErr("RESOURCE_LIMIT", "BYTES_LIMIT")
    if _scan_depth(mbytes) > 6 and not M("K112"):
        raise IaErr(E, "SCHEMA")
    if M("K112") and _scan_depth(mbytes) > 6:
        raise RecursionError("unscanned parser")
    man = parse_manifest(mbytes)
    listed = [a["name"] for a in man["artifacts"]]
    for a in man["artifacts"]:
        n = a["name"]
        if n not in files:
            if M("K114"):
                continue
            raise IaErr(E, "ARTIFACT_MISMATCH")
        b = files[n]
        if len(b) > LIMITS["maxArtifactBytes"]:
            raise IaErr("RESOURCE_LIMIT", "BYTES_LIMIT")
        if (len(b) != a["bytes"] and not M("K117")) or (sha(b) != a["sha256"] and not M("K116")):
            raise IaErr(E, "ARTIFACT_MISMATCH")
    if not M("K115"):
        for n in files:
            if n not in listed:
                raise IaErr(E, "UNKNOWN_ARTIFACT")
    m = build_model(files["scene"], files["layout"])
    if not M("K70"):
        if m.layout_sha != man["layout_sha256"]:
            raise IaErr(E, "BINDING_MISMATCH")
    if m.scene_sha != man["scene_sha256"] or m.artifact != man["source_sha256"]:
        raise IaErr(E, "BINDING_MISMATCH")
    st = parse_state_bytes(m, files["state"])
    if sha(files["state"]) != man["state_sha256"] and not M("K118"):
        raise IaErr(E, "STATE_MISMATCH")
    if "svg" in listed:
        if man.get("svg_format") != "igr-svg/1" and not M("K127"):
            raise IaErr(E, "UNKNOWN_FORMAT")
        if render_svg(m, st, xml_decl=True) != files["svg"]:
            raise IaErr(E, "SVG_NOT_REPRODUCIBLE")
    if "png" in listed:
        parse_png(files["png"])
        bd = read_binding(files["png"])
        want = {"scene": man["scene_sha256"], "layout": man["layout_sha256"], "state": man["state_sha256"]}
        if bd != want and not M("K120"):
            raise IaErr(E, "BINDING_MISMATCH")
    return man


# =============================================================== composed manifests (13.1)
MANDATORY = ["scene.load", "viewport", "hit-test", "selection", "focus", "visibility", "labels", "direction-cue",
             "indicators.non-color", "a11y.model", "state.report", "lifecycle"]
OPTIONAL = ["export.scene", "export.svg", "export.png", "a11y.native-dom", "a11y.companion-dom", "labels.edge", "motion.animated"]
VISUAL = ["labels", "direction-cue", "indicators.non-color"]
DEGR = {"labels": ["LABELS_ELIDED"], "direction-cue": ["EDGE_STYLE_SIMPLIFIED"], "labels.edge": ["EDGE_LABELS_OMITTED"]}
XIA = ["x-ia.input", "x-ia.keyboard-nav", "x-ia.lasso", "x-ia.companion", "x-ia.export-svg", "x-ia.export-png", "x-ia.headless"]


def verify_manifest(v):
    X = "INVALID_MANIFEST"
    if not isinstance(v, dict) or set(v.keys()) != {"igr", "renderer", "capabilities", "capacity"}:
        raise IaErr(X, "SCHEMA")
    if v["igr"] != "IGR/1":
        raise IaErr(X, "UNSUPPORTED_VERSION")
    r = v["renderer"]
    if not isinstance(r, dict) or r.get("host") not in ("dom", "headless"):
        raise IaErr(X, "SCHEMA")
    if not (isinstance(r.get("name"), str) and re.match(r"^[a-z][a-z0-9._-]*$", r["name"])
            and isinstance(r.get("version"), str) and re.match(r"^[0-9A-Za-z._+-]+$", r["version"])):
        raise IaErr(X, "INVALID_NAME")
    cap = v["capacity"]
    if not isinstance(cap, dict) or set(cap.keys()) != {"maxNodes", "maxEdges", "maxDrawnLabelUnits"}:
        raise IaErr(X, "SCHEMA")
    for k in cap:
        if isinstance(cap[k], bool) or not isinstance(cap[k], (int, float)):
            raise IaErr(X, "SCHEMA")
        if not (isinstance(cap[k], int) and 1 <= cap[k] <= 2 ** 53 - 1):
            raise IaErr(X, "INVALID_LIMITS")
    caps = v["capabilities"]
    if not isinstance(caps, dict):
        raise IaErr(X, "SCHEMA")
    allc = MANDATORY + OPTIONAL + ["scene.apply-delta"]
    for c in allc:
        if c not in caps:
            raise IaErr(X, "MISSING_CAPABILITY")
    for c in caps:
        if c not in allc and not re.match(r"^x-[a-z0-9][a-z0-9._-]*$", c):
            raise IaErr(X, "UNKNOWN_CAPABILITY")
    for c in sorted(caps.keys()):
        s = caps[c]
        if not isinstance(s, dict) or s.get("status") not in ("supported", "degraded", "unsupported"):
            raise IaErr(X, "SCHEMA")
        if s["status"] == "supported" and set(s.keys()) != {"status"}:
            raise IaErr(X, "SCHEMA")
        if s["status"] == "degraded":
            if set(s.keys()) != {"status", "degradations"} or not isinstance(s["degradations"], list) or not s["degradations"]:
                raise IaErr(X, "SCHEMA")
            for d in s["degradations"]:
                if d not in ("LABELS_ELIDED", "EDGE_LABELS_OMITTED", "EDGE_STYLE_SIMPLIFIED"):
                    raise IaErr(X, "UNKNOWN_DEGRADATION")
            if s["degradations"] != sorted(set(s["degradations"])):
                raise IaErr(X, "SCHEMA")
        if s["status"] == "unsupported":
            if set(s.keys()) != {"status", "reason"} or s["reason"] not in ("RESERVED", "NOT_IMPLEMENTED", "HOST_LACKS"):
                raise IaErr(X, "SCHEMA")
        if c == "scene.apply-delta":
            if s != {"status": "unsupported", "reason": "RESERVED"}:
                raise IaErr(X, "RESERVED_CAPABILITY")
            continue
        if s["status"] == "unsupported" and s["reason"] == "RESERVED":
            raise IaErr(X, "RESERVED_CAPABILITY")
        if c.startswith("x-"):
            continue
        if s["status"] == "unsupported" and s["reason"] == "HOST_LACKS" and not (r["host"] == "headless" and c in VISUAL):
            raise IaErr(X, "HOST_LACKS_NOT_ALLOWED")
        if c in MANDATORY:
            if c in ("labels", "direction-cue"):
                pass
            elif s["status"] == "unsupported":
                if not (c in VISUAL and s["reason"] == "HOST_LACKS"):
                    raise IaErr(X, "MANDATORY_UNSUPPORTED")
            elif s["status"] == "degraded":
                raise IaErr(X, "MANDATORY_DEGRADED")
        if s["status"] == "degraded":
            if c not in DEGR or any(d not in DEGR[c] for d in s["degradations"]):
                raise IaErr(X, "DEGRADATION_NOT_ALLOWED")
    return v


def author_base(host):
    caps = {}
    for c in MANDATORY:
        caps[c] = {"status": "supported"}
    caps["labels"] = {"degradations": ["LABELS_ELIDED"], "status": "degraded"}
    for c in OPTIONAL:
        caps[c] = {"reason": "NOT_IMPLEMENTED", "status": "unsupported"}
    caps["scene.apply-delta"] = {"reason": "RESERVED", "status": "unsupported"}
    if host == "headless":
        for c in VISUAL:
            caps[c] = {"reason": "HOST_LACKS", "status": "unsupported"}
    return {"capabilities": caps, "capacity": {"maxDrawnLabelUnits": 1048576, "maxEdges": 40000, "maxNodes": 20000},
            "igr": "IGR/1", "renderer": {"host": host, "name": "ia-oracle-base", "version": "0.0.0"}}


def compose_manifest(base, flags):
    base = verify_manifest(copy_json(base))
    if not isinstance(flags, dict):
        raise IaErr("INVALID_CONFIG", "SCHEMA")
    allowed = ["input", "keyboard-nav", "lasso", "companion", "export-svg", "export-png", "headless"]
    for k in flags:
        if k not in allowed:
            raise IaErr("INVALID_CONFIG", "SCHEMA")
        if not isinstance(flags[k], bool):
            raise IaErr("INVALID_CONFIG", "SCHEMA")
    if flags.get("companion") and base["renderer"]["host"] == "headless":
        raise IaErr("INVALID_CONFIG", "INVALID_VALUE")
    out = copy_json(base)
    for k in allowed:
        cid = "x-ia." + k
        out["capabilities"][cid] = {"status": "supported"} if flags.get(k) else {"reason": "NOT_IMPLEMENTED", "status": "unsupported"}
    if flags.get("companion") and not M("K82"):
        out["capabilities"]["a11y.companion-dom"] = {"status": "supported"}
    if flags.get("companion") and M("K83"):
        out["capabilities"]["a11y.native-dom"] = {"status": "supported"}
    verify_manifest(copy_json(out))
    return out


def copy_json(v):
    return json.loads(json.dumps(v))


# =============================================================== headless (12)
OUTPUTS = ["state", "svg", "display-list", "canvas-stream", "readout", "tree"]


def reduce_min(m, st, intent):
    I = "INVALID_INTENT"
    if not isinstance(intent, dict):
        raise IaErr(I, "SCHEMA")
    if "type" not in intent:
        raise IaErr(I, "SCHEMA")
    if intent["type"] == "select":
        if set(intent.keys()) != {"type", "mode", "targets"}:
            raise IaErr(I, "SCHEMA")
        if intent["mode"] not in ("replace", "add", "remove", "toggle"):
            raise IaErr(I, "INVALID_VALUE")
        if not isinstance(intent["targets"], list):
            raise IaErr(I, "SCHEMA")
        for t in intent["targets"]:
            if not (isinstance(t, dict) and len(t) == 1 and list(t.keys())[0] in ("node", "edge") and isinstance(list(t.values())[0], dict)):
                raise IaErr(I, "SCHEMA")
        for t in intent["targets"]:
            if lookup_eaddr(m, t) is None:
                raise IaErr(I, "UNRESOLVED_ELEMENT")
        raise NotImplementedError("reduce beyond resolution is not needed by any row")
    raise NotImplementedError


def render_headless(scene_bytes, layout_bytes, size=None, state_bytes_in=None, intents=None, outputs=None):
    I = "INVALID_INPUT"
    outputs = ["state", "svg"] if outputs is None else outputs
    seen = []
    for o in outputs:
        if o not in OUTPUTS or o in seen:
            raise IaErr(I, "SCHEMA")
        seen.append(o)
    m = build_model(scene_bytes, layout_bytes)
    if state_bytes_in is not None:
        st = parse_state_bytes(m, state_bytes_in)
        if size is not None and (size["width"], size["height"]) != (st["viewport"]["width"], st["viewport"]["height"]):
            raise IaErr(I, "INVALID_VALUE")
    else:
        sz = size or {"width": 900, "height": 600}
        st = mk_state(m, sz["width"], sz["height"])
    for it in intents or []:
        reduce_min(m, st, it)
    files = {}
    for o in outputs:
        if o == "state":
            files[o] = state_bytes(st)
        elif o == "svg":
            files[o] = render_svg(m, st)
        elif o == "display-list":
            files[o] = render_dl(m, st)
        elif o == "tree":
            files[o] = tree_bytes(build_tree(m, st, {"events": []}))
        else:
            raise NotImplementedError(o)
    return files
