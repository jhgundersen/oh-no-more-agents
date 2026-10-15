#!/usr/bin/env node
// Real occupied crossings and small cached crops, never a staged passenger.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {load,canvas,crop,writePNG,themeOf} from './render.js'
import {renderer,copyPixels,doublePixels} from './gag-art.js'
const S=load('Sim.js'),P=load('Palette.js'),ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export function occupiedFerry(level=39,seed=3,res=2){
 const random=Math.random;let cosmetic=317
 try{
  Math.random=()=>((cosmetic=(Math.imul(cosmetic,1664525)+1013904223)>>>0)/4294967296)
  const w=S.generate(level,0,seed);w.res=res
  for(let tick=0;tick<12000&&!w.done;tick++){
   const ferry=w.trains.find(t=>t.boat&&t.riders.length&&t.phase==='run')
   if(ferry)return{w,ferry}
   S.step(w)
  }
  throw Error('No occupied ferry in 12000 ticks on level '+level)
 }finally{Math.random=random}
}
export function ferryUntil(w,ready,cap=600){
 for(let n=0;n<=cap;n++){if(ready())return n;if(n<cap)S.step(w)}
 throw Error('Ferry stage exceeded '+cap+' ticks')
}
export function ferryAdvance(w,tr,frame){
 if(frame===1||frame===2||frame===5||frame===7){const n=frame===7?6:frame===5?2:4;for(let i=0;i<n;i++)S.step(w)}
 if(frame===3){ferryUntil(w,()=>tr.phase!=='run'||tr.v>=S.TRAIN_SPEED*0.9);ferryUntil(w,()=>tr.phase!=='run'||tr.v<S.TRAIN_SPEED*0.85)}
 if(frame===4)ferryUntil(w,()=>tr.phase!=='run')
 if(frame===6)ferryUntil(w,()=>tr.phase==='back',100)
}
export function ferryBox(w,tr){
 const p=w.pits[tr.pit],x=(p.x0+p.x1+1)*2
 return{x:Math.max(0,Math.min(288,Math.round(x)-56)),y:Math.max(0,Math.min(184,p.surfaceY*4-38)),width:112,height:64}
}
export function ferryFrame(D,w,tr,cache={},theme='tokyo-night'){
 const res=w.res||1,pal=P.build(themeOf(theme).theme,w.level),box=ferryBox(w,tr),key=[w.terrainVersion,res,theme].join(':')
 if(cache.key!==key){cache.terrain=canvas(400*res,248*res,themeOf(theme).background);D.drawTerrain(cache.terrain.ctx,w,pal);cache.key=key}
 const img=crop(cache.terrain,box.x*res,box.y*res,box.width*res,box.height*res),set=img.ctx.setTransform.bind(img.ctx)
 img.ctx.setTransform=(a,b,c,d,e,f)=>set(a,b,c,d,e-box.x*res,f-box.y*res)
 D.drawActors(img.ctx,w,pal,{intro:false,feed:false});return img
}
function ferryReviewHTML(levels){
 return `<!doctype html><meta charset="utf-8"><title>The night ferry · before / after</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}.pair{display:flex;gap:24px;flex-wrap:wrap}.flip{width:448px;height:256px;background-size:3584px 256px;image-rendering:pixelated;animation:crossing 1.6s steps(8) infinite}a{color:#7aa2f7}section{margin:32px 0}@keyframes crossing{to{background-position:-3584px 0}}@media(prefers-reduced-motion:reduce){.flip{animation:none}}</style><h1>The night ferry</h1><p>Real occupied crossings, seed 3. Pick-up, steam, crossing, approach, docking, alighting and empty return. Eight selected milestones, not equal-time frames.</p><p><a href="contact-sheet.png">Loaded and docked · before / after</a></p>${levels.map(level=>`<section><h2>Harbour · level ${level}</h2><div class="pair">${['before','after'].map(tag=>`<div><p>${tag}</p><div class="flip" style="background-image:url(${level}-${tag}-res2.png)"></div></div>`).join('')}</div><a href="${level}-frames.png">Native and page-resolution frame sheet</a></section>`).join('')}`
}
export function ferryStrips(out,{base='main',levels=[39,59]}={}){
 const started=performance.now(),D=load('Draw.js'),old=renderer(execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}).toString()),records=[]
 fs.mkdirSync(out,{recursive:true});const sheet=canvas(940,576*levels.length+30,'#121822')
 for(const[row,level]of levels.entries()){
  const{w,ferry}=occupiedFerry(level),caches=[{},{},{},{}],strips=[1,1,2,2].map(res=>canvas(112*res*8,64*res)),frames=[]
  for(let i=0;i<8;i++){
   ferryAdvance(w,ferry,i);frames.push({tick:w.ticks,x:ferry.x,v:ferry.v,phase:ferry.phase,t:ferry.t,riders:ferry.riders.length})
   for(const[ri,res]of[1,2].entries())for(const[vi,draw]of[old,D].entries()){
    w.res=res;const index=ri*2+vi,img=ferryFrame(draw,w,ferry,caches[index]);copyPixels(strips[index],img,i*img.W,0)
    if((i===1||i===4)&&res===2)copyPixels(sheet,doublePixels(img),16+vi*464,40+row*576+(i===4?288:0))
   }
  }
  const compare=canvas(1910,576,'#121822');compare.ctx.fillStyle='#e6e9ee';D.drawTransitionText(compare.ctx,`LEVEL ${level} - REAL FERRY CROSSING`,955,8,1)
  sheet.ctx.fillStyle='#e6e9ee';D.drawTransitionText(sheet.ctx,`LEVEL ${level} - LOADED - BEFORE / AFTER`,470,15+row*576,1);D.drawTransitionText(sheet.ctx,`LEVEL ${level} - DOCKED - BEFORE / AFTER`,470,303+row*576,1)
  for(const[index,strip]of strips.entries()){
   const res=index<2?1:2,tag=index%2?'after':'before';writePNG(path.join(out,`${level}-${tag}-res${res}.png`),strip)
   compare.ctx.fillStyle='#e6e9ee';D.drawTransitionText(compare.ctx,`${tag.toUpperCase()} ${res}X`,42,65+index*136,1);copyPixels(compare,res===1?doublePixels(strip):strip,100,30+index*136)
  }
  writePNG(path.join(out,`${level}-frames.png`),compare);records.push({level,ax:ferry.ax,bx:ferry.bx,dir:ferry.dir,frames})
 }
 writePNG(path.join(out,'contact-sheet.png'),sheet);fs.writeFileSync(path.join(out,'index.html'),ferryReviewHTML(levels))
 const result={base,records,seconds:+((performance.now()-started)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
 console.log(JSON.stringify(ferryStrips(path.resolve(arg('--out','shots/ferry')),{base:arg('--base','main')})))
}
