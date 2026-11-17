import json, hashlib, os, sys
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

def nkey(ref):                      # NodeRef order: type bytes, INT64 < STRING, ints numeric, strings UTF-8 bytes
    t, i = ref
    kind, val = i
    return (t.encode('utf-8'), 0 if kind == 'i' else 1, val if kind == 'i' else b'', b'' if kind == 'i' else val.encode('utf-8'))
def idtxt(i): return ('i:' + str(i[1])) if i[0] == 'i' else ('s:' + i[1])
def refobj(ref): return {"type": ref[0], "id": idtxt(ref[1])}
def label(i): return str(i[1]) if i[0] == 'i' else i[1]

def scene(src_bytes, directed, nodes, edges):
    nodes = sorted(nodes, key=nkey)
    es = []
    for (a, rel, b) in edges:
        if not directed and nkey(b) < nkey(a): a, b = b, a
        es.append((a, rel, b))
    es = sorted(set(es), key=lambda e: (nkey(e[0]), e[1].encode(), nkey(e[2]), b"0"))
    return {
        "igs": "IGS/1", "address_scheme": "igs-addr/1",
        "source": {"artifact_sha256": hashlib.sha256(src_bytes).hexdigest(), "serialization_profile": "ison-v1"},
        "graph": {"directed": directed, "profile": "simple"},
        "nodes": [{"ref": refobj(n), "category": n[0], "label": label(n[1])} for n in nodes],
        "edges": [{"ref": {"src": refobj(a), "rel": r, "tgt": refobj(b), "ord": "0"}, "label": r} for a, r, b in es],
    }
def canon(o): return json.dumps(o, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
def write(name, data):
    with open(os.path.join(OUT, name), 'wb') as f: f.write(data)

I = lambda n: ('i', n); S = lambda s: ('s', s)
# O1 basic
s1 = b"nodes.person\nid name\n1 Alice\nann Ann\n\nedges.KNOWS\nsource target\n:person:1 :person:ann\n"
write('o1-basic.source.ison', s1)
write('o1-basic.scene.json', canon(scene(s1, True, [('person', I(1)), ('person', S('ann'))], [(('person', I(1)), 'KNOWS', ('person', S('ann')))])))
# O2 ids and ordering: INT64 extremes, numeric-looking string, BMP, U+FF5E, non-BMP
s2 = ('nodes.p\nid\n-9223372036854775808\n-5\n2\n10\n9223372036854775807\n"007"\n\u00e9\n\U0001F600\n\uff5e\n\nedges.R\nsource target\n:p:10 :p:-5\n:p:-9223372036854775808 :p:2\n').encode('utf-8')
ids2 = [I(-9223372036854775808), I(-5), I(2), I(10), I(9223372036854775807), S('007'), S('\u00e9'), S('\U0001F600'), S('\uff5e')]
write('o2-ids-ordering.source.ison', s2)
write('o2-ids-ordering.scene.json', canon(scene(s2, True, [('p', i) for i in ids2],
      [(('p', I(10)), 'R', ('p', I(-5))), (('p', I(-9223372036854775808)), 'R', ('p', I(2)))])))
# O4 undirected: mirror pair + self-loop
s4 = b"edges.R\nsource target\n:p:2 :p:1\n:p:1 :p:2\n:p:2 :p:2\n\nmeta.graph\ndirected\nfalse\n\nnodes.p\nid\n1\n2\n"
write('o4-undirected.source.ison', s4)
write('o4-undirected.scene.json', canon(scene(s4, False, [('p', I(1)), ('p', I(2))],
      [(('p', I(2)), 'R', ('p', I(1))), (('p', I(1)), 'R', ('p', I(2))), (('p', I(2)), 'R', ('p', I(2)))])))
# O5 schema-level string stress (x- extension field): escapes, DEL, U+2028, non-BMP, NUL
x = ''.join(map(chr, __import__('json').load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'x5.json')))))
sc = scene(s1, True, [('person', I(1))], [])
sc["nodes"][0]["x-test"] = x
write('o5-string-stress.scene.json', canon(sc))
