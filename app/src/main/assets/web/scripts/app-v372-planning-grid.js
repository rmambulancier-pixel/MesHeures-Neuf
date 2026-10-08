/*
 * MesHeures V37.2.0-C — Planning prévu : vues d'analyse et détection de la grille (JavaScript pur, sans DOM).
 *
 * Entrée : une image « ImageData » ({width, height, data RGBA}) déjà orientée selon l'EXIF. Elle n'est JAMAIS modifiée :
 * chaque vue (gris, contraste, binarisation, agrandissement) est une copie.
 * Principe (mesuré sur la photo réelle du 08/10/2026) : les cellules du planning sont des rectangles remplis (couleur ou gris)
 * séparés par de fins liserés clairs. On repère les bandes remplies (tableaux), puis les liserés par profils locaux à gauche et
 * à droite (lignes) ou en haut et en bas (colonnes), ce qui corrige une légère inclinaison ; un pas régulier comble les liserés
 * manqués. Aucune couleur n'a de sens ici : elle est seulement mesurée.
 */
(function(root){
  'use strict';
  const V='37.2.0-C';

  /* ---------- couleurs ---------- */
  function hsv(r,g,b){const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;let h=0;
    if(d){if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;if(h<0)h+=360}
    return {h,s:mx?d/mx:0,v:mx/255}}
  function hsl(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2,d=mx-mn;let h=0,s=0;
    if(d){s=d/(1-Math.abs(2*l-1));if(mx===r)h=((g-b)/d)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;if(h<0)h+=360}
    return {h:Math.round(h),s:Math.round(s*100),l:Math.round(l*100)}}
  const hex=([r,g,b])=>'#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
  const dist=(a,b)=>Math.sqrt((a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2);

  /* ---------- vues d'analyse (copies) ---------- */
  const copie=(img,data)=>({width:img.width,height:img.height,data});
  function gris(img){const s=img.data,o=new Uint8ClampedArray(s.length);for(let i=0;i<s.length;i+=4){const g=Math.round(0.299*s[i]+0.587*s[i+1]+0.114*s[i+2]);o[i]=o[i+1]=o[i+2]=g;o[i+3]=255}return copie(img,o)}
  function contraste(img){const g=gris(img),s=g.data,h=new Uint32Array(256);for(let i=0;i<s.length;i+=4)h[s[i]]++;
    const n=s.length/4;let a=0,b=255,c=0;for(;a<255&&(c+=h[a])<n*0.01;a++);c=0;for(;b>0&&(c+=h[b])<n*0.01;b--);
    const k=b>a?255/(b-a):1;for(let i=0;i<s.length;i+=4){const v=Math.max(0,Math.min(255,Math.round((s[i]-a)*k)));s[i]=s[i+1]=s[i+2]=v}return g}
  function otsu(img){const s=img.data,h=new Float64Array(256);for(let i=0;i<s.length;i+=4)h[s[i]]++;const n=s.length/4;
    let sum=0;for(let t=0;t<256;t++)sum+=t*h[t];let sb=0,wb=0,best=0,th=128;
    for(let t=0;t<256;t++){wb+=h[t];if(!wb)continue;const wf=n-wb;if(!wf)break;sb+=t*h[t];const mb=sb/wb,mf=(sum-sb)/wf,v=wb*wf*(mb-mf)**2;if(v>best){best=v;th=t}}return th}
  function binaire(img){const g=contraste(img),s=g.data,t=otsu(g);for(let i=0;i<s.length;i+=4){const v=s[i]>t?255:0;s[i]=s[i+1]=s[i+2]=v}return g}
  function recadrer(img,r){const x0=Math.max(0,Math.floor(r.x)),y0=Math.max(0,Math.floor(r.y)),x1=Math.min(img.width,Math.ceil(r.x+r.w)),y1=Math.min(img.height,Math.ceil(r.y+r.h));
    const w=Math.max(1,x1-x0),h=Math.max(1,y1-y0),o=new Uint8ClampedArray(w*h*4);
    for(let y=0;y<h;y++){const a=((y0+y)*img.width+x0)*4;o.set(img.data.subarray(a,a+w*4),y*w*4)}return {width:w,height:h,data:o}}
  function agrandir(img,k){k=Math.max(1,Math.min(8,Math.round(k)));if(k===1)return copie(img,new Uint8ClampedArray(img.data));
    const w=img.width*k,h=img.height*k,o=new Uint8ClampedArray(w*h*4);
    for(let y=0;y<h;y++){const sy=Math.floor(y/k);for(let x=0;x<w;x++){const si=(sy*img.width+Math.floor(x/k))*4,di=(y*w+x)*4;o[di]=img.data[si];o[di+1]=img.data[si+1];o[di+2]=img.data[si+2];o[di+3]=255}}
    return {width:w,height:h,data:o}}
  /* agrandissement bilinéaire (glyphes lissés pour l'OCR ; copie) */
  function lisse(img,k){if(k<=1)return copie(img,new Uint8ClampedArray(img.data));const W=img.width,H=img.height,w=Math.round(W*k),h=Math.round(H*k),o=new Uint8ClampedArray(w*h*4),d=img.data;
    for(let y=0;y<h;y++){const fy=Math.min(H-1,Math.max(0,(y+0.5)/k-0.5)),y0=Math.floor(fy),y1=Math.min(H-1,y0+1),ty=fy-y0;
      for(let x=0;x<w;x++){const fx=Math.min(W-1,Math.max(0,(x+0.5)/k-0.5)),x0=Math.floor(fx),x1=Math.min(W-1,x0+1),tx=fx-x0,di=(y*w+x)*4;
        for(let c=0;c<3;c++){const a=d[(y0*W+x0)*4+c],b=d[(y0*W+x1)*4+c],e=d[(y1*W+x0)*4+c],f=d[(y1*W+x1)*4+c];o[di+c]=(a*(1-tx)+b*tx)*(1-ty)+(e*(1-tx)+f*tx)*ty}o[di+3]=255}}
    return {width:w,height:h,data:o}}
  /* Vue pour l'OCR d'une zone : recadrée (marge intérieure : liserés exclus), agrandie, en gris contrasté, texte foncé sur fond
   * clair (le fond est la valeur MÉDIANE : texte blanc des cellules colorées inversé), binarisée (Otsu). Copie seulement. */
  function vueOcr(img,r,hauteurCible,marge){
    const m=Math.max(0,Math.min(0.3,Number(marge)||0)),ix=Math.round(r.w*m),iy=Math.round(r.h*m);
    const c=recadrer(img,{x:r.x+ix,y:r.y+iy,w:Math.max(1,r.w-2*ix),h:Math.max(1,r.h-2*iy)}),k=Math.max(1,Math.min(8,(hauteurCible||48)/Math.max(1,c.height)));
    const g=contraste(lisse(c,k)),s=g.data,h=new Uint32Array(256);for(let i=0;i<s.length;i+=4)h[s[i]]++;
    let acc=0,med=0;const n=s.length/4;for(;med<255&&(acc+=h[med])<n/2;med++);
    if(med<128)for(let i=0;i<s.length;i+=4){s[i]=s[i+1]=s[i+2]=255-s[i]}
    const t=otsu(g);for(let i=0;i<s.length;i+=4){const v=s[i]>t?255:0;s[i]=s[i+1]=s[i+2]=v}
    return g;
  }

  /* ---------- crêtes claires : les liserés entre cellules ----------
   * Un liseré est une bande fine plus claire que ses deux voisins (à distance k) et peu saturée. Le liège, le mur, la
   * marge blanche du papier n'en produisent pas ; le texte blanc des cellules en produit, mais sans alignement sur la hauteur. */
  function cretes(img,lv,lh){
    const W=img.width,H=img.height,n=W*H,v=new Uint8Array(n),sat=new Uint8Array(n),d=img.data;
    for(let i=0,p=0;p<n;i+=4,p++){const r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);v[p]=mx;sat[p]=mx?Math.round(255*(mx-mn)/mx):0}
    /* minimum glissant le long du liseré : un trait de texte (court) disparaît, un liseré (continu) reste */
    /* minimum glissant en O(n) (van Herk / Gil-Werman), fenêtre [i-h, i+h] bornée à l'image, comme un minimum direct */
    const glisse=(a,N,h,out,pad,g,s)=>{const w=2*h+1,M=N+2*h;pad.fill(255,0,M);for(let i=0;i<N;i++)pad[h+i]=a[i];
      for(let i=0;i<M;i++)g[i]=i%w===0?pad[i]:Math.min(g[i-1],pad[i]);
      for(let i=M-1;i>=0;i--)s[i]=(i%w===w-1||i===M-1)?pad[i]:Math.min(s[i+1],pad[i]);
      for(let i=0;i<N;i++)out[i]=Math.min(s[i],g[i+2*h])};
    const minDir=(src,L,vertical)=>{if(!(L>1))return src;const o=new Uint8Array(n),h=Math.floor(L/2),N=vertical?H:W,M=N+2*h;
      const a=new Uint8Array(N),r=new Uint8Array(N),pad=new Uint8Array(M),g=new Uint8Array(M),s=new Uint8Array(M);
      if(vertical)for(let x=0;x<W;x++){for(let y=0;y<H;y++)a[y]=src[y*W+x];glisse(a,N,h,r,pad,g,s);for(let y=0;y<H;y++)o[y*W+x]=r[y]}
      else for(let y=0;y<H;y++){glisse(src.subarray(y*W,y*W+W),N,h,r,pad,g,s);o.set(r,y*W)}
      return o};
    const minV=(src,L)=>minDir(src,L,true),minH=(src,L)=>minDir(src,L,false);
    const vv=minV(v,lv),vh=minH(v,lh),sv=lv>1?minV(sat.map(x=>255-x),lv).map(x=>255-x):sat,sh=lh>1?minH(sat.map(x=>255-x),lh).map(x=>255-x):sat;
    const k=Math.max(3,Math.round(Math.min(W,H)/300)),seuil=10,smax=70;
    const vert=new Uint8Array(n),hori=new Uint8Array(n);   // vert : liseré vertical (crête le long de x) ; hori : liseré horizontal
    for(let y=0;y<H;y++)for(let x=k;x<W-k;x++){const p=y*W+x;if(sv[p]>smax)continue;if(vv[p]-Math.max(vv[p-k],vv[p+k])>=seuil)vert[p]=1}
    for(let y=k;y<H-k;y++)for(let x=0;x<W;x++){const p=y*W+x;if(sh[p]>smax)continue;if(vh[p]-Math.max(vh[p-k*W],vh[p+k*W])>=seuil)hori[p]=1}
    return {vert,hori,k};
  }

  /* ---------- profils et pics ---------- */  function lisser(p,r){const o=new Float32Array(p.length);for(let i=0;i<p.length;i++){let s=0,n=0;for(let j=i-r;j<=i+r;j++)if(j>=0&&j<p.length){s+=p[j];n++}o[i]=s/n}return o}
  function pics(p,dmin,prom){
    const c=[];for(let i=1;i<p.length-1;i++)if(p[i]>=p[i-1]&&p[i]>p[i+1]){let mn=p[i];for(let j=Math.max(0,i-dmin);j<=Math.min(p.length-1,i+dmin);j++)mn=Math.min(mn,p[j]);if(p[i]-mn>=prom)c.push(i)}
    c.sort((a,b)=>p[b]-p[a]);const k=[];c.forEach(i=>{if(k.every(j=>Math.abs(j-i)>=dmin))k.push(i)});return k.sort((a,b)=>a-b);
  }
  /* Positions régulières ajustées aux pics : modèle pos(k) = c0 + c1·k + c2·k² (pas qui varie avec la perspective).
     Les liserés manqués sont comblés ; les pics trop loin du modèle sont écartés. */
  function moindresCarres(ks,ys,deg){
    const n=deg+1,A=Array.from({length:n},()=>new Float64Array(n+1));
    ks.forEach((k,i)=>{const p=[1,k,k*k];for(let r=0;r<n;r++){for(let c2=0;c2<n;c2++)A[r][c2]+=p[r]*p[c2];A[r][n]+=p[r]*ys[i]}});
    for(let col=0;col<n;col++){let piv=col;for(let r=col+1;r<n;r++)if(Math.abs(A[r][col])>Math.abs(A[piv][col]))piv=r;[A[col],A[piv]]=[A[piv],A[col]];
      if(Math.abs(A[col][col])<1e-9)return null;for(let r=0;r<n;r++)if(r!==col){const f=A[r][col]/A[col][col];for(let c2=col;c2<=n;c2++)A[r][c2]-=f*A[col][c2]}}
    const c=[0,0,0];for(let r=0;r<n;r++)c[r]=A[r][n]/A[r][r];return c;
  }
  function regulariser(pos){
    if(pos.length<3)return null;
    const d=[];for(let i=1;i<pos.length;i++)d.push(pos[i]-pos[i-1]);const md=d.slice().sort((a,b)=>a-b)[Math.floor(d.length/2)];
    const fins=d.filter(x=>x>md*0.6&&x<md*1.4);if(fins.length<2)return null;const pas0=fins.reduce((s,x)=>s+x,0)/fins.length;
    /* indices par pas successifs (et non depuis le premier pic) pour suivre la perspective */
    const ks=[0];for(let i=1;i<pos.length;i++)ks.push(ks[i-1]+Math.max(1,Math.round((pos[i]-pos[i-1])/pas0)));
    let c=moindresCarres(ks,pos,ks.length>=6?2:1);if(!c)return null;
    const f=k=>c[0]+c[1]*k+c[2]*k*k;
    const keep=ks.map((k,i)=>Math.abs(pos[i]-f(k))<pas0/3);
    if(keep.filter(Boolean).length>=3&&keep.some(x=>!x)){const k2=ks.filter((_,i)=>keep[i]),p2=pos.filter((_,i)=>keep[i]),c2=moindresCarres(k2,p2,k2.length>=6?2:1);if(c2)c=c2}
    const g=k=>c[0]+c[1]*k+c[2]*k*k,kn=ks[ks.length-1];
    const res=ks.map((k,i)=>Math.abs(pos[i]-g(k))),err=res.reduce((s,x)=>s+x,0)/res.length;
    return {a:g(0),pas:(g(kn)-g(0))/Math.max(1,kn),f:g,nb:kn+1,erreur:err,manques:kn+1-ks.length};
  }
  const frac=(m,W,x0,x1,y0,y1,axe)=>{const L=axe==='y'?y1-y0:x1-x0,p=new Float32Array(L);
    if(axe==='y'){for(let y=y0;y<y1;y++){let s=0;for(let x=x0;x<x1;x++)s+=m[y*W+x];p[y-y0]=s/Math.max(1,x1-x0)}}
    else{for(let x=x0;x<x1;x++){let s=0;for(let y=y0;y<y1;y++)s+=m[y*W+x];p[x-x0]=s/Math.max(1,y1-y0)}}
    return lisser(p,1)};
  function bandes(prof,seuil,trou,min){const out=[];let a=null,der=null;
    for(let i=0;i<prof.length;i++){if(prof[i]>seuil){if(a==null)a=i;der=i}else if(a!=null&&i-der>trou){if(der-a+1>=min)out.push([a,der+1]);a=null}}
    if(a!=null&&der-a+1>=min)out.push([a,der+1]);return out}
  /* nombre de liserés verticaux traversés par chaque ligne de pixels */
  function traversees(m,W,y,x0,x1){let n=0;for(let x=Math.max(1,x0);x<x1;x++)if(m[y*W+x]&&!m[y*W+x-1])n++;return n}

  /* pas d'un profil par autocorrélation : maximum principal (un motif local, ex. espaces entre les lettres alignés, ne
     l'emporte plus sur la grille), puis le plus petit sous-multiple presque aussi fort (2 ou 3 pas → 1 pas) */
  function pasDe(p,min){const n=p.length;let m=0;for(let i=0;i<n;i++)m+=p[i];m/=n;const q=Array.from(p,v=>v-m);const ac=[];
    for(let lag=min;lag<n/2;lag++){let s=0;for(let i=0;i+lag<n;i++)s+=q[i]*q[i+lag];ac[lag]=s/(n-lag)}
    const loc=[];for(let lag=min+1;lag<ac.length-1;lag++)if(ac[lag]>ac[lag-1]&&ac[lag]>=ac[lag+1]&&ac[lag]>0)loc.push(lag);
    if(!loc.length)return null;let best=loc.reduce((a,b)=>ac[b]>ac[a]?b:a);
    for(const k of [3,2]){const c=loc.find(l=>Math.abs(l*k-best)<=Math.max(2,best*0.06)&&ac[l]>=ac[best]*0.8);if(c){best=c;break}}
    return best}
  /* Réseau de liserés par SUIVI PAS À PAS : départ du liseré le plus net, puis de liseré en liseré avec un pas local mis à jour.
     Un liseré absent (barre de séparation, reflet) est franchi d'un pas ; deux absences de suite terminent la suite. */
  function reseau(p,kmin){
    const pas0=pasDe(p,kmin);if(!pas0)return [];const mx=Math.max(...p);if(!(mx>0))return [];
    const pk=pics(p,Math.max(3,Math.round(pas0*0.6)),Math.max(0.03,mx*0.12)),force=q=>p[Math.round(q)]||0;
    if(pk.length<3)return [];
    const fort=pk.map(force).sort((a,b)=>b-a),ref=fort[Math.min(fort.length-1,3)],seuil=Math.max(0.03,ref*0.2),tol=0.32;
    const pris=new Set(),suites=[];
    const marcher=(depart,sens,pas)=>{const out=[];let pos=depart,pl=pas,trous=0;
      for(let n=0;n<4000;n++){const att=pos+sens*pl;if(att<0||att>p.length-1)break;
        let best=null;pk.forEach(q=>{if(Math.abs(q-att)<=pl*tol&&force(q)>=seuil&&(best==null||Math.abs(q-att)<Math.abs(best-att)))best=q});
        if(best!=null){const d=Math.abs(best-pos);if(d>pl*0.6)pl=pl*0.7+d*0.3;pos=best;trous=0;out.push({pos,comble:false})}
        else{trous++;if(trous>2)break;pos=att;out.push({pos,comble:true})}}
      while(out.length&&out[out.length-1].comble)out.pop();return out};
    const ordre=pk.filter(q=>force(q)>=seuil).sort((a,b)=>force(b)-force(a));
    ordre.forEach(q=>{if(pris.has(q))return;
      const g=marcher(q,-1,pas0).reverse(),d=marcher(q,1,pas0),suite=g.concat([{pos:q,comble:false}],d);
      if(suite.length>=3){suite.forEach(x=>{if(!x.comble)pris.add(x.pos)});suites.push(suite)}else pris.add(q)});
    /* suites qui se chevauchent : la plus longue l'emporte */
    suites.sort((a,b)=>b.length-a.length);const gardees=[];
    suites.forEach(su=>{const a=su[0].pos,b=su[su.length-1].pos;if(gardees.every(g=>b<g[0].pos-pas0*0.5||a>g[g.length-1].pos+pas0*0.5))gardees.push(su)});
    return gardees.sort((a,b)=>a[0].pos-b[0].pos).map(su=>({pas:(su[su.length-1].pos-su[0].pos)/Math.max(1,su.length-1),positions:su.map(x=>x.pos),
      combles:su.filter(x=>x.comble).length,erreur:0}));
  }
  /* écart médian entre les pics d'une fenêtre et les positions du réseau (pour l'inclinaison) */
  function ecart(p,o,positions,pas){const pk=pics(p,Math.max(3,Math.round(pas*0.6)),Math.max(0.03,Math.max(...p)*0.15)).map(v=>v+o),d=[];
    positions.forEach(c=>{let b=null;pk.forEach(q=>{if(Math.abs(q-c)<pas*0.5&&(b==null||Math.abs(q-c)<Math.abs(b-c)))b=q});if(b!=null)d.push(b-c)});
    if(d.length<3)return null;d.sort((a,b)=>a-b);return d[Math.floor(d.length/2)]}

  /* Détection de tous les tableaux de l'image. Retourne [] si aucun tableau structuré n'est trouvé. */
  function detecterTableaux(img){
    const W=img.width,H=img.height;if(!W||!H||W<60||H<60)return [];
    const c=cretes(img),cnt=new Float32Array(H);
    for(let y=0;y<H;y++)cnt[y]=traversees(c.vert,W,y,0,W);
    const lis=lisser(cnt,Math.max(2,c.k)),out=[],bs=bandes(lis,8,Math.max(6,c.k*3),Math.max(20,Math.round(H*0.03)));
    /* 2e passe : pas approximatifs des bandes, puis crêtes filtrées par un minimum glissant de 0,6 pas (texte effacé) */
    const pl=[],pc=[];bs.forEach(([y0,y1])=>{const a=pasDe(frac(c.vert,W,0,W,y0,y1,'x'),Math.max(5,c.k+1)),b=pasDe(frac(c.hori,W,0,W,y0,y1,'y'),Math.max(5,c.k+1));if(a)pc.push(a);if(b)pl.push(b)});
    const med=a=>a.length?a.slice().sort((x,y)=>x-y)[Math.floor(a.length/2)]:0;
    /* pas des colonnes re-mesuré sur les seuls liserés verticaux continus sur plus d'une ligne (1,6 pas) : un liseré traverse
       tout le tableau, les espaces entre les lettres (noms, codes) non ; utile quand le tableau a peu de colonnes.
       Puis pas des lignes re-mesuré avec les colonnes connues. */
    if(pl.length){const cv=cretes(img,Math.round(med(pl)*1.6),0),pc2=[];bs.forEach(([y0,y1])=>{const a=pasDe(frac(cv.vert,W,0,W,y0,y1,'x'),Math.max(5,c.k+1));if(a)pc2.push(a)});
      if(pc2.length){pc.length=0;pc.push(...pc2);const ch=cretes(img,0,Math.round(med(pc)*0.6)),pl2=[];bs.forEach(([y0,y1])=>{const b=pasDe(frac(ch.hori,W,0,W,y0,y1,'y'),Math.max(5,c.k+1));if(b)pl2.push(b)});if(pl2.length){pl.length=0;pl.push(...pl2)}}}
    const c2=pl.length&&pc.length?cretes(img,Math.round(med(pl)*0.6),Math.round(med(pc)*0.6)):c;
    bs.forEach(([y0,y1])=>{
      reseau(frac(c2.vert,W,0,W,y0,y1,'x'),Math.max(5,c2.k+1)).forEach(rc=>{const t=structurer(c2,img,rc,y0,y1);if(t)out.push(t)});
    });
    return out.map((t,i)=>Object.assign(t,{index:i}));
  }
  function structurer(c,img,rc,by0,by1){
    const W=img.width,H=img.height;
    let X=rc.positions.slice(),pasC=rc.pas;const x0=X[0],x1=X[X.length-1];
    /* lignes : réseau des liserés horizontaux entre les colonnes trouvées */
    /* rangées mesurées sur le cinquième gauche (alignées sur les noms) ; le maillage les suit ensuite vers la droite */
    const xg1=Math.round(x0+Math.max(4*rc.pas,(x1-x0)/5));
    const rr=reseau(frac(c.hori,W,Math.round(x0),xg1,by0,by1,'y'),Math.max(5,c.k+1)).sort((a,b)=>b.positions.length-a.positions.length)[0];
    if(!rr)return null;
    let Y=rr.positions.map(v=>v+by0),pasL=rr.pas;
    /* bords extérieurs : une rangée de cellules au-delà du dernier liseré n'a pas de liseré côté papier. Elle est ajoutée si elle est
       nettement plus sombre ou plus colorée que la bande suivante vers l'extérieur (papier, colonne des noms, en-têtes). */
    const stats=(xa,xb,ya,yb)=>{xa=Math.max(0,Math.round(xa));xb=Math.min(W,Math.round(xb));ya=Math.max(0,Math.round(ya));yb=Math.min(H,Math.round(yb));
      if(xb-xa<2||yb-ya<2)return null;const d=img.data,vs=[];let sat=0,t=0;
      for(let y=ya;y<yb;y++)for(let x=xa;x<xb;x+=2){const i=(y*W+x)*4,mx=Math.max(d[i],d[i+1],d[i+2]),mn=Math.min(d[i],d[i+1],d[i+2]);vs.push(mx);t++;if(mx&&(mx-mn)/mx>0.3)sat++}
      let blanc=0;vs.forEach(x=>{if(x>200)blanc++});vs.sort((a,b)=>a-b);return {v:vs[Math.floor(vs.length/2)],sat:sat/t,blanc:blanc/t}};
    /* une bande de cellules contient peu de « papier » et se distingue de la bande extérieure (papier, noms, en-têtes) */
    const cellesVsDehors=(dedans,dehors)=>!!(dedans&&dehors&&dedans.blanc<0.45&&(dehors.v-dedans.v>=18||dedans.sat-dehors.sat>=0.2));
    /* rognage : une colonne ou une rangée d'extrémité qui est surtout du papier (noms, en-têtes, marge) n'est pas une cellule */
    const papier=(xa,xb,ya,yb)=>{const st=stats(xa,xb,ya,yb);return !st||st.blanc>=0.45};
    while(X.length>4&&papier(X[0],X[1],Y[0],Y[Y.length-1]))X.shift();
    while(X.length>4&&papier(X[X.length-2],X[X.length-1],Y[0],Y[Y.length-1]))X.pop();
    const xr1=X[Math.min(X.length-1,Math.max(4,Math.round(X.length/5)))];
    while(Y.length>2&&papier(X[0],xr1,Y[0],Y[1]))Y.shift();
    while(Y.length>2&&papier(X[0],xr1,Y[Y.length-2],Y[Y.length-1]))Y.pop();
    const ya=Y[0],yb=Y[Y.length-1],xa=X[0],xb=X[X.length-1];
    const yp=ya-(Y[1]-Y[0]),yn=yb+(yb-Y[Y.length-2]),xp=xa-(X[1]-X[0]),xn=xb+(xb-X[X.length-2]);
    if(cellesVsDehors(stats(xa,xr1,yp+(ya-yp)*0.15,yp+(ya-yp)*0.85),stats(xa,xr1,yp-(ya-yp)*0.85,yp-(ya-yp)*0.15)))Y.unshift(yp);
    if(cellesVsDehors(stats(xa,xr1,yb+(yn-yb)*0.15,yb+(yn-yb)*0.85),stats(xa,xr1,yn+(yn-yb)*0.15,yn+(yn-yb)*0.85)))Y.push(yn);
    if(cellesVsDehors(stats(xp+(xa-xp)*0.15,xp+(xa-xp)*0.85,Y[0],Y[Y.length-1]),stats(xp-(xa-xp)*0.85,xp-(xa-xp)*0.15,Y[0],Y[Y.length-1])))X.unshift(xp);
    if(cellesVsDehors(stats(xb+(xn-xb)*0.15,xb+(xn-xb)*0.85,Y[0],Y[Y.length-1]),stats(xn+(xn-xb)*0.15,xn+(xn-xb)*0.85,Y[0],Y[Y.length-1])))X.push(xn);
    const nbL=Y.length-1,nbC=X.length-1;if(nbL<1||nbC<3)return null;
    /* maillage : position des liserés suivie bande par bande (courbure, perspective). Chaque bande ajuste les liserés attendus
       (issus de la bande voisine) aux pics mesurés : pos = α + β·attendu. */
    const suivre=(positions,pas,nbB,profilDe,centreDe,depart)=>{
      const B=Array.from({length:nbB},(_,b)=>b),mid=depart==null?Math.floor(nbB/2):depart,model=new Array(nbB),ajust=new Array(nbB).fill(false);
      const fit=(b,att)=>{const p=profilDe(b),pk=pics(p.prof,Math.max(3,Math.round(pas*0.6)),Math.max(0.03,Math.max(...p.prof)*0.15)).map(v=>v+p.o),pairs=[];
        att.forEach((a,i)=>{let best=null;pk.forEach(q=>{if(Math.abs(q-a)<pas*0.3&&(best==null||Math.abs(q-a)<Math.abs(best-a)))best=q});if(best!=null)pairs.push([positions[i],best])});
        if(pairs.length<3)return null;const n=pairs.length,sx=pairs.reduce((s,q)=>s+q[0],0),sy=pairs.reduce((s,q)=>s+q[1],0),sxx=pairs.reduce((s,q)=>s+q[0]*q[0],0),sxy=pairs.reduce((s,q)=>s+q[0]*q[1],0);
        const den=n*sxx-sx*sx;let be=den?(n*sxy-sx*sy)/den:1;if(!(be>0.95&&be<1.05))be=1;const al=(sy-be*sx)/n;return positions.map(v=>al+be*v)};
      model[mid]=fit(mid,positions)||positions.slice();ajust[mid]=true;
      for(let b=mid+1;b<nbB;b++){const m=fit(b,model[b-1]);model[b]=m||model[b-1];ajust[b]=!!m}
      for(let b=mid-1;b>=0;b--){const m=fit(b,model[b+1]);model[b]=m||model[b+1];ajust[b]=!!m}
      return {centres:B.map(centreDe),model,ajustees:ajust.filter(Boolean).length,nb:nbB};
    };
    const nbBV=Math.max(3,Math.min(8,Math.round(nbC/4))),nbBH=Math.max(3,Math.min(6,Math.round(nbL/3)));
    const gx0=X[0],gx1=X[nbC],gy0=Y[0],gy1=Y[nbL],lw=(gx1-gx0)/nbBV,lh=(gy1-gy0)/nbBH;
    const MR=suivre(Y,pasL,nbBV,b=>({prof:frac(c.hori,W,Math.round(gx0+b*lw),Math.round(gx0+(b+1)*lw),by0,by1,'y'),o:by0}),b=>gx0+(b+0.5)*lw,0);
    const MC=suivre(X,pasC,nbBH,b=>({prof:frac(c.vert,W,Math.round(gx0),Math.round(gx1),Math.round(gy0+b*lh),Math.round(gy0+(b+1)*lh),'x'),o:Math.round(gx0)}),b=>gy0+(b+0.5)*lh);
    const interp=(M,t,i)=>{const C=M.centres;if(t<=C[0])return M.model[0][i]+(M.model[0][i]-(M.model[1]||M.model[0])[i])*(C[0]-t)/Math.max(1,(C[1]||C[0]+1)-C[0]);
      for(let b=0;b<C.length-1;b++)if(t<=C[b+1]){const u=(t-C[b])/(C[b+1]-C[b]);return M.model[b][i]*(1-u)+M.model[b+1][i]*u}
      const n=C.length-1;return M.model[n][i]+(M.model[n][i]-M.model[n-1][i])*(t-C[n])/Math.max(1,C[n]-C[n-1])};
    const pt=(i,j)=>{let x=X[j],y=Y[i];for(let it=0;it<3;it++){y=interp(MR,x,i);x=interp(MC,y,j)}return [x,y]};
    const sy=(interp(MR,gx1,0)-interp(MR,gx0,0))/Math.max(1,gx1-gx0);
    const cellules=[];
    for(let i=0;i<nbL;i++){const row=[];for(let j=0;j<nbC;j++){const a=pt(i,j),b=pt(i,j+1),cc=pt(i+1,j+1),d=pt(i+1,j);
      const XS=[a[0],b[0],cc[0],d[0]],YS=[a[1],b[1],cc[1],d[1]],x=Math.min(...XS),y=Math.min(...YS);
      row.push({ligne:i,colonne:j,bounds:{x:Math.round(x),y:Math.round(y),w:Math.round(Math.max(...XS)-x),h:Math.round(Math.max(...YS)-y)}})}cellules.push(row)}
    const a00=pt(0,0),aN0=pt(nbL,0),a0N=pt(0,nbC);
    return {bounds:{x:Math.round(a00[0]),y:Math.round(a00[1]),w:Math.round(a0N[0]-a00[0]),h:Math.round(aN0[1]-a00[1])},lignes:nbL,colonnes:nbC,
      pasLigne:+pasL.toFixed(2),pasColonne:+pasC.toFixed(2),inclinaison:+(Math.atan(sy)*180/Math.PI).toFixed(2),maillage:{bandesLignes:MR.ajustees+'/'+MR.nb,bandesColonnes:MC.ajustees+'/'+MC.nb},
      regularite:+Math.max(rc.erreur,rr.erreur).toFixed(2),liseresComblés:(rc.combles||0)+(rr.combles||0),cellules,
      /* zones à lire : noms à gauche, en-têtes de dates au-dessus, titre plus haut */
      zoneNom:i=>{const a=pt(i,0),b=pt(i+1,0),xr=Math.min(a[0],b[0])-2,xl=Math.max(0,xr-pasC*4.4);return {x:Math.round(xl),y:Math.round(Math.min(a[1],b[1])),w:Math.max(1,Math.round(xr-xl)),h:Math.max(1,Math.round(Math.abs(b[1]-a[1])))}},
      zoneEntete:j=>{const a=pt(0,j),b=pt(0,j+1),h=pasL*1.25,yb=Math.min(a[1],b[1])-1;return {x:Math.round(a[0]),y:Math.max(0,Math.round(yb-h)),w:Math.max(1,Math.round(b[0]-a[0])),h:Math.max(1,Math.round(Math.min(h,yb)))}},
      zoneTitre:()=>{const yb=a00[1]-pasL*1.3,h=pasL*3.4,xl=Math.max(0,a00[0]-pasC*4.4);return {x:Math.round(xl),y:Math.max(0,Math.round(yb-h)),w:Math.max(1,Math.round(Math.min(W,a0N[0])-xl)),h:Math.max(1,Math.round(Math.min(h,yb)))}}};
  }

  /* ---------- couleur d'une cellule ---------- */
  function couleur(img,b){
    const x0=Math.round(b.x+b.w*0.18),x1=Math.round(b.x+b.w*0.82),y0=Math.round(b.y+b.h*0.18),y1=Math.round(b.y+b.h*0.82),R=[],G=[],B=[];
    for(let y=Math.max(0,y0);y<Math.min(img.height,y1);y++)for(let x=Math.max(0,x0);x<Math.min(img.width,x1);x++){const i=(y*img.width+x)*4;R.push(img.data[i]);G.push(img.data[i+1]);B.push(img.data[i+2])}
    if(!R.length)return null;const med=a=>a.sort((p,q)=>p-q)[Math.floor(a.length/2)];
    const rgb=[med(R),med(G),med(B)],v=hsv(...rgb);
    return {rgb,hex:hex(rgb),hsl:hsl(...rgb),rempli:!(v.s<0.12&&v.v>0.9)};
  }
  /* Groupes de couleurs proches observées dans la même image (aucune signification attachée). */
  function grouper(couleurs,seuil){
    seuil=seuil||38;const g=[];
    couleurs.forEach((c,i)=>{if(!c)return;let best=null;g.forEach(x=>{const d=dist(c.rgb,x.rgb);if(d<seuil&&(!best||d<best.d))best={x,d}});
      if(best){best.x.membres.push(i);const n=best.x.membres.length;best.x.rgb=best.x.rgb.map((v,k)=>Math.round(v+(c.rgb[k]-v)/n))}else g.push({id:g.length,rgb:c.rgb.slice(),membres:[i]})});
    return g;
  }
  /* Coordonnées dans l'image ORIGINALE (avant orientation EXIF) d'un rectangle mesuré sur l'image orientée. */
  function versOriginal(b,orientation,W,H){
    const o=Number(orientation)||1,pts=[[b.x,b.y],[b.x+b.w,b.y+b.h]].map(([x,y])=>{
      switch(o){case 2:return [W-x,y];case 3:return [W-x,H-y];case 4:return [x,H-y];case 5:return [y,x];case 6:return [y,W-x];case 7:return [H-y,W-x];case 8:return [H-y,x];default:return [x,y]}});
    const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);return {x:Math.min(...xs),y:Math.min(...ys),w:Math.abs(xs[1]-xs[0]),h:Math.abs(ys[1]-ys[0])};
  }

  root.MHPlanningGrid={version:V,hsv,hsl,hex,dist,gris,contraste,binaire,otsu,recadrer,agrandir,vueOcr,detecterTableaux,couleur,grouper,versOriginal,_interne:{pics,regulariser,bandes,cretes}};
})(typeof window!=='undefined'?window:globalThis);
