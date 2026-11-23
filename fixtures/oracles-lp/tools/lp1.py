"""LP/1 rev 1 reference (design 37 rev 1, 11 candidates, fallback (0,0)): kept ONLY to measure rev 1 in OVERLAP.tsv; SUPERSEDED by lp.py (rev 2).

Pure, slow, obviously correct. Integers only (micro-pixels; 1 px = 1,000,000).
Standard library only.

    place_labels(nodes, labels) -> [(dx, dy), ...]            (whole pixels)
    place_labels_idx(nodes, labels) -> [(idx, dx, dy), ...]   idx = 1..11 candidate number, 0 = fallback

nodes:  list of (cx, cy)                       micro-pixels
labels: list of (kind, units, x, y)            kind "node" | "edge"; x, y micro-pixels (default position)
"""
PX = 1000000

# section 5: candidates relative to the default position, in pixels, in order
def half_h(u):
    """ceil(7u / 2) whole pixels (design 37 rev 1, section 5)."""
    return (7 * u + 1) // 2


def node_candidates(u):
    h = half_h(u) + 14
    return [(0, 0), (0, -41), (h, -20), (-h, -20), (0, 14), (0, -55),
            (h, -34), (-h, -34), (h, -6), (-h, -6), (0, 28)]


def edge_candidates(u):
    h = half_h(u) + 10
    return [(0, 0), (0, -14), (0, 18), (h, 0), (-h, 0), (0, -28),
            (0, 32), (h, -14), (-h, -14), (h, 18), (-h, 18)]


# section 4: a box is (left, top, right, bottom), all micro-pixels
def label_box(x, y, u):
    hw = 3500000 * u                    # half width 3.5u px, an integer number of micro-pixels
    return (x - hw, y - 10 * PX, x + hw, y + 3 * PX)


def node_box(cx, cy):
    return (cx - 13 * PX, cy - 13 * PX, cx + 13 * PX, cy + 13 * PX)


def collide(a, b):
    """Section 4: at least 1 px apart on some axis, else they collide."""
    return (a[0] < b[2] + PX and b[0] < a[2] + PX and
            a[1] < b[3] + PX and b[1] < a[3] + PX)


def place_labels_idx(nodes, labels):
    obstacles = [node_box(cx, cy) for (cx, cy) in nodes]
    out = []
    for (kind, u, x, y) in labels:
        cands = node_candidates(u) if kind == "node" else edge_candidates(u)
        chosen = None
        for i, (dx, dy) in enumerate(cands):
            box = label_box(x + dx * PX, y + dy * PX, u)
            if not any(collide(box, o) for o in obstacles):
                chosen = (i + 1, dx, dy)
                break
        if chosen is None:
            chosen = (0, 0, 0)          # section 6: fallback is the default position
        out.append(chosen)
        obstacles.append(label_box(x + chosen[1] * PX, y + chosen[2] * PX, u))
    return out


def place_labels(nodes, labels):
    return [(dx, dy) for (_i, dx, dy) in place_labels_idx(nodes, labels)]


def parse_input(obj):
    """JSON object (coordinates are decimal strings) -> (nodes, labels)."""
    nodes = [(int(n["cx"]), int(n["cy"])) for n in obj["nodes"]]
    labels = [(l["kind"], int(l["units"]), int(l["x"]), int(l["y"])) for l in obj["labels"]]
    return nodes, labels


def to_input(nodes, labels):
    return {"nodes": [{"cx": str(cx), "cy": str(cy)} for (cx, cy) in nodes],
            "labels": [{"kind": k, "units": u, "x": str(x), "y": str(y)} for (k, u, x, y) in labels]}
