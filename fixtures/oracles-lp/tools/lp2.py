"""LP/1 rev 2 reference (design 37 rev 2: width 7 px per unit, 29 candidates, min-cost fallback): kept ONLY to measure rev 2 in OVERLAP.tsv; SUPERSEDED by lp.py (rev 3).

Pure, slow, obviously correct. Integers only (micro-pixels; 1 px = 1,000,000).
Standard library only.

    place_labels(nodes, labels) -> [(dx, dy), ...]            (whole pixels)
    place_labels_idx(nodes, labels) -> [(idx, dx, dy), ...]
        idx = k (1..29) when candidate k is the first free one,
        idx = -k when no candidate is free and candidate k has the fewest colliding distinct boxes (fallback)

nodes:  list of (cx, cy)                       micro-pixels
labels: list of (kind, units, x, y)            kind "node" | "edge"; x, y micro-pixels (default position)
"""
PX = 1000000


def half_h(u):
    """ceil(7u / 2) whole pixels (design 37 section 5)."""
    return (7 * u + 1) // 2


# section 5: candidates relative to the default position, in pixels, in order (29 per kind)
def node_candidates(u):
    h = half_h(u) + 14
    c = [(0, 0), (0, -41), (h, -20), (-h, -20), (0, 14), (0, -55),
         (h, -34), (-h, -34), (h, -6), (-h, -6), (0, 28)]
    for d in (-69, 42, -83, 56, -97, 70):
        c += [(0, d), (h, d + 20), (-h, d + 20)]
    return c


def edge_candidates(u):
    h = half_h(u) + 10
    c = [(0, 0), (0, -14), (0, 18), (h, 0), (-h, 0), (0, -28),
         (0, 32), (h, -14), (-h, -14), (h, 18), (-h, 18)]
    for d in (-42, 46, -56, 60, -70, 74):
        c += [(0, d), (h, d), (-h, d)]
    return c


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
        boxes = [label_box(x + dx * PX, y + dy * PX, u) for (dx, dy) in cands]
        chosen = None
        for i, box in enumerate(boxes):
            if not any(collide(box, o) for o in obstacles):
                chosen = (i + 1, cands[i][0], cands[i][1])
                break
        if chosen is None:
            # section 6 (rev 2): no candidate is free; cost = number of DISTINCT boxes (equal edges count once)
            # among the node boxes and the placed label boxes that the candidate collides with; first minimum wins
            best_i, best_cost = None, None
            for i, box in enumerate(boxes):
                cost = len(set(o for o in obstacles if collide(box, o)))
                if best_cost is None or cost < best_cost:
                    best_i, best_cost = i, cost
            chosen = (-(best_i + 1), cands[best_i][0], cands[best_i][1])
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
