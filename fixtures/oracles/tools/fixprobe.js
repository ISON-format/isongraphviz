const fs=require('fs'),path=require('path');const T=process.argv[2],dir=process.argv[3];
const ison=require(T+'/../ison-ts/dist/index.js'),{ISONGraph}=require(T+'/dist/index.js');
for(const f of fs.readdirSync(dir).sort()){
  const buf=fs.readFileSync(path.join(dir,f)); let utf8ok=true,txt; try{txt=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(buf);}catch(e){utf8ok=false;}
  let line=f.padEnd(44)+(utf8ok?'utf8 ':'BADUTF8 ')+(buf[0]===0xef&&buf[1]===0xbb?'BOM ':'');
  if(utf8ok){ try{const d=ison.parse(txt.replace(/^\uFEFF/,'')); const mg=d.blocks.filter(b=>b.kind==='meta'&&b.name==='graph');
      line+='parse=ok metaGraph='+mg.length+' '+JSON.stringify(mg.map(b=>({fields:b.fields,rows:b.rows.map(r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,typeof v==='string'?'str:'+v:typeof v==='boolean'?'bool:'+v:v])))})));
      try{const g=ISONGraph.fromIson(txt.replace(/^\uFEFF/,''));line+=' | core=loaded directed='+g.directed+' nodes='+g.nodeCount()+' edges='+g.edgeCount();}catch(e){line+=' | core='+e.name;}
    }catch(e){line+='parse=ERR '+e.name+': '+String(e.message).slice(0,60);} }
  console.log(line.slice(0,330));}
