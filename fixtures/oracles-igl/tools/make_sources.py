#!/usr/bin/env python3
"""Writes the IGL/1 oracle SOURCE files (ISON text). Deterministic; the 20-node mixed graph uses a fixed linear congruential generator (state * 1664525 + 1013904223 mod 2^32)."""
import os

OUT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def put(name, text):
    p = os.path.join(OUT, "sources", name + ".source.ison")
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf8", newline="\n") as f:
        f.write(text)


def mixed(n, seed):
    s = seed

    def r():
        nonlocal s
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
        return s / 4294967296

    types = ["person", "company", "project"]
    nodes = [(types[i % 3], f"n{i}" if i % 5 == 0 else str(i)) for i in range(n)]
    edges, seen = [], set()
    for i in range(2 * n):
        a, b = nodes[int(r() * n)], nodes[int(r() * n)]
        if a == b or (a, b) in seen:
            continue
        seen.add((a, b))
        edges.append((f"R{i % 4}", a, b))
    text = ""
    for ty in types:
        ns = [x[1] for x in nodes if x[0] == ty]
        if ns:
            text += f"nodes.{ty}\nid\n" + "\n".join(ns) + "\n\n"
    for rel in ["R0", "R1", "R2", "R3"]:
        es = [e for e in edges if e[0] == rel]
        if es:
            text += f"edges.{rel}\nsource target\n" + "\n".join(f":{e[1][0]}:{e[1][1]} :{e[2][0]}:{e[2][1]}" for e in es) + "\n\n"
    return text


put("parity5", "nodes.person\nid name age\nalice Alice 30\nbob Bob 25\ncarol Carol 35\n\nnodes.company\nid name\nacme Acme\n\nnodes.project\nid name\np1 Alpha\n\n"
    "edges.KNOWS\nsource target\n:person:alice :person:bob\n:person:bob :person:carol\n\nedges.WORKS_AT\nsource target\n:person:alice :company:acme\n\n"
    "edges.WORKS_ON\nsource target\n:person:carol :project:p1\n")
put("empty", "")
put("single", "nodes.p\nid\n1\n")
put("unicode", "nodes.p\nid\n～\n\U0001F600\n\n\U00010000\n")
put("bind-a", "nodes.n\nid\na\nb\nc\n\nedges.R\nsource target\n:n:a :n:b\n")
put("bind-b", "nodes.n\nid\na\nb\nc\n\nedges.R\nsource target\n:n:b :n:c\n")
put("mixed20", mixed(20, 3))
print("sources written")
