#!/usr/bin/env node
// Natural aisle crossings: one bounded seek, cached terrain, direct actor crops.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {load,canvas,crop,writePNG,themeOf} from './render.js'
import {renderer,copyPixels,doublePixels} from './gag-art.js'
import {sheetLabel} from './art-label.js'
const S=load('Sim.js'),P=load('Palette.js'),ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export const AISLE_LEVELS=[72,32,52]
export function aisleScene(level=72,index=0,res=2){
 const random=Math.random;let cosmetic=317
 try{
  Math.random=()=>((cosmetic=(Math.imul(cosmetic,1664525)+1013904223)>>>0)/4294967296)
  const w=S.generate(level,0,3);w.res=res;const aisle=w.aisles[index]
  if(!aisle)throw Error('No aisle '+index+' on level '+level)
  for(let n=0;n<12000&&!w.done;n++){
   if(w.agents.some(a=>!a.gone&&a.state==='walk'&&a.y===aisle.y&&a.x>=aisle.x0&&a.x<aisle.x1&&S.aisleUnder(w,a)))return{w,aisle}
   S.step(w)
  }
  throw Error('No natural aisle crossing within 12000 live ticks on level '+level)
 }finally{Math.random=random}
}
export function aisleAdvance(w,count=6){
 const random=Math.random
 try{Math.random=()=>0.25;for(let n=0;n<count;n++)S.step(w)}finally{Math.random=random}
}
export function aisleBox(w,a){
 return{x:Math.max(0,Math.min(272,Math.round((a.x0+a.x1)*2)-64)),y:Math.max(0,Math.min(184,(a.y+1)*4-36)),width:128,height:64}
}
export function aisleFrame(D,w,a,cache={},theme='tokyo-night'){
 const res=w.res||1,pal=P.build(themeOf(theme).theme,w.level),box=aisleBox(w,a),key=[w.terrainVersion,res,theme].join(':')
 if(cache.key!==key){cache.terrain=canvas(400*res,248*res,themeOf(theme).background);D.drawTerrain(cache.terrain.ctx,w,pal);cache.key=key}
 const img=crop(cache.terrain,box.x*res,box.y*res,box.width*res,box.height*res),set=img.ctx.setTransform.bind(img.ctx)
 img.ctx.setTransform=(a,b,c,d,e,f)=>set(a,b,c,d,e-box.x*res,f-box.y*res)
 D.drawActors(img.ctx,w,pal,{intro:false,feed:false});return img
}
function thermalReviewHTML(levels){
 return `<!doctype html><meta charset="utf-8"><title>Climate controlled colleagues · before / after</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}.pair{display:flex;gap:24px;flex-wrap:wrap}.flip{width:512px;height:256px;background-size:4096px 256px;image-rendering:pixelated;animation:air 1.6s steps(8) infinite}a{color:#7aa2f7}section{margin:32px 0}@keyframes air{to{background-position:-4096px 0}}@media(prefers-reduced-motion:reduce){.flip{animation:none}}</style><h1>Climate controlled colleagues</h1><p>Natural seed-3 crossings, eight six-tick frames. Warm exhaust rises; cold intake falls. The simulation and walking pace are unchanged.</p><p><a href="contact-sheet.png">Entry and 24 ticks later</a></p>${levels.map(level=>`<section><h2>Data Center ${level}</h2><div class="pair">${['before','after'].map(tag=>`<div><p>${tag}</p><div class="flip" style="background-image:url(${level}-${tag}-res2.png)"></div></div>`).join('')}</div><a href="${level}-frames.png">Native and page frame sheet</a></section>`).join('')}`
}
function thermalStripsScene(out,D,old,level,sheet,row){
 const{w,aisle}=aisleScene(level),caches=[{},{},{},{}],strips=[1,1,2,2].map(res=>canvas(128*res*8,64*res)),frames=[]
 for(let frame=0;frame<8;frame++){
  if(frame)aisleAdvance(w)
  frames.push({tick:w.ticks,walkers:w.agents.filter(a=>!a.gone&&a.state==='walk'&&a.y===aisle.y&&a.x>=aisle.x0&&a.x<aisle.x1).map(a=>({id:a.id,x:a.x,air:S.aisleUnder(w,a)}))})
  for(const[ri,res]of[1,2].entries())for(const[vi,draw]of[old,D].entries()){
   w.res=res;const index=ri*2+vi,img=aisleFrame(draw,w,aisle,caches[index]);copyPixels(strips[index],img,frame*img.W,0)
   if((frame===0||frame===4)&&res===2)copyPixels(sheet,doublePixels(img),16+vi*528,40+row*592+(frame===4?296:0))
  }
 }
 const compare=canvas(2160,576,'#121822');compare.ctx.fillStyle='#e6e9ee';sheetLabel(compare.ctx,D,`Data Center ${level} - natural crossing`,1080,8)
 sheet.ctx.fillStyle='#e6e9ee';sheetLabel(sheet.ctx,D,`Data Center ${level} - entry - before / after`,536,15+row*592);sheetLabel(sheet.ctx,D,`Data Center ${level} - 24 ticks - before / after`,536,311+row*592)
 for(const[index,strip]of strips.entries()){
  const res=index<2?1:2,tag=index%2?'after':'before';writePNG(path.join(out,`${level}-${tag}-res${res}.png`),strip)
  compare.ctx.fillStyle='#e6e9ee';sheetLabel(compare.ctx,D,`${tag} ${res}x`,42,65+index*136);copyPixels(compare,res===1?doublePixels(strip):strip,100,30+index*136)
 }
 writePNG(path.join(out,`${level}-frames.png`),compare)
 return{frames,hotFirst:aisle.hotFirst,x0:aisle.x0,mid:aisle.mid,x1:aisle.x1}
}
export function aisleStrips(out,{base='main',levels=AISLE_LEVELS}={}){
 const started=performance.now(),D=load('Draw.js'),old=renderer(execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}).toString()),records=[]
 fs.mkdirSync(out,{recursive:true});const sheet=canvas(1072,592*levels.length+30,'#121822')
 for(const[row,level]of levels.entries()){const rec=thermalStripsScene(out,D,old,level,sheet,row);records.push({level,...rec})}
 writePNG(path.join(out,'contact-sheet.png'),sheet);fs.writeFileSync(path.join(out,'index.html'),thermalReviewHTML(levels))
 const result={base,records,seconds:+((performance.now()-started)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
 console.log(JSON.stringify(aisleStrips(path.resolve(arg('--out','shots/aisles')),{base:arg('--base','main')})))
}
