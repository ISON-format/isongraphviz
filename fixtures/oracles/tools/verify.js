const fs=require('fs'),c=require('crypto'),dir=process.argv[2];
const B=s=>Buffer.from(s,'utf8'), cmp=Buffer.compare;
// ids: {k:'i',v:bigint} | {k:'s',v:string}
const I=n=>({k:'i',v:BigInt(n)}), S=s=>({k:'s',v:s});
function ncmp(a,b){let r=cmp(B(a.t),B(b.t)); if(r)return r; if(a.id.k!==b.id.k)return a.id.k==='i'?-1:1;
  if(a.id.k==='i')return a.id.v<b.id.v?-1:a.id.v>b.id.v?1:0; return cmp(B(a.id.v),B(b.id.v));}
const idt=i=>i.k==='i'?'i:'+i.v.toString():'s:'+i.v, lab=i=>i.k==='i'?i.v.toString():i.v;
const ro=n=>({id:idt(n.id),type:n.t});
function canon(v){ if(Array.isArray(v))return'['+v.map(canon).join(',')+']';
  if(v&&typeof v==='object')return'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canon(v[k])).join(',')+'}';
  return JSON.stringify(v);}
function scene(src,directed,nodes,edges){
  nodes=[...nodes].sort(ncmp);
  let es=edges.map(([a,r,b])=>(!directed&&ncmp(b,a)<0)?[b,r,a]:[a,r,b]);
  const seen=new Set(),u=[];for(const e of es){const k=canon([ro(e[0]),e[1],ro(e[2])]);if(!seen.has(k)){seen.add(k);u.push(e);}}
  u.sort((x,y)=>ncmp(x[0],y[0])||cmp(B(x[1]),B(y[1]))||ncmp(x[2],y[2]));
  return {igs:'IGS/1',address_scheme:'igs-addr/1',source:{artifact_sha256:c.createHash('sha256').update(src).digest('hex'),serialization_profile:'ison-v1'},
    graph:{directed,profile:'simple'},nodes:nodes.map(n=>({ref:ro(n),category:n.t,label:lab(n.id)})),
    edges:u.map(([a,r,b])=>({ref:{src:ro(a),rel:r,tgt:ro(b),ord:'0'},label:r}))};}
const N=(t,id)=>({t,id}); const rd=f=>fs.readFileSync(dir+'/'+f);
let ok=true; const chk=(name,got)=>{const want=rd(name);const same=Buffer.compare(want,Buffer.from(got,'utf8'))===0;console.log((same?'MATCH   ':'MISMATCH ')+name);ok&&=same;};
const s1=rd('o1-basic.source.ison'); chk('o1-basic.scene.json',canon(scene(s1,true,[N('person',I(1)),N('person',S('ann'))],[[N('person',I(1)),'KNOWS',N('person',S('ann'))]])));
const s2=rd('o2-ids-ordering.source.ison'); const ids=[I('-9223372036854775808'),I(-5),I(2),I(10),I('9223372036854775807'),S('007'),S('\u00e9'),S('\u{1F600}'),S('\uff5e')];
chk('o2-ids-ordering.scene.json',canon(scene(s2,true,ids.map(i=>N('p',i)),[[N('p',I(10)),'R',N('p',I(-5))],[N('p',I('-9223372036854775808')),'R',N('p',I(2))]])));
const s4=rd('o4-undirected.source.ison'); chk('o4-undirected.scene.json',canon(scene(s4,false,[N('p',I(1)),N('p',I(2))],[[N('p',I(2)),'R',N('p',I(1))],[N('p',I(1)),'R',N('p',I(2))],[N('p',I(2)),'R',N('p',I(2))]])));
const sc=scene(s1,true,[N('person',I(1))],[]); sc.nodes[0]['x-test']=String.fromCodePoint(...JSON.parse(fs.readFileSync(__dirname+'/x5.json','utf8'))); chk('o5-string-stress.scene.json',canon(sc));
console.log(ok?'ALL MATCH':'FAILURES'); process.exit(ok?0:1);
