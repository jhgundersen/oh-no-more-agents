#!/usr/bin/env node
// Seek a real charge once; sample its actual clock, caching terrain per renderer.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {load,canvas,crop,writePNG,themeOf} from './render.js'
import {renderer,copyPixels,doublePixels} from './gag-art.js'
import {sheetLabel} from './art-label.js'
const S=load('Sim.js'),P=load('Palette.js'),ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export const STORM_LEVELS=[20,40,100]
export const STORM_OFFSETS=[0,8,16,24,32,40,45,46,49,52,56,64]
export function stormScene(level=20,res=2){
 const random=Math.random;let cosmetic=317
 try{
  Math.random=()=>((cosmetic=(Math.imul(cosmetic,1664525)+1013904223)>>>0)/4294967296)
  const w=S.generate(level,0,3);w.res=res;const h=w.hazards.find(h=>h.kind==='lightning')
  if(!h)throw Error('No lightning on level '+level)
  for(let n=0;n<12000&&!w.done;n++){
   if(h.phase==='charge'&&h.t===0)return{w,h}
   S.step(w)
  }
  throw Error('No natural storm within 12000 live ticks on level '+level)
 }finally{Math.random=random}
}
export function stormAdvance(w,count){
 const random=Math.random
 try{Math.random=()=>0.25;for(let n=0;n<count;n++)S.step(w)}finally{Math.random=random}
}
export function stormBox(w,h){
 return{x:Math.max(0,Math.min(272,Math.round((h.zx0+h.zx1+1)*2)-64)),y:Math.max(0,Math.min(184,h.zy0*4-14)),width:128,height:64}
}
export function stormFrame(D,w,h,cache={},theme='tokyo-night'){
 const res=w.res||1,pal=P.build(themeOf(theme).theme,w.level),box=stormBox(w,h),key=[w.terrainVersion,res,theme].join(':')
 if(cache.key!==key){cache.terrain=canvas(400*res,248*res,themeOf(theme).background);D.drawTerrain(cache.terrain.ctx,w,pal);cache.key=key}
 const img=crop(cache.terrain,box.x*res,box.y*res,box.width*res,box.height*res),set=img.ctx.setTransform.bind(img.ctx)
 img.ctx.setTransform=(a,b,c,d,e,f)=>set(a,b,c,d,e-box.x*res,f-box.y*res)
 D.drawActors(img.ctx,w,pal,{intro:false,feed:false});return img
}
function stormReviewHTML(levels){
 return `<!doctype html><meta charset="utf-8"><title>A little local thunder · before / after</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}.pair{display:flex;gap:24px;flex-wrap:wrap}.flip{width:512px;height:256px;background-size:6144px 256px;image-rendering:pixelated;animation:storm 3s steps(12) infinite}a{color:#7aa2f7}section{margin:32px 0}@keyframes storm{to{background-position:-6144px 0}}@media(prefers-reduced-motion:reduce){.flip{animation:none}}</style><h1>A little local thunder</h1><p>Natural seed-3 storms. Twelve poses sampled at offsets ${STORM_OFFSETS.join(', ')} ticks from real charge onset. Equal review display time per pose; actual wind-up is 46 ticks and fire lasts 6.</p><p><a href="contact-sheet.png">Late wind-up, strike and recovery</a></p>${levels.map(level=>`<section><h2>The Cloud ${level}</h2><div class="pair">${['before','after'].map(tag=>`<div><p>${tag}</p><div class="flip" style="background-image:url(${level}-${tag}-res2.png)"></div></div>`).join('')}</div><a href="${level}-frames.png">Native and page frame sheet</a></section>`).join('')}`
}
function stormStripScene(out,D,old,level,sheet,row){
 const{w,h}=stormScene(level),caches=[{},{},{},{}],strips=[1,1,2,2].map(res=>canvas(128*res*12,64*res)),frames=[]
 const compare=canvas(3184,576,'#121822');compare.ctx.fillStyle='#e6e9ee';sheetLabel(compare.ctx,D,`The Cloud ${level} - natural storm`,1592,8)
 for(let frame=0;frame<STORM_OFFSETS.length;frame++){
  if(frame)stormAdvance(w,STORM_OFFSETS[frame]-STORM_OFFSETS[frame-1])
  frames.push({tick:w.ticks,phase:h.phase,t:h.t,fired:h.fired})
  for(const[ri,res]of[1,2].entries())for(const[vi,draw]of[old,D].entries()){
   w.res=res;const index=ri*2+vi,img=stormFrame(draw,w,h,caches[index]);copyPixels(strips[index],img,frame*img.W,0)
   const key=[5,8,10].indexOf(frame)
   if(key>=0&&res===2)copyPixels(sheet,doublePixels(img),16+vi*528,40+(row*3+key)*296)
  }
 }
 for(let key=0;key<3;key++){sheet.ctx.fillStyle='#e6e9ee';sheetLabel(sheet.ctx,D,`Cloud ${level} - ${['wind-up','strike','recovery'][key]} - before / after`,536,15+(row*3+key)*296)}
 for(const[index,strip]of strips.entries()){
  const res=index<2?1:2,tag=index%2?'after':'before';writePNG(path.join(out,`${level}-${tag}-res${res}.png`),strip)
  compare.ctx.fillStyle='#e6e9ee';sheetLabel(compare.ctx,D,`${tag} ${res}x`,42,65+index*136);copyPixels(compare,res===1?doublePixels(strip):strip,100,30+index*136)
 }
 writePNG(path.join(out,`${level}-frames.png`),compare);return{frames}
}
export function stormStrips(out,{base='main',levels=STORM_LEVELS}={}){
 const started=performance.now(),D=load('Draw.js'),old=renderer(execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}).toString()),records=[]
 fs.mkdirSync(out,{recursive:true});const sheet=canvas(1072,888*levels.length+30,'#121822')
 for(const[row,level]of levels.entries())records.push({level,...stormStripScene(out,D,old,level,sheet,row)})
 writePNG(path.join(out,'contact-sheet.png'),sheet);fs.writeFileSync(path.join(out,'index.html'),stormReviewHTML(levels))
 const result={base,records,seconds:+((performance.now()-started)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
 console.log(JSON.stringify(stormStrips(path.resolve(arg('--out','shots/storms')),{base:arg('--base','main')})))
}
