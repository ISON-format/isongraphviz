"""Group R2: inputs taken from REAL layouts, the N (node) and T (label) records of oracles-dl `dl/*.dl` files.

The sources are the PRE-LP/1 versions of those files (the label positions of the current `oracles-dl/dl` files are
already placed by LP/1, so they are not default positions). They were extracted once, read-only, from the repository
history (`git show HEAD:fixtures/oracles-dl/dl/<name>.dl`, bytes unchanged) and are kept in this corpus under
`sources/`. Each is pinned by SHA-256; a mismatch stops the generator (re-pin only after reading the change). The
corpus is therefore self-contained: regenerating it needs nothing outside `fixtures/oracles-lp/`.

Record formats (milli-pixels): ["N", id, role, flags, cx, cy]; ["T", id, role, x, y, text] with role 0 = node label
(default position cx, cy + 24 px) and role 1 = edge label (default position ax, ay - 4 px). Micro-pixels = milli-pixels * 1000;
units = the length of the text in UTF-16 units; node labels first, then edge labels (the file order).
"""
import hashlib
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DL_DIR = os.path.normpath(os.path.join(HERE, "..", "sources"))

PINS = {
    "G01": "62e9d45ed682602b4b4dae6503a92029566fb0cabf6e73f8a9a50893fcff4ebd",
    "G02": "df97fef0ccf331cb13e10eff773275a73f1d7d40723c429d57ab585ba0cd8a89",
    "G05": "fb7a0a3d5c5ed1fc4b63769427267d9d18371b4f949031b33e21b981ba92fb1d",
    "G07": "32208bb6519fdc5cfcde67cd6cf10758d5a9fa8d5e3f8171aeebcc0b684e808d",
    "G08": "e637658e0fe4d5cfe94eb536612d80c8a87561dd9f2fa2fc2f05d0c1a6d99140",
    "G09": "03e58c5efd0768587e1c070009699b85b7efdbe44aafe57f55edb373ea518359",
    "G11": "3f9f43587a97bdb7adbbe1465a677ae5c378f621cbffe51a0f821e09db0bf557",
    "N03": "b2603cb05eb13fa2e38689c3abbc66a14c4d17eb1e0bbad7f310a15d8099d2f0",
    "N09": "9c9e5df8543d31fc9ce472777ed4c65668ea82ace5e32eb101ef4a28b5293d6d",
    "N10": "67ead3fc67daa357fc4320922b26ff9be64e82b7df81d9e250ded76258bf95bf",
    "N17": "ba8535f32c6b5539e64e4d6c7e5a2cf7f33deda0dbbe366e8800ed2f8baa3fe4",
    "X08": "bc6912a8df1de1a2ebb0605cfda2a5352d61ee5c84189659c6e0d448dcdfd4d8",
    "X10": "338b22ac556ff0c0068ff48669109e9532335157675f71464a946c82245f841f",
    "X11": "fb4e48d44b4ac4b38a9a04a0e769ca81d19fdb2d8d8db973459153590eddefd8",
    "F04": "220b5e766101b90727689a705d2697a3160346269c338272ee31fa59cc82a4ed",
    "S58": "1dfd99ce4ff515b44f59e23b0a182a917c5038da6a8e98a6281ca78a035f15bb",
}

# (row id, source file, divisor): divisor > 1 scales the layout down (denser), recomputing the default positions
SELECT = [
    ("R2-G01", "G01", 1), ("R2-G02", "G02", 1), ("R2-G05", "G05", 1), ("R2-G07", "G07", 1), ("R2-G08", "G08", 1),
    ("R2-G09", "G09", 1), ("R2-G11", "G11", 1), ("R2-N03", "N03", 1), ("R2-N09", "N09", 1), ("R2-N10", "N10", 1),
    ("R2-N17", "N17", 1), ("R2-X08", "X08", 1), ("R2-X10", "X10", 1), ("R2-X11", "X11", 1), ("R2-F04", "F04", 1),
    ("R2-S58", "S58", 1),
    ("R2-G05h", "G05", 2), ("R2-G05t", "G05", 3), ("R2-N17h", "N17", 2), ("R2-F04h", "F04", 2),
]


def load(name):
    path = os.path.join(DL_DIR, name + ".dl")
    data = open(path, "rb").read()
    got = hashlib.sha256(data).hexdigest()
    if got != PINS[name]:
        raise SystemExit("GATE FAILED: sources/%s.dl digest %s != pinned %s (read the change, then re-pin)" % (name, got, PINS[name]))
    nodes, nlab, elab = [], [], []
    for ln in data.decode("utf-8").split(chr(10)):
        if not ln:
            continue
        r = json.loads(ln)
        if r[0] == "N":
            nodes.append((r[4] * 1000, r[5] * 1000))
        elif r[0] == "T":
            units = len(r[5].encode("utf-16-le")) // 2
            assert units >= 1
            item = (r[2], units, r[3] * 1000, r[4] * 1000)
            (nlab if r[2] == 0 else elab).append(item)
    assert len(nlab) == len(nodes), name
    for (role, u, x, y), (cx, cy) in zip(nlab, nodes):
        assert (x, y) == (cx, cy + 24 * 1000000), (name, "node label is not at its default position")
    return nodes, [("node", u, x, y) for (_r, u, x, y) in nlab] + [("edge", u, x, y) for (_r, u, x, y) in elab]


def scaled(nodes, labels, k):
    if k == 1:
        return nodes, labels
    PX = 1000000
    n2 = [(cx // k, cy // k) for cx, cy in nodes]
    out = []
    ni = 0
    for kind, u, x, y in labels:
        if kind == "node":
            out.append(("node", u, n2[ni][0], n2[ni][1] + 24 * PX))
            ni += 1
        else:
            ay = y + 4 * PX
            out.append(("edge", u, x // k, ay // k - 4 * PX))
    return n2, out


def rows():
    seen = {}
    out = []
    for rid, name, k in SELECT:
        nodes, labels = load(name)
        nodes, labels = scaled(nodes, labels, k)
        key = (tuple(nodes), tuple(labels))
        if key in seen:
            continue                        # identical inputs: one row only
        seen[key] = rid
        note = "real layout: node (N) and label (T) records of oracles-dl dl/%s.dl%s (milli-px x 1000; %d nodes, %d labels, max units %d)" % (
            name, "" if k == 1 else ", scaled down by %d (default positions recomputed)" % k, len(nodes), len(labels), max(l[1] for l in labels))
        out.append((rid, note, nodes, labels, name))
    return out
