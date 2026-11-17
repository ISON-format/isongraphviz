const T=process.argv[2];
const {ISONGraph}=require(T+'/dist/index.js');
const ison=require(T+'/../ison-ts/dist/index.js');
const src=(rows)=>'edges.R\nsource target w\n'+rows+'\n\nmeta.graph\ndirected\nfalse\n\nnodes.p\nid\n1\n2\n';
// 1. mirror rows with distinct unsafe integer property values
const t1=src(':p:1 :p:2 9007199254740992\n:p:2 :p:1 9007199254740993');
const d=ison.parse(t1); const eb=d.blocks.find(b=>b.kind==='edges');
console.log('P1 parsed w values:', eb.rows.map(r=>r.w), 'typeof', eb.rows.map(r=>typeof r.w), 'equal after parse:', eb.rows[0].w===eb.rows[1].w, 'safe:', eb.rows.map(r=>Number.isSafeInteger(r.w)));
const g=ISONGraph.fromIson(t1); console.log('P1 core edges:', [...g.edges()].map(e=>[e.relType,e.source,e.target,e.properties.w]));
// 2. mirror rows with differing safe property values -> loader behaviour
const g2=ISONGraph.fromIson(src(':p:1 :p:2 5\n:p:2 :p:1 6')); console.log('P2 differing props loaded without error:', [...g2.edges()].map(e=>[e.source[1],e.target[1],e.properties.w]));
// 3. undirected self-loop and mirror collapse
const g3=ISONGraph.fromIson(src(':p:2 :p:2 1\n:p:2 :p:1 1\n:p:1 :p:2 1')); console.log('P3 edgeCount (physical):', g3.edgeCount(), [...g3.edges()].map(e=>[e.source[1],e.target[1]]));
// 4. directed meta coercion: quoted "false"
const t4='edges.R\nsource target\n:p:1 :p:2\n\nmeta.graph\ndirected\n"false"\n\nnodes.p\nid\n1\n2\n';
const g4=ISONGraph.fromIson(t4); console.log('P4 quoted "false" -> graph.directed =', g4.directed, '(meta value typeof:', typeof ison.parse(t4).blocks.find(b=>b.name==='graph').rows[0].directed+')');
// 5. unsafe node ids
const t5='nodes.p\nid\n9007199254740992\n9007199254740993\n'; try{const g5=ISONGraph.fromIson(t5);console.log('P5 unsafe ids loaded:', g5.nodeCount());}catch(e){console.log('P5 error:',e.name,e.message)}
console.log('P5 parsed ids:', ison.parse(t5).blocks[0].rows.map(r=>r.id));
// 6. multigraph document
const t6='edges.R\nkey source target\n0 :p:1 :p:1\n\nmeta.graph\ndirected format version\ntrue ison-graph-multigraph-v1 1\n\nnodes.p\nid\n1\n';
const g6=ISONGraph.fromIson(t6); console.log('P6 multigraph doc loaded as simple; directed=',g6.directed,'edgeProps=',[...g6.edges()].map(e=>e.properties),'roundtrip has meta.graph:', /meta\.graph/.test(g6.toIson()));
// 7. marker as a property value is accepted by structured check
const t7='nodes.p\nid note\n1 "ison-graph-multigraph-v1"\n'; console.log('P7 marker-as-property doc meta.graph blocks:', ison.parse(t7).blocks.filter(b=>b.kind==='meta').length);
// 8. Reference id typing
const d8=ison.parse('edges.R\nsource target\n:p:9007199254740993 :p:2\n'); const r=d8.blocks[0].rows[0].source; console.log('P8 reference id', JSON.stringify(r.id), typeof r.id, 'type', r.type);
