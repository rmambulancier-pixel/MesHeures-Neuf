#!/usr/bin/env node
/*
 * V37.2.0-B — code Android du module Planning, exécuté dans la JVM contre des stubs d'API (tests/android/stubs).
 * Compile LegacyWebViewActivity.java et HybridCore.java du dépôt, puis lance tests/android/PlanningAndroidTest.java.
 * Sans javac/java (ex. Termux sans openjdk) : SKIP, code 2. Ne remplace pas la validation sur le Pixel.
 * Lancer : node tests/v372-planning-android.test.js
 */
const cp=require('child_process'),fs=require('fs'),path=require('path'),os=require('os');
const REPO=path.join(__dirname,'..'),J=path.join(REPO,'app/src/main/java/com/mesheures/app');
const has=c=>{try{cp.execSync(c+' -version',{stdio:'ignore'});return true}catch(e){return false}};
if(!has('javac')||!has('java')){console.log('SKIP : javac/java indisponibles');process.exit(2)}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mh-java-')),src=path.join(tmp,'src'),out=path.join(tmp,'out');
fs.cpSync(path.join(__dirname,'android/stubs'),src,{recursive:true});
fs.mkdirSync(path.join(src,'com/mesheures/app/core'),{recursive:true});
fs.copyFileSync(path.join(J,'LegacyWebViewActivity.java'),path.join(src,'com/mesheures/app/LegacyWebViewActivity.java'));
fs.copyFileSync(path.join(J,'core/HybridCore.java'),path.join(src,'com/mesheures/app/core/HybridCore.java'));
fs.copyFileSync(path.join(__dirname,'android/PlanningAndroidTest.java'),path.join(src,'PlanningAndroidTest.java'));
const list=[];(function walk(d){fs.readdirSync(d,{withFileTypes:true}).forEach(e=>{const p=path.join(d,e.name);e.isDirectory()?walk(p):p.endsWith('.java')&&list.push(p)})})(src);
fs.mkdirSync(out);
const env={...process.env,JAVA_TOOL_OPTIONS:''};
try{cp.execFileSync('javac',['-encoding','UTF-8','-d',out,...list],{stdio:['ignore','pipe','pipe'],env})}catch(e){console.log('FAIL  compilation Java\n'+String(e.stderr||e.stdout||e.message));process.exit(1)}
console.log('  ok  LegacyWebViewActivity.java et HybridCore.java compilent (stubs d’API Android)');
const r=cp.spawnSync('java',['-Dstdout.encoding=UTF-8','-Dfile.encoding=UTF-8','-cp',out,'PlanningAndroidTest'],{encoding:'utf8',env});
process.stdout.write(r.stdout||'');if(r.stderr&&r.status)process.stdout.write(r.stderr);
fs.rmSync(tmp,{recursive:true,force:true});
process.exit(r.status===0?0:1);
