"""LP/1 grid implementation per design 37 rev 2 section 7 (cells of 64 px, integer floor of the edges).

An independent second implementation. It must agree with lp.py on every row and on random inputs.

Reading of section 7 (see AMBIGUITIES.md, A-17 and A-28): a box is stored in every cell its closed extent
[floor(left/C) .. floor(right/C)] x [floor(top/C) .. floor(bottom/C)] touches, and a candidate is tested against
the boxes of the cells that the candidate box *grown by 1 px on every side* touches. The growth is necessary (the
1 px gap makes two boxes less than 1 px apart collide although they touch no common cell) and rev 1 of the design
requires it. Rev 1 also allows skipping the storage of a box whose exact edges are already stored (flag "dedupe").

Rev 2, the fallback cost: when no candidate is free (the early-exit queries `colliding(..., first_only=True)` found a
collision for all 29 candidates), each candidate is queried once more WITHOUT early exit: the exact collision test is
run on every box stored in the cells touched by the candidate box grown by 1 px, and the colliding boxes are
collected in a SET of their edge tuples (left, top, right, bottom). Identical boxes therefore count once, whatever
the number of stored copies and the number of cells; the cost is the size of the set; the first minimum wins.
The cost is computed only in the (rare) fallback case.

`flags` (a dict) injects grid faults for the mutant table; the empty dict is the correct grid.
"""
from lp import PX, node_candidates, edge_candidates, label_box, node_box, collide

CELL = 64 * PX


def _idx(v, cell, trunc, absval=False):
    if absval:                     # sign lost (fault)
        return abs(v) // cell
    if trunc:                      # truncation toward zero (fault)
        q = abs(v) // cell
        return -q if v < 0 else q
    return v // cell               # Python floor division is the integer floor


class Grid:
    def __init__(self, flags):
        self.f = flags
        self.cell = flags.get("cell", CELL)
        self.cells = {}
        self.boxes = []
        self.seen_boxes = set()

    def _range(self, l, t, r, b):
        c = self.cell
        tr = self.f.get("trunc", False)
        ab = self.f.get("abs", False)
        tl = self.f.get("trunc_lo", False) or tr      # left/top edges truncated, right/bottom floored (fault)
        x0, x1 = _idx(l, c, tl, ab), _idx(r, c, tr, ab)
        y0, y1 = _idx(t, c, tl, ab), _idx(b, c, tr, ab)
        if self.f.get("excl_right", False):
            # right/bottom edge on a cell boundary is treated as belonging to the previous cell
            x1 = _idx(r - 1, c, tr)
            y1 = _idx(b - 1, c, tr)
        return x0, y0, x1, y1

    def add(self, box):
        if self.f.get("dedupe", False):
            if box in self.seen_boxes:
                return
            self.seen_boxes.add(box)
        i = len(self.boxes)
        self.boxes.append(box)
        x0, y0, x1, y1 = self._range(*box)
        if self.f.get("first_cell", False):
            x1, y1 = x0, y0
        cells = self.cells
        for cx in range(x0, x1 + 1):
            for cy in range(y0, y1 + 1):
                cells.setdefault((cx, cy), []).append(i)

    def colliding(self, box, first_only=False):
        """The distinct boxes (a set of edge tuples) of the grown query region that collide with `box`
        (exact test per box); with first_only, return as soon as one is found (a non-empty set)."""
        g = 0 if self.f.get("noinflate", False) else PX
        l, t, r, b = box
        x0, y0, x1, y1 = self._range(l - g, t - g, r + g, b + g)
        if self.f.get("query_first_cell", False):
            x1, y1 = x0, y0
        seen = set()
        found = set()
        count = 0
        cells = self.cells
        boxes = self.boxes
        for cx in range(x0, x1 + 1):
            for cy in range(y0, y1 + 1):
                lst = cells.get((cx, cy))
                if not lst:
                    continue
                for i in lst:
                    if not self.f.get("cost_cell", False):
                        if i in seen:
                            continue
                        seen.add(i)
                    if collide(box, boxes[i]):
                        if first_only:
                            return {boxes[i]}
                        found.add(boxes[i])
                        count += 1
        if self.f.get("cost_id", False) or self.f.get("cost_cell", False):
            return count                # fault: stored copies (or cell occurrences) counted instead of distinct boxes
        return found


def place_labels_idx(nodes, labels, flags=None):
    grid = Grid(flags or {})
    for (cx, cy) in nodes:
        grid.add(node_box(cx, cy))
    out = []
    for (kind, u, x, y) in labels:
        cands = node_candidates(u) if kind == "node" else edge_candidates(u)
        boxes = [label_box(x + dx * PX, y + dy * PX, u) for (dx, dy) in cands]
        chosen = None
        for i, box in enumerate(boxes):
            if not grid.colliding(box, True):
                chosen = (i + 1, cands[i][0], cands[i][1])
                break
        if chosen is None:
            best_i, best_cost = None, None
            for i, box in enumerate(boxes):
                c = grid.colliding(box)
                cost = c if isinstance(c, int) else len(c)
                if best_cost is None or cost < best_cost:
                    best_i, best_cost = i, cost
            chosen = (-(best_i + 1), cands[best_i][0], cands[best_i][1])
        out.append(chosen)
        grid.add(label_box(x + chosen[1] * PX, y + chosen[2] * PX, u))
    return out


def place_labels(nodes, labels, flags=None):
    return [(dx, dy) for (_i, dx, dy) in place_labels_idx(nodes, labels, flags)]
