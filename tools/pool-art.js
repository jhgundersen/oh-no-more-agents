#!/usr/bin/env node
// One bounded seeded scene per material; cached terrain and direct actor crops.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {load,canvas,crop,writePNG,themeOf} from './render.js'
import {renderer,copyPixels,doublePixels} from './gag-art.js'
const S=load('Sim.js'),P=load('Palette.js'),ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export const POOL_LEVELS=[2,24,25,7,8,39]
export function poolScene(level=8,{res=2,entry=false}={}){
 const random=Math.random;let cosmetic=317
 try{
  Math.random=()=>((cosmetic=(Math.imul(cosmetic,1664525)+1013904223)>>>0)/4294967296)
  const w=S.generate(level,0,3);w.res=res
  const pool=w.pits.find(p=>p.liquid);if(!pool)throw Error('No liquid pit on level '+level)
  for(let i=0;i<400&&!w.done;i++)S.step(w)
  if(entry){const ag=S.spawn(w);ag.x=pool.x0+0.75;w.agents.push(ag);S.sink(w,ag,pool);S.noteDeaths(w)}
  return{w,pool}
 }finally{Math.random=random}
}
export function poolBox(w,p){
 return{x:Math.max(0,Math.min(304,Math.round((p.x0+p.x1+1)*2)-48)),y:Math.max(0,Math.min(184,p.surfaceY*4-16)),width:96,height:64}
}
export function poolFrame(D,w,p,cache={},theme='tokyo-night'){
 const res=w.res||1,pal=P.build(themeOf(theme).theme,w.level),box=poolBox(w,p),key=[w.terrainVersion,res,theme].join(':')
 if(cache.key!==key){cache.terrain=canvas(400*res,248*res,themeOf(theme).background);D.drawTerrain(cache.terrain.ctx,w,pal);cache.key=key}
 const img=crop(cache.terrain,box.x*res,box.y*res,box.width*res,box.height*res),set=img.ctx.setTransform.bind(img.ctx)
 img.ctx.setTransform=(a,b,c,d,e,f)=>set(a,b,c,d,e-box.x*res,f-box.y*res)
 D.drawActors(img.ctx,w,pal,{intro:false,feed:false});return img
}
function poolReviewHTML(levels){
 return `<!doctype html><meta charset="utf-8"><title>Liquid surfaces · before / after</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}.pair{display:flex;gap:24px;flex-wrap:wrap}.flip{width:384px;height:256px;background-size:3072px 256px;image-rendering:pixelated;animation:pool 1.6s steps(8) infinite}a{color:#7aa2f7}section{margin:32px 0}@keyframes pool{to{background-position:-3072px 0}}@media(prefers-reduced-motion:reduce){.flip{animation:none}}</style><h1>Liquid surfaces</h1><p>Seed 3. Eight six-tick frames. Ambient scenes are ordinary level play; entry scenes explicitly stage one sink at the left side using Sim's existing sink/noteDeaths. No simulation changes.</p><p><a href="contact-sheet.png">Material and entry contact sheet</a></p>${levels.map(level=>`<section><h2>Level ${level}</h2>${['ambient','entry'].map(kind=>`<p>${kind}</p><div class="pair">${['before','after'].map(tag=>`<div><p>${tag}</p><div class="flip" style="background-image:url(${level}-${kind}-${tag}-res2.png)"></div></div>`).join('')}</div>`).join('')}<a href="${level}-ambient-frames.png">Native and page frame sheet</a></section>`).join('')}`
}
function poolStripsScene(out,D,old,level,entry,sheet,row){
 const{w,pool}=poolScene(level,{entry}),caches=[{},{},{},{}],strips=[1,1,2,2].map(res=>canvas(96*res*8,64*res)),frames=[]
 for(let frame=0;frame<8;frame++){
  if(frame)for(let n=0;n<6;n++)S.step(w)
  frames.push({tick:w.ticks,ripple:pool.ripple})
  for(const[ri,res]of[1,2].entries())for(const[vi,draw]of[old,D].entries()){
   w.res=res;const index=ri*2+vi,img=poolFrame(draw,w,pool,caches[index]);copyPixels(strips[index],img,frame*img.W,0)
   if(frame===1&&res===2)copyPixels(sheet,doublePixels(img),16+vi*400,40+row*296)
  }
 }
 const kind=entry?'entry':'ambient',compare=canvas(1660,576,'#121822')
 compare.ctx.fillStyle='#e6e9ee';D.drawTransitionText(compare.ctx,`${w.biome} - ${kind}`,830,8,1)
 sheet.ctx.fillStyle='#e6e9ee';D.drawTransitionText(sheet.ctx,`${w.biome} - ${kind} - BEFORE / AFTER`,408,15+row*296,1)
 for(const[index,strip]of strips.entries()){
  const res=index<2?1:2,tag=index%2?'after':'before';writePNG(path.join(out,`${level}-${kind}-${tag}-res${res}.png`),strip)
  compare.ctx.fillStyle='#e6e9ee';D.drawTransitionText(compare.ctx,`${tag.toUpperCase()} ${res}X`,42,65+index*136,1);copyPixels(compare,res===1?doublePixels(strip):strip,100,30+index*136)
 }
 return{kind,compare,frames}
}
export function poolStrips(out,{base='main',levels=POOL_LEVELS}={}){
 const started=performance.now(),D=load('Draw.js'),old=renderer(execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}).toString()),records=[]
 fs.mkdirSync(out,{recursive:true});const sheet=canvas(816,592*levels.length+30,'#121822')
 for(const[row,level]of levels.entries()){
  for(const[ei,entry]of[false,true].entries()){
   const scene=poolStripsScene(out,D,old,level,entry,sheet,row*2+ei)
   writePNG(path.join(out,`${level}-${scene.kind}-frames.png`),scene.compare);records.push({level,kind:scene.kind,frames:scene.frames})
  }
 }
 writePNG(path.join(out,'contact-sheet.png'),sheet);fs.writeFileSync(path.join(out,'index.html'),poolReviewHTML(levels))
 const result={base,records,seconds:+((performance.now()-started)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
 console.log(JSON.stringify(poolStrips(path.resolve(arg('--out','shots/pools')),{base:arg('--base','main')})))
}
