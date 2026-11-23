"""Mutant table (design 37 rev 3): reference faults (cfg of mut.py) and grid faults (flags of lpgrid.py)."""
from lp import PX
from mut import BASE_NODE, BASE_EDGE, build_lists

MUTANTS = []      # (id, description, kind, spec)


def add(desc, kind, spec):
    MUTANTS.append(("K%03d" % (len(MUTANTS) + 1), desc, kind, spec))


def cfg(desc, **kw):
    add(desc, "cfg", kw)


def grid(desc, **kw):
    add(desc, "grid", kw)


def build():
    del MUTANTS[:]
    # ---- collision rule
    cfg("gap 0 px instead of 1 px (boxes may touch)", gaps=(0, 0, 0, 0))
    cfg("gap 2 px instead of 1 px", gaps=(2 * PX,) * 4)
    cfg("non-strict inequality (<=) on all four tests with the 1 px gap (exactly 1 px apart collides)", nonstrict=(True,) * 4)
    cfg("non-strict only on the x tests", nonstrict=(True, True, False, False))
    cfg("non-strict only on the y tests", nonstrict=(False, False, True, True))
    cfg("gap 1 px on x only, 0 on y", gaps=(PX, PX, 0, 0))
    cfg("gap 1 px on y only, 0 on x", gaps=(0, 0, PX, PX))
    cfg("gap applied on one side of each pair only (asymmetric)", gaps=(PX, 0, PX, 0))
    cfg("gap measured as a Euclidean distance (corners)", euclid=True)
    for i, nm in enumerate(("a.left < b.right", "b.left < a.right", "a.top < b.bottom", "b.top < a.bottom")):
        ig = [False] * 4
        ig[i] = True
        cfg("collision test without the condition '%s'" % nm, ignore=tuple(ig))
    # ---- boxes
    cfg("label width 7 px per unit (the rev 2 value)", wpx2=7)
    cfg("label width 8 px per unit", wpx2=8)
    cfg("label width 10 px per unit", wpx2=10)
    cfg("label width 6 px per unit (the rev 0 value)", wpx2=6)
    cfg("label half width floored to whole pixels (floor(4.5u))", hw_round="floor")
    cfg("label half width rounded up to whole pixels (ceil(4.5u))", hw_round="ceil")
    cfg("label top = Y - 9 px (height 12)", top=-9)
    cfg("label top = Y - 11 px (height 14)", top=-11)
    cfg("label bottom = Y + 2 px (height 12)", bottom=2)
    cfg("label bottom = Y + 4 px (height 14)", bottom=4)
    cfg("node box half size 12 px (24 px square)", nhalf=12)
    cfg("node box half size 14 px (28 px square)", nhalf=14)
    cfg("node box half size 10 px (the disc only)", nhalf=10)
    # ---- candidate lists (29 per kind)
    for nm, base, key in (("node", BASE_NODE, "node_c"), ("edge", BASE_EDGE, "edge_c")):
        for i in range(28):
            l = list(base)
            l[i], l[i + 1] = l[i + 1], l[i]
            cfg("%s candidates %d and %d swapped" % (nm, i + 1, i + 2), **{key: l})
    for nm, key, base in (("node", "node_c", BASE_NODE), ("edge", "edge_c", BASE_EDGE)):
        for n in (11, 17, 28):
            cfg("%s candidate list truncated at %d (the last %d dropped)" % (nm, n, 29 - n), **{key: list(base[:n])})
    for nm, base, key in (("node", BASE_NODE, "node_c"), ("edge", BASE_EDGE, "edge_c")):
        for i in range(29):
            l = list(base)
            l[i] = (l[i][0], l[i][1] + 1)
            cfg("%s candidate %d: dy + 1" % (nm, i + 1), **{key: l})
        for i in range(29):
            l = list(base)
            dx = l[i][0]
            if isinstance(dx, str):
                dx = dx + ("+1" if not dx.startswith("-") else "-1")      # |dx| one larger
            else:
                dx = dx + 1
            l[i] = (dx, l[i][1])
            cfg("%s candidate %d: dx one off (|h|+1 or 0+1)" % (nm, i + 1), **{key: l})
    # the d order and the offset of the added candidates
    nd, ed = (-69, 42, -83, 56, -97, 70), (-42, 46, -56, 60, -70, 74)
    swap = lambda d, i: tuple(d[:i] + (d[i + 1], d[i]) + d[i + 2:])
    for i in (0, 2, 4):
        cfg("node d order with the pair %d,%d swapped (%s)" % (i + 1, i + 2, swap(nd, i)), node_c=build_lists(d_node=swap(nd, i))[0])
        cfg("edge d order with the pair %d,%d swapped (%s)" % (i + 1, i + 2, swap(ed, i)), edge_c=build_lists(d_edge=swap(ed, i))[1])
    cfg("node d order ascending (-97,-83,-69,42,56,70)", node_c=build_lists(d_node=(-97, -83, -69, 42, 56, 70))[0])
    cfg("edge d order ascending (-70,-56,-42,46,60,74)", edge_c=build_lists(d_edge=(-70, -56, -42, 46, 60, 74))[1])
    cfg("node d order by increasing |d| (42,-69,56,-83,70,-97)", node_c=build_lists(d_node=(42, -69, 56, -83, 70, -97))[0])
    cfg("edge d order with each pair reversed (46,-42,60,-56,74,-70)", edge_c=build_lists(d_edge=(46, -42, 60, -56, 74, -70))[1])
    cfg("node side candidates at d instead of d+20", node_c=build_lists(node_off=0)[0])
    cfg("edge side candidates at d+20 instead of d", edge_c=build_lists(edge_off=20)[1])
    cfg("node side candidates at d+19", node_c=build_lists(node_off=19)[0])
    cfg("node side candidates at d+21", node_c=build_lists(node_off=21)[0])
    cfg("added node candidates in the order (0,d), (-h,d+20), (h,d+20)", node_c=build_lists(triple=("c", "-h", "+h"))[0])
    cfg("added edge candidates in the order (h,d), (-h,d), (0,d)", edge_c=build_lists(triple=("+h", "-h", "c"))[1])
    # ---- h
    cfg("node h = ceil(9u/2) + 13", node_h=13)
    cfg("node h = ceil(9u/2) + 15", node_h=15)
    cfg("edge h = ceil(9u/2) + 9", edge_h=9)
    cfg("edge h = ceil(9u/2) + 11", edge_h=11)
    cfg("node h uses the edge offset (ceil(9u/2) + 10)", node_h=10)
    cfg("edge h uses the node offset (ceil(9u/2) + 14)", edge_h=14)
    cfg("node h with floor(9u/2) instead of ceil (rounding down)", node_hmode="floor")
    cfg("edge h with floor(9u/2) instead of ceil (rounding down)", edge_hmode="floor")
    cfg("node and edge h with floor(9u/2)", node_hmode="floor", edge_hmode="floor")
    cfg("node h = ceil(7u/2) + 14 (the rev 2 formula)", node_hmode="7/2")
    cfg("edge h = ceil(7u/2) + 10 (the rev 2 formula)", edge_hmode="7/2")
    cfg("node h = 4u + 14", node_hmode="4u")
    cfg("edge h = 5u + 10", edge_hmode="5u")
    cfg("edge h = 9u + 10 (full width instead of half)", edge_hmode="9u")
    # ---- fallback (rev 2)
    cfg("fallback is the default position (0,0) (the rev 1 rule)", fallback="default")
    cfg("fallback is the last candidate (29)", fallback="last")
    cfg("fallback is candidate 2", fallback="second")
    cfg("fallback is the LAST minimum on ties instead of the first", fallback="min_last")
    cfg("cost counts colliding boxes, not DISTINCT boxes (identical boxes counted once each)", fallback="min_nodistinct")
    cfg("cost ignores the placed label boxes (node boxes only)", fallback="min_nodes")
    cfg("cost ignores the node boxes (placed label boxes only)", fallback="min_labels")
    cfg("cost counts collisions with a gap of 0 instead of 1 px", fallback="min_gap0")
    cfg("fallback minimum searched among the first 11 candidates only", fallback="min_first11")
    # ---- who sees whom
    cfg("node labels do not see nodes", node_sees_nodes=False)
    cfg("node labels do not see earlier labels", node_sees_labels=False)
    cfg("node labels ignore the node of the same ordinal (own node)", node_sees_own=False)
    cfg("edge labels do not see node boxes", edge_sees_nodes=False)
    cfg("edge labels do not see node labels", edge_sees_node_labels=False)
    cfg("edge labels do not see earlier edge labels", edge_sees_edge_labels=False)
    # ---- order and bookkeeping
    cfg("edge labels processed before node labels (results in input order)", order="edge_first")
    cfg("labels processed in reverse order", order="reverse")
    cfg("placed box recorded at the default position instead of the chosen one", record="default")
    cfg("a fallback label is not recorded", record="skip_fallback")
    cfg("only labels chosen at the default are recorded", record="only_default")
    cfg("nothing recorded (labels never see earlier labels)", record="none")
    cfg("last free candidate instead of the first", choose="last_free")
    cfg("candidate 1 (default) is not tried", skip_first=True)
    cfg("dy sign flipped in the output", neg_dy=True)
    cfg("dx sign flipped in the output", neg_dx=True)
    # ---- numbers
    cfg("coordinates floored to whole pixels before the test", floor_px=True)
    cfg("coordinates rounded to whole pixels before the test", round_px=True)
    cfg("coordinates and boxes in float64", float=True)
    cfg("units capped at 100", ucap=100)
    cfg("units capped at 39", ucap=39)
    cfg("units capped at 11", ucap=11)
    # ---- grid faults (section 7)
    grid("grid: cell index by truncation toward zero instead of floor", trunc=True)
    grid("grid: a box is stored only in its first cell", first_cell=True)
    grid("grid: a candidate is tested only against its first cell", query_first_cell=True)
    grid("grid: no 1 px growth of the tested box (literal reading of rev 0 section 7)", noinflate=True)
    grid("grid: right and bottom edges on a cell boundary belong to the previous cell (exclusive end)", excl_right=True)
    grid("grid: cells of 63 px", cell=63 * PX)
    grid("grid: cells of 65 px", cell=65 * PX)
    grid("grid: cells of 64 px, truncation toward zero AND exclusive end", trunc=True, excl_right=True)
    grid("grid: cells of 1000 px", cell=1000 * PX)
    grid("grid: cell index by absolute value (the sign of the coordinate is lost)", abs=True)
    grid("grid: left and top edges truncated toward zero, right and bottom edges floored", trunc_lo=True)
    grid("grid: a box whose exact edges are already stored is not stored again (dedupe, allowed by rev 1)", dedupe=True)
    grid("grid: fallback cost counts stored copies of a box (duplicates stored again), not distinct boxes", cost_id=True)
    grid("grid: fallback cost counts the cells a colliding box is found in (a box in several cells is counted several times)", cost_cell=True)
    grid("grid: dedupe of identical boxes AND fallback cost counting stored copies", dedupe=True, cost_id=True)
    return MUTANTS
