#!/usr/bin/env node
// Natural reading and shush cycles, one seeded advance per scene, cached crops.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {load,canvas,crop,writePNG,themeOf} from './render.js'
import {renderer,copyPixels,doublePixels} from './gag-art.js'
import {sheetLabel} from './art-label.js'
const S=load('Sim.js'),P=load('Palette.js'),ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export const KEEPER_LEVELS=[13,33,53]
export const KEEPER_AGES={shush:[0,2,5,12,26,34,39,44],reading:[0,3,6,9,12,15,21,25]}
export function librarianScene(level=13,kind='shush',res=2){
 if(!Object.hasOwn(KEEPER_AGES,kind))throw Error('Unknown librarian scene '+kind)
 const random=Math.random;let cosmetic=317
 try{
  Math.random=()=>((cosmetic=(Math.imul(cosmetic,1664525)+1013904223)>>>0)/4294967296)
  const w=S.generate(level,0,3);w.res=res;const lib=w.librarians[0]
  if(!lib)throw Error('No librarian on level '+level)
  for(let n=0;n<12000&&!w.done;n++){
   const age=w.ticks-lib.shushAt,phase=(w.ticks+lib.x*7+w.level*11)%240
   if(w.ticks>=200&&(kind==='shush'?age===0:age>=40&&(age<=124||age>=180)&&phase<4))return{w,lib}
   S.step(w)
  }
  throw Error('No '+kind+' scene within 12000 live ticks on level '+level)
 }finally{Math.random=random}
}
export function librarianBox(w,lib){
 return{x:Math.max(0,Math.min(320,Math.round(lib.x*4)-40)),y:Math.max(0,Math.min(184,(lib.y+1)*4-44)),width:80,height:64}
}
export function librarianFrame(D,w,lib,cache={},theme='tokyo-night'){
 const res=w.res||1,pal=P.build(themeOf(theme).theme,w.level),box=librarianBox(w,lib),key=[w.terrainVersion,res,theme].join(':')
 if(cache.key!==key){cache.terrain=canvas(400*res,248*res,themeOf(theme).background);D.drawTerrain(cache.terrain.ctx,w,pal);cache.key=key}
 const img=crop(cache.terrain,box.x*res,box.y*res,box.width*res,box.height*res),set=img.ctx.setTransform.bind(img.ctx)
 img.ctx.setTransform=(a,b,c,d,e,f)=>set(a,b,c,d,e-box.x*res,f-box.y*res)
 D.drawActors(img.ctx,w,pal,{intro:false,feed:false});return img
}
function keeperReviewHTML(levels){
 return `<!doctype html><meta charset="utf-8"><title>The keeper of the quiet · before / after</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}.pair{display:flex;gap:24px;flex-wrap:wrap}.flip{width:320px;height:256px;background-size:2560px 256px;image-rendering:pixelated;animation:keeper 1.8s steps(8) infinite}a{color:#7aa2f7}section{margin:32px 0}@keyframes keeper{to{background-position:-2560px 0}}@media(prefers-reduced-motion:reduce){.flip{animation:none}}</style><h1>The keeper of the quiet</h1><p>Natural seed-3 play, eight selected milestones per cycle (not equal-time animation). The simulation supplies every shush; no staged interactions.</p><p><a href="contact-sheet.png">Reading and shushing contact sheet</a></p>${levels.map(level=>`<section><h2>Library ${level}</h2>${['reading','shush'].map(kind=>`<p>${kind}</p><div class="pair">${['before','after'].map(tag=>`<div><p>${tag}</p><div class="flip" style="background-image:url(${level}-${kind}-${tag}-res2.png)"></div></div>`).join('')}</div><a href="${level}-${kind}-frames.png">Native and page frame sheet</a>`).join('')}</section>`).join('')}`
}
function keeperStripsScene(out,D,old,level,kind,sheet,row){
 const{w,lib}=librarianScene(level,kind),start=w.ticks,caches=[{},{},{},{}],strips=[1,1,2,2].map(res=>canvas(80*res*8,64*res)),frames=[]
 for(const[frame,age]of KEEPER_AGES[kind].entries()){
  for(let n=w.ticks;n<start+age;n++)S.step(w)
  frames.push({tick:w.ticks,shushAt:lib.shushAt,dir:lib.dir,...D.librarianDrawing(w,lib)})
  for(const[ri,res]of[1,2].entries())for(const[vi,draw]of[old,D].entries()){
   w.res=res;const index=ri*2+vi,img=librarianFrame(draw,w,lib,caches[index]);copyPixels(strips[index],img,frame*img.W,0)
   if(frame===2&&res===2)copyPixels(sheet,doublePixels(img),16+vi*336,40+row*296)
  }
 }
 const compare=canvas(1400,576,'#121822');compare.ctx.fillStyle='#e6e9ee';sheetLabel(compare.ctx,D,`Library ${level} - ${kind}`,700,8)
 sheet.ctx.fillStyle='#e6e9ee';const label=sheetLabel(sheet.ctx,D,`Library ${level} - ${kind} - before / after`,342,15+row*296)
 for(const[index,strip]of strips.entries()){
  const res=index<2?1:2,tag=index%2?'after':'before';writePNG(path.join(out,`${level}-${kind}-${tag}-res${res}.png`),strip)
  compare.ctx.fillStyle='#e6e9ee';sheetLabel(compare.ctx,D,`${tag} ${res}x`,42,65+index*136);copyPixels(compare,res===1?doublePixels(strip):strip,100,30+index*136)
 }
 return{kind,compare,frames,label}
}
export function librarianStrips(out,{base='main',levels=KEEPER_LEVELS}={}){
 const started=performance.now(),D=load('Draw.js'),old=renderer(execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}).toString()),records=[]
 fs.mkdirSync(out,{recursive:true});const sheet=canvas(684,592*levels.length+30,'#121822')
 for(const[row,level]of levels.entries())for(const[ki,kind]of['reading','shush'].entries()){
  const scene=keeperStripsScene(out,D,old,level,kind,sheet,row*2+ki);writePNG(path.join(out,`${level}-${kind}-frames.png`),scene.compare);records.push({level,kind,label:scene.label,frames:scene.frames})
 }
 writePNG(path.join(out,'contact-sheet.png'),sheet);fs.writeFileSync(path.join(out,'index.html'),keeperReviewHTML(levels))
 const result={base,records,seconds:+((performance.now()-started)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
 console.log(JSON.stringify(librarianStrips(path.resolve(arg('--out','shots/librarian')),{base:arg('--base','main')})))
}
