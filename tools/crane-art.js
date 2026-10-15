#!/usr/bin/env node
// Genuine gantry rides, cached terrain, and crops tall enough for the landing.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {load,canvas,crop,writePNG,themeOf} from './render.js'
import {renderer,copyPixels,doublePixels} from './gag-art.js'
const S=load('Sim.js'),P=load('Palette.js'),ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export function occupiedCrane(level=15,seed=3,res=2){
 const random=Math.random;let cosmetic=317
 try{
  Math.random=()=>((cosmetic=(Math.imul(cosmetic,1664525)+1013904223)>>>0)/4294967296)
  const w=S.generate(level,0,seed);w.res=res
  for(let tick=0;tick<12000&&!w.done;tick++){
   const crane=w.cranes.find(k=>k.who>=0)
   if(crane)return{w,crane}
   S.step(w)
  }
  throw Error('No occupied crane in 12000 ticks on level '+level)
 }finally{Math.random=random}
}
export function craneUntil(w,ready,cap=600){
 for(let n=0;n<=cap;n++){if(ready())return n;if(n<cap)S.step(w)}
 throw Error('Crane stage exceeded '+cap+' ticks')
}
export function craneAdvance(w,k,frame){
 if(frame===1)craneUntil(w,()=>k.phase!=='up')
 if(frame===2||frame===6){const n=frame===2?6:4;for(let i=0;i<n;i++)S.step(w)}
 if(frame===3)craneUntil(w,()=>k.phase==='down')
 if(frame===4)craneUntil(w,()=>k.phase!=='down'||k.drop>=(k.land-k.y+S.CRANE_LIFT)/2)
 if(frame===5)craneUntil(w,()=>k.phase==='back')
 if(frame===7)craneUntil(w,()=>k.phase==='wait')
}
export function craneBox(w,k){
 const x=(k.ax+k.hx+1)*2,y=Math.max(0,(k.y-7)*4)
 return{x:Math.max(0,Math.min(288,Math.round(x)-56)),y,width:112,height:Math.min(248-y,(k.land+1)*4-y+8)}
}
export function craneFrame(D,w,k,cache={},theme='tokyo-night'){
 const res=w.res||1,pal=P.build(themeOf(theme).theme,w.level),box=craneBox(w,k),key=[w.terrainVersion,res,theme].join(':')
 if(cache.key!==key){cache.terrain=canvas(400*res,248*res,themeOf(theme).background);D.drawTerrain(cache.terrain.ctx,w,pal);cache.key=key}
 const img=crop(cache.terrain,box.x*res,box.y*res,box.width*res,box.height*res),set=img.ctx.setTransform.bind(img.ctx)
 img.ctx.setTransform=(a,b,c,d,e,f)=>set(a,b,c,d,e-box.x*res,f-box.y*res)
 D.drawActors(img.ctx,w,pal,{intro:false,feed:false});return img
}
function craneReviewHTML(records){
 return `<!doctype html><meta charset="utf-8"><title>A proper little hoist · before / after</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}.pair{display:flex;gap:24px;flex-wrap:wrap}.flip{width:448px;image-rendering:pixelated;animation:hoist 1.8s steps(8) infinite}a{color:#7aa2f7}section{margin:32px 0}@keyframes hoist{to{background-position-x:-3584px}}@media(prefers-reduced-motion:reduce){.flip{animation:none}}</style><h1>A proper little hoist</h1><p>Real seed-3 rides: pick-up, lift, travel, descent, set-down, reel-in and return. Eight selected milestones, not equal-time frames. The crop includes the complete shaft and landing.</p><p><a href="contact-sheet.png">Lifted and lowered · before / after</a></p>${records.map(r=>`<section><h2>Building Site · level ${r.level}</h2><div class="pair">${['before','after'].map(tag=>`<div><p>${tag}</p><div class="flip" style="height:${r.box.height*4}px;background-size:3584px ${r.box.height*4}px;background-image:url(${r.level}-${tag}-res2.png)"></div></div>`).join('')}</div><a href="${r.level}-frames.png">Native and page-resolution frame sheet</a></section>`).join('')}`
}
export function craneStrips(out,{base='main',levels=[15,35,75]}={}){
 const started=performance.now(),D=load('Draw.js'),old=renderer(execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}).toString()),records=[]
 const trips=levels.map(level=>({level,...occupiedCrane(level)})),tall=trips.reduce((n,t)=>n+craneBox(t.w,t.crane).height*8+64,30)
 fs.mkdirSync(out,{recursive:true});const sheet=canvas(940,tall,'#121822');let rowY=30
 for(const{level,w,crane}of trips){
  const box=craneBox(w,crane),caches=[{},{},{},{}],strips=[1,1,2,2].map(res=>canvas(112*res*8,box.height*res)),frames=[]
  for(let i=0;i<8;i++){
   craneAdvance(w,crane,i);frames.push({tick:w.ticks,hookX:crane.hookX,drop:crane.drop,phase:crane.phase,who:crane.who})
   for(const[ri,res]of[1,2].entries())for(const[vi,draw]of[old,D].entries()){
    w.res=res;const index=ri*2+vi,img=craneFrame(draw,w,crane,caches[index]);copyPixels(strips[index],img,i*img.W,0)
    if((i===2||i===4)&&res===2)copyPixels(sheet,doublePixels(img),16+vi*464,rowY+24+(i===4?box.height*4+32:0))
   }
  }
  const compare=canvas(1910,(box.height*2+24)*4+30,'#121822');compare.ctx.fillStyle='#e6e9ee';D.drawTransitionText(compare.ctx,`LEVEL ${level} - REAL GANTRY RIDE`,955,8,1)
  sheet.ctx.fillStyle='#e6e9ee';D.drawTransitionText(sheet.ctx,`LEVEL ${level} - LIFTED - BEFORE / AFTER`,470,rowY+8,1);D.drawTransitionText(sheet.ctx,`LEVEL ${level} - LOWERING - BEFORE / AFTER`,470,rowY+box.height*4+40,1)
  for(const[index,strip]of strips.entries()){
   const res=index<2?1:2,tag=index%2?'after':'before';writePNG(path.join(out,`${level}-${tag}-res${res}.png`),strip)
   compare.ctx.fillStyle='#e6e9ee';D.drawTransitionText(compare.ctx,`${tag.toUpperCase()} ${res}X`,42,65+index*(box.height*2+24),1);copyPixels(compare,res===1?doublePixels(strip):strip,100,30+index*(box.height*2+24))
  }
  writePNG(path.join(out,`${level}-frames.png`),compare);records.push({level,ax:crane.ax,hx:crane.hx,land:crane.land,dir:crane.dir,box,frames});rowY+=box.height*8+64
 }
 writePNG(path.join(out,'contact-sheet.png'),sheet);fs.writeFileSync(path.join(out,'index.html'),craneReviewHTML(records))
 const result={base,records,seconds:+((performance.now()-started)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
 console.log(JSON.stringify(craneStrips(path.resolve(arg('--out','shots/crane')),{base:arg('--base','main')})))
}
