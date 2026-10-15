#!/usr/bin/env node
// Real gate cycles: warning, actual close, open, and occupancy deferrals.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {load,canvas,crop,writePNG,themeOf} from './render.js'
import {renderer,copyPixels,doublePixels} from './gag-art.js'
const S=load('Sim.js'),P=load('Palette.js'),ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export function gateCycle(level=36,seed=3,res=2,index=0){
 const random=Math.random;let cosmetic=317
 try{
  Math.random=()=>((cosmetic=(Math.imul(cosmetic,1664525)+1013904223)>>>0)/4294967296)
  const w=S.generate(level,0,seed);w.res=res;const gate=w.gates[index]
  if(!gate)throw Error('No gate '+index+' on level '+level)
  for(let tick=0;tick<12000&&!w.done;tick++){
   if(w.ticks>=200&&gate.open&&(w.ticks+gate.phase)%S.GATE_PERIOD===S.GATE_OPEN-18)return{w,gate}
   S.step(w)
  }
  throw Error('No live gate cycle within 12000 ticks on level '+level)
 }finally{Math.random=random}
}
export function gateUntil(w,ready,cap=600){
 for(let n=0;n<=cap;n++){if(ready())return n;if(n<cap)S.step(w)}
 throw Error('Gate stage exceeded '+cap+' ticks')
}
export function gateAdvance(w,g,frame){
 if(frame===1)gateUntil(w,()=>!g.open)
 if(frame===4)gateUntil(w,()=>g.open)
 if([2,3,5,6,7].includes(frame)){const n=frame===7?12:5;for(let i=0;i<n;i++)S.step(w)}
}
export function gateBox(w,g){
 return{x:Math.max(0,Math.min(320,Math.round((g.x0+g.x1+1)*2)-40)),y:Math.max(0,Math.min(184,g.top*4-20)),width:80,height:64}
}
export function gateFrame(D,w,g,cache={},theme='tokyo-night'){
 const res=w.res||1,pal=P.build(themeOf(theme).theme,w.level),box=gateBox(w,g),key=[w.terrainVersion,res,theme].join(':')
 if(cache.key!==key){cache.terrain=canvas(400*res,248*res,themeOf(theme).background);D.drawTerrain(cache.terrain.ctx,w,pal);cache.key=key}
 const img=crop(cache.terrain,box.x*res,box.y*res,box.width*res,box.height*res),set=img.ctx.setTransform.bind(img.ctx)
 img.ctx.setTransform=(a,b,c,d,e,f)=>set(a,b,c,d,e-box.x*res,f-box.y*res)
 D.drawActors(img.ctx,w,pal,{intro:false,feed:false});return img
}
function gateReviewHTML(levels){
 return `<!doctype html><meta charset="utf-8"><title>Clockwork portals · before / after</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}.pair{display:flex;gap:24px;flex-wrap:wrap}.flip{width:320px;height:256px;background-size:2560px 256px;image-rendering:pixelated;animation:gate 1.8s steps(8) infinite}a{color:#7aa2f7}section{margin:32px 0}@keyframes gate{to{background-position:-2560px 0}}@media(prefers-reduced-motion:reduce){.flip{animation:none}}</style><h1>Clockwork portals</h1><p>Real seed-3 cycles: amber warning, actual closing, halfway, shut, actual opening, halfway and clear. Eight selected milestones, not equal-time animation. Actual gate changes are observed, including any occupancy delay.</p><p><a href="contact-sheet.png">Closing and opening · before / after</a></p>${levels.map(level=>`<section><h2>Clock Tower · level ${level}</h2><div class="pair">${['before','after'].map(tag=>`<div><p>${tag}</p><div class="flip" style="background-image:url(${level}-${tag}-res2.png)"></div></div>`).join('')}</div><a href="${level}-frames.png">Native and page-resolution frame sheet</a></section>`).join('')}`
}
export function gateStrips(out,{base='main',levels=[36,76,96]}={}){
 const started=performance.now(),D=load('Draw.js'),old=renderer(execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}).toString()),records=[]
 fs.mkdirSync(out,{recursive:true});const sheet=canvas(684,576*levels.length+30,'#121822')
 for(const[row,level]of levels.entries()){
  const{w,gate}=gateCycle(level),caches=[{},{},{},{}],strips=[1,1,2,2].map(res=>canvas(80*res*8,64*res)),frames=[]
  for(let i=0;i<8;i++){
   gateAdvance(w,gate,i);frames.push({tick:w.ticks,open:gate.open,changedAt:gate.changedAt,cycle:(w.ticks+gate.phase)%S.GATE_PERIOD,drop:D.clockGateDrawing(w,gate).drop})
   for(const[ri,res]of[1,2].entries())for(const[vi,draw]of[old,D].entries()){
    w.res=res;const index=ri*2+vi,img=gateFrame(draw,w,gate,caches[index]);copyPixels(strips[index],img,i*img.W,0)
    if((i===2||i===5)&&res===2)copyPixels(sheet,doublePixels(img),16+vi*336,40+row*576+(i===5?288:0))
   }
  }
  const compare=canvas(1398,576,'#121822');compare.ctx.fillStyle='#e6e9ee';D.drawTransitionText(compare.ctx,`LEVEL ${level} - REAL GATE CYCLE`,699,8,1)
  sheet.ctx.fillStyle='#e6e9ee';D.drawTransitionText(sheet.ctx,`LEVEL ${level} - CLOSING - BEFORE / AFTER`,342,15+row*576,1);D.drawTransitionText(sheet.ctx,`LEVEL ${level} - OPENING - BEFORE / AFTER`,342,303+row*576,1)
  for(const[index,strip]of strips.entries()){
   const res=index<2?1:2,tag=index%2?'after':'before';writePNG(path.join(out,`${level}-${tag}-res${res}.png`),strip)
   compare.ctx.fillStyle='#e6e9ee';D.drawTransitionText(compare.ctx,`${tag.toUpperCase()} ${res}X`,42,65+index*136,1);copyPixels(compare,res===1?doublePixels(strip):strip,100,30+index*136)
  }
  writePNG(path.join(out,`${level}-frames.png`),compare);records.push({level,width:gate.x1-gate.x0+1,phase:gate.phase,frames})
 }
 writePNG(path.join(out,'contact-sheet.png'),sheet);fs.writeFileSync(path.join(out,'index.html'),gateReviewHTML(levels))
 const result={base,records,seconds:+((performance.now()-started)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
 console.log(JSON.stringify(gateStrips(path.resolve(arg('--out','shots/gates')),{base:arg('--base','main')})))
}
