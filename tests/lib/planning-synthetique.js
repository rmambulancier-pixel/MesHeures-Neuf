/*
 * Générateur de plannings SYNTHÉTIQUES en pixels (RGBA), proches de la photo réelle mesurée le 08/10/2026 :
 * cellules remplies (couleurs, gris) séparées par des liserés clairs, colonne des noms et en-têtes sur fond blanc, titre.
 * Retourne l'image et la disposition exacte (zones attendues + textes) pour un OCR simulé. Aucun texte n'est dessiné :
 * le texte est fourni par la disposition (OCR simulé) ; l'OCR réel est testé dans le navigateur.
 */
const COUL={'Jour 7h':[31,122,61],'Repos':[160,160,165],'Samu':[140,60,150],'Matin':[205,70,55],'Après\nMidi':[40,100,190],'Congés\n35':[225,185,80],'Condo\nm':[15,60,55],'Récup\n39h':[20,20,20],'Jour\nFérié':[235,235,235],'Formation':[200,200,205]};
const LT=['D','L','M','M','J','V','S'];
const addJ=(k,n)=>new Date(Date.parse(k+'T12:00:00Z')+n*864e5).toISOString().slice(0,10);
function generer(opts){
  const o=Object.assign({W:1300,cell:[30,18],gap:3,inclinaison:0,tables:[],fond:[245,245,245],bruit:0,graine:7},opts||{});
  const H=o.H||(o.tables.length*(o.tables[0].lignes.length*(o.cell[1]+o.gap)+140)+60),W=o.W,data=new Uint8ClampedArray(W*H*4);
  let g=o.graine;const rnd=()=>{g=(g*1103515245+12345)&0x7fffffff;return g/0x7fffffff};
  for(let i=0;i<W*H;i++){data[i*4]=o.fond[0];data[i*4+1]=o.fond[1];data[i*4+2]=o.fond[2];data[i*4+3]=255}
  const tan=Math.tan(o.inclinaison*Math.PI/180);
  const rect=(x,y,w,h,c)=>{for(let yy=Math.round(y);yy<Math.round(y+h);yy++)for(let xx=Math.round(x);xx<Math.round(x+w);xx++){const sy=Math.round(yy+tan*(xx-W/2));if(xx<0||sy<0||xx>=W||sy>=H)continue;const i=(sy*W+xx)*4;data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2]}};
  const zones={titre:[],entete:[],nom:[],cellule:[]};let y=40;
  const pas=[o.cell[0]+o.gap,o.cell[1]+o.gap];
  o.tables.forEach((t,ti)=>{
    const x0=o.x0||200,yT=y,yH=y+2*pas[1],y0=y+3*pas[1];
    zones.titre.push({x:x0-160,y:yT,w:pas[0]*t.colonnes.length+160,h:pas[1]*1.5,text:t.titre,conf:t.confTitre==null?92:t.confTitre,table:ti});
    t.colonnes.forEach((d,j)=>{const e=t.entetes&&t.entetes[j]!==undefined?t.entetes[j]:LT[new Date(d+'T12:00:00Z').getUTCDay()]+' '+d.slice(8)+'/'+d.slice(5,7);
      zones.entete.push({x:x0+j*pas[0],y:yH,w:o.cell[0],h:pas[1],text:e,conf:85,table:ti,col:j})});
    t.lignes.forEach((l,i)=>{zones.nom.push({x:x0-150,y:y0+i*pas[1],w:145,h:o.cell[1],text:l.nom,conf:l.confNom==null?88:l.confNom,table:ti,ligne:i});
      /* option « lettres » : jambages foncés des noms aux mêmes abscisses d'une ligne à l'autre (noms en capitales de même largeur) */
      if(o.lettres)for(let k=0;k<10;k++)rect(x0-150+k*11,y0+i*pas[1]+o.cell[1]*0.2,7,o.cell[1]*0.6,[20,20,20]);
      l.cellules.forEach((c,j)=>{const lab=typeof c==='string'?c:c.t,col=(typeof c==='object'&&c.couleur)||COUL[lab]||[90,90,200],cx=x0+j*pas[0],cy=y0+i*pas[1];
        rect(cx,cy,o.cell[0],o.cell[1],col);
        zones.cellule.push({x:cx,y:cy,w:o.cell[0],h:o.cell[1],text:typeof c==='object'&&c.lu!==undefined?c.lu:lab,conf:typeof c==='object'&&c.conf!=null?c.conf:90,table:ti,ligne:i,col:j})})});
    y=y0+t.lignes.length*pas[1]+90;
  });
  if(o.bruit)for(let i=0;i<W*H*4;i+=4)for(let k=0;k<3;k++)data[i+k]=Math.max(0,Math.min(255,data[i+k]+(rnd()-0.5)*o.bruit));
  /* les zones suivent la même inclinaison que le dessin */
  Object.values(zones).forEach(l=>l.forEach(z=>{z.y=z.y+tan*(z.x+z.w/2-W/2)}));
  return {image:{width:W,height:H,data},zones};
}
/* OCR simulé : rend le texte de la zone attendue (même mode) majoritairement couverte par le rectangle lu
   (≥ 60 % de sa surface, la plus couverte gagne), comme un OCR réel lit ce qui se trouve dans la zone ; sinon rien. */
function ocrSimule(zones,opts){opts=opts||{};const lus=[];
  const inter=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
  return {moteur:'OCR simulé (tests)',lus,async lire(img,r,mode){lus.push({mode,r});let best=null,bs=0;
    (zones[mode]||[]).forEach(z=>{const f=inter(r,z)/(z.w*z.h);if(f>bs){bs=f;best=z}});
    return best&&bs>=0.6?{text:best.text,conf:best.conf}:{text:'',conf:0}}};
}
function semaine(debut,n){return Array.from({length:n},(_,i)=>addJ(debut,i))}
module.exports={generer,ocrSimule,semaine,COUL,addJ};
