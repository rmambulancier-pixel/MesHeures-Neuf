/* Lecteur PDF minimal (V37.0-D) partagé par tests/v37-dossier.test.js et tests/v37-dossier.browser.js :
   structure (en-tête, xref exacte, flux de longueur exacte, fichier ASCII) et texte des opérateurs Tj. */
const assert=require('assert');
const CP={0x80:'€',0x82:'‚',0x85:'…',0x91:'‘',0x92:'’',0x93:'“',0x94:'”',0x95:'•',0x96:'–',0x97:'—',0x9C:'œ',0x8C:'Œ'};
function readPdf(bytes){
  const s=Buffer.from(bytes).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4\n'),'en-tête PDF');assert.ok(s.trimEnd().endsWith('%%EOF'),'fin %%EOF');
  for(let i=0;i<bytes.length;i++)if(bytes[i]>127)throw new Error('octet non ASCII à '+i);
  const sx=+s.match(/startxref\n(\d+)\n%%EOF/)[1];assert.equal(s.slice(sx,sx+4),'xref','startxref pointe sur xref');
  const n=+s.slice(sx).match(/^xref\n0 (\d+)\n/)[1],rows=s.slice(sx).split('\n').slice(3,3+n-1);
  rows.forEach((r,i)=>{const off=+r.slice(0,10);assert.equal(s.slice(off,off+String(i+1).length+6),(i+1)+' 0 obj','offset xref objet '+(i+1))});
  const streams=[...s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)].map(m=>{const st=m.index+m[0].length,len=+m[1];
    assert.equal(s.slice(st+len,st+len+10),'\nendstream','longueur exacte du flux');return s.slice(st,st+len)});
  const pagesDecl=+s.match(/\/Type \/Pages \/Kids \[[^\]]*\] \/Count (\d+)/)[1];
  const pageObjs=(s.match(/\/Type \/Page \//g)||[]).length;
  const decode=lit=>lit.replace(/\\([0-7]{3}|[()\\])/g,(_,c)=>c.length===3?String.fromCharCode(parseInt(c,8)):c).replace(/[\x80-\xff]/g,c=>CP[c.charCodeAt(0)]||c);
  const pages=streams.map(st=>{const lines=[],ops=[];
    for(const m of st.matchAll(/BT \/(F[12]) ([\d.]+) Tf (-?[\d.]+) (-?[\d.]+) Td \(((?:\\.|[^\\)])*)\) Tj ET/g)){const x=+m[3],y=+m[4],tx=decode(m[5]);ops.push({x,y,tx,bold:m[1]==='F2',size:+m[2]});lines.push(tx)}
    return {text:lines.join('\n'),ops}});
  const text=pages.map(p=>p.text).join('\n');
  return {pagesDecl,pageObjs,pages,text,flat:text.replace(/\n/g,' '),raw:s};   // flat : cellules sur plusieurs lignes recollées
}
module.exports={readPdf};
