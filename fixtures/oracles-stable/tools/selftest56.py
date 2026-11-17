#!/usr/bin/env python3
"""Reproduces the three worked examples of section 5.6 of the design (hashes, report bytes, work, waves, placed) with assertions."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stablelib import *

N = lambda i: ("n", "i:%d" % i)
E = lambda a, b: ("e", N(a), N(b))
def scene(nodes, edges, txt): return build_scene([N(i) for i in nodes], [E(a, b) for a, b in edges], True, txt)

prevS = scene([1, 2, 3, 6], [(1, 2), (2, 3), (3, 6)], "worked-prev")
prevL = build_layout(sha(prevS), {N(1): (0, 0), N(2): (2000, 0), N(3): (2000, 1500), N(6): (3000, 700)})
assert sha(prevS) == "d6ca9f78605923160b0686df780736718e53fa863f4973ab3fb74042923776d5"
assert sha(prevL) == "3f59c6804f0d487f14046f4351e6a676f7135d5f953535c8bad14d5404c2ec55"
cfg = dict(radius=1000, min_separation=800, max_rings=4)
EXPECTED = {
    "A": (scene([1, 2, 3, 4, 6], [(1, 2), (2, 3), (3, 6), (1, 4)], "worked-A"), "1de9b9f67f7173059a5e7b34ce08796efaa286dffb1d8e2bd98e13831df88f0e",
          "318c404cbea3a274b6c5bff3b4141f7c68b48b7e67e879a046bc665f13163460", "9642990ad784768d8311bc548ffde2e7cc0a35af4375862c5a6f6d4528914ea8", 1703, (61, 1, 1)),
    "B": (scene([1, 2, 6], [(1, 2)], "worked-B"), "574eb85dd753858618c8739b3447dcb0a916e327a0bdc9f1fd7c30af9833c64e",
          "2b98f86369baaf8e80e083a7a1ae44c8ace6c01308e5c178c4cde959267ce623", "f019567f4a35bdc61eec631ffd61e4ee16e66f796de9901b72775a6513362863", 1499, (39, 0, 0)),
    "C": (scene([2, 3, 4, 5, 6], [(2, 3), (3, 6), (2, 4), (3, 4), (4, 5)], "worked-C"), "abbf89d1b3dd203fcfb9ad444bc09b8b4b6da340d71039b77979dde0fdc0034c",
          "5574bf704c5e0331a17b77390e6ca64e6ed1254c970525de0d6983ffebe13bc4", "f20470354ac9f7a43a54691781c5b23421570306b212d0f0daea9b0b4cfaec3f", 2099, (105, 2, 2)),
}
for k, (sc, ssha, lsha, rsha, rlen, stats) in EXPECTED.items():
    r = compute_stable((prevS, prevL), sc, {"placement": cfg})
    assert sha(sc) == ssha and r["layout"].sha == lsha and sha(r["report_raw"]) == rsha and len(r["report_raw"]) == rlen, k
    assert (r["work"], r["waves"], r["placed"]) == stats, k
    print("case", k, "reproduced byte for byte:", ssha[:12], lsha[:12], rsha[:12], rlen, stats)
