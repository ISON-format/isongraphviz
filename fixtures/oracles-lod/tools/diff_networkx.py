#!/usr/bin/env python3
"""T15 (optional): differential check of pendant-fold/1 and components/1 against networkx on random graphs. Nothing is stored; prints a summary."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import networkx as nx
from lodlib import *
from gen_infra import Rnd


def main(cases=400):
    bad = 0
    for seed in range(cases):
        rnd = Rnd(9000 + seed)
        n = 1 + rnd.below(14)
        names = ["s:n%02d" % i for i in range(n)]
        directed = bool(rnd.below(2))
        seen, edges = set(), []
        for _ in range(rnd.below(2 * n + 1)):
            a, b, r = names[rnd.below(n)], names[rnd.below(n)], "rqp"[rnd.below(3)]
            key = (r, a, b) if directed else (r,) + tuple(sorted((a, b)))
            if key not in seen:
                seen.add(key)
                edges.append((r, "t", a, "t", b))
        sb = build_scene([("t", x) for x in names], edges, directed)
        G = nx.Graph()
        G.add_nodes_from(names)
        G.add_edges_from((e[2], e[4]) for e in edges if e[2] != e[4])        # skeleton without self-loops
        for k in (2, 3):
            got = [[m["id"] for m in g["members"]] for g in suggest_groups(sb, [{"rule": "components/1", "min_size": k}])["groups"]]
            want = sorted(sorted(c) for c in nx.connected_components(G) if len(c) >= k)
            if got != want:
                bad += 1
                print("components mismatch", seed, k)
            got = [[m["id"] for m in g["members"]] for g in suggest_groups(sb, [{"rule": "pendant-fold/1", "min_leaves": k}])["groups"]]
            byhost = {}
            for v in G.nodes:
                if G.degree(v) == 1:
                    byhost.setdefault(next(iter(G[v])), []).append(v)
            want = sorted(sorted(ls) for ls in byhost.values() if len(ls) >= k)
            if got != want:
                bad += 1
                print("pendant mismatch", seed, k)
    print("cases", cases, "mismatches", bad)
    return bad


if __name__ == "__main__":
    sys.exit(1 if main() else 0)
