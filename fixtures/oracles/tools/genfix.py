import os, sys
D = sys.argv[1]
def w(name, data):
    if isinstance(data, str): data = data.encode('utf-8')
    open(os.path.join(D, name), 'wb').write(data)
UND = "\n\nmeta.graph\ndirected\nfalse\n\nnodes.p\nid\n1\n2\n"
N = "\n\nnodes.p\nid\n1\n2\n"
# negative: profile
w('n01-multigraph.source.ison', "edges.R\nkey source target\n0 :p:1 :p:1\n\nmeta.graph\ndirected format version\ntrue ison-graph-multigraph-v1 1\n\nnodes.p\nid\n1\n")
w('n02-meta-quoted-bool.source.ison', "edges.R\nsource target\n:p:1 :p:2\n\nmeta.graph\ndirected\n\"false\"\n\nnodes.p\nid\n1\n2\n")
w('n03-meta-unknown-format.source.ison', "edges.R\nsource target\n:p:1 :p:2\n\nmeta.graph\ndirected format\ntrue ison-graph-v9\n\nnodes.p\nid\n1\n2\n")
w('n04-meta-extra-field.source.ison', "edges.R\nsource target\n:p:1 :p:2\n\nmeta.graph\ndirected note\ntrue hello\n\nnodes.p\nid\n1\n2\n")
w('n05-meta-duplicate-block.source.ison', "edges.R\nsource target\n:p:1 :p:2\n\nmeta.graph\ndirected\ntrue\n\nmeta.graph\ndirected\nfalse\n\nnodes.p\nid\n1\n2\n")
# negative: ids
w('n06-id-unsafe-neighbours.source.ison', "nodes.p\nid\n9007199254740992\n9007199254740993\n")
w('n07-ref-unsafe.source.ison', "edges.R\nsource target\n:p:9007199254740993 :p:1\n\nnodes.p\nid\n1\n")
w('n08-id-float.source.ison', "nodes.p\nid\n1.5\n")
# negative: mirrored edges
w('n09-mirror-unsafe-distinct.source.ison', "edges.R\nsource target w\n:p:1 :p:2 9007199254740992\n:p:2 :p:1 9007199254740993" + UND)
w('n10-mirror-unsafe-identical.source.ison', "edges.R\nsource target w\n:p:1 :p:2 9007199254740993\n:p:2 :p:1 9007199254740993" + UND)
w('n11-mirror-props-differ.source.ison', "edges.R\nsource target w\n:p:1 :p:2 5\n:p:2 :p:1 6" + UND)
# negative: encoding
w('n12-bom.source.ison', b"\xef\xbb\xbfnodes.p\nid\n1\n")
w('n13-invalid-utf8.source.ison', b"nodes.p\nid note\n1 \xff\n")
# positive
w('p01-marker-as-property.source.ison', "nodes.p\nid note\n1 \"ison-graph-multigraph-v1\"\n")
w('p02-mirror-equal-props.source.ison', "edges.R\nsource target w\n:p:1 :p:2 5\n:p:2 :p:1 5" + UND)
w('p03-unsafe-prop-no-mirror.source.ison', "edges.R\nsource target w\n:p:1 :p:2 9007199254740993" + UND)
w('p04-safe-boundaries.source.ison', "nodes.p\nid\n-9007199254740991\n9007199254740991\n")
w('p05-numeric-looking-strings.source.ison', "nodes.p\nid\n\"007\"\n\"-0\"\n\"1.5\"\n")
w('p06-int-vs-string-distinct-types.source.ison', "nodes.p\nid\n1\n\nnodes.q\nid\n\"1\"\n")
