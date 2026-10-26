#!/usr/bin/env node
// Natural rescues, one bounded seek per layout, cached terrain and direct crops.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {load,canvas,crop,writePNG,themeOf} from './render.js'
import {renderer,copyPixels,doublePixels} from './gag-art.js'
import {sheetLabel} from './art-label.js'
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),S=load('Sim.js'),P=load('Palette.js'),sha=b=>createHash('sha256').update(b).digest('hex')
export const THAW_CASES=[6,46],THAW_PHASES=[0,8,10,12,16,20,26,37,40]
export function thawAdvance(w,ticks){const random=Math.random;try{Math.random=()=>.25;for(let i=0;i<ticks;i++)S.step(w)}finally{Math.random=random}}
export function thawScene(level=6,seed=3){
 const random=Math.random
 try{Math.random=()=>.25;let w=S.generate(level,0,seed);w.res=2
 if(!w.frozen.length)throw Error('No frozen colleagues on level '+level)
 for(let n=0;n<4000&&!w.done;n++){
  S.step(w);const index=w.frozen.findIndex(f=>f.thawedAt===w.ticks)
  if(index<0)continue
  const thawTick=w.ticks;w=S.generate(level,0,seed);w.res=2;thawAdvance(w,Math.max(0,thawTick-8));return{w,f:w.frozen[index],thawTick}
 }
 throw Error('No natural thaw within 4000 ticks on level '+level)
 }finally{Math.random=random}
}
export function thawBox(w,f){return{x:Math.max(0,Math.min(304,(f.x+.5)*4-48)),y:Math.max(0,Math.min(184,(f.y+1)*4-44)),width:96,height:64}}
export function thawFrame(D,w,f,cache={},theme='tokyo-night'){
 const res=w.res||1,box=thawBox(w,f),pal=P.build(themeOf(theme).theme,w.level),key=[w.terrainVersion,res,theme].join(':')
 if(cache.key!==key){cache.terrain=canvas(400*res,248*res,themeOf(theme).background);D.drawTerrain(cache.terrain.ctx,w,pal);cache.key=key}
 const img=crop(cache.terrain,box.x*res,box.y*res,96*res,64*res),set=img.ctx.setTransform.bind(img.ctx)
 img.ctx.setTransform=(a,b,c,d,e,f)=>set(a,b,c,d,e-box.x*res,f-box.y*res)
 D.drawActors(img.ctx,w,pal,{intro:false,feed:false});return img
}
function thawStrips(out,D,old,level,sheet,row){
 const{w,f,thawTick}=thawScene(level),start=w.ticks,caches=Array.from({length:4},()=>({})),strips=[1,1,2,2].map(res=>canvas(96*res*THAW_PHASES.length,64*res)),records=[]
 let offset=0
 for(const[frame,age]of THAW_PHASES.entries()){
  thawAdvance(w,age-offset);offset=age;records.push({tick:w.ticks,thawedAt:f.thawedAt,age:w.ticks-thawTick,released:w.released})
  for(const[ri,res]of[1,2].entries())for(const[vi,draw]of[old,D].entries()){
   w.res=res;const index=ri*2+vi,img=thawFrame(draw,w,f,caches[index]);copyPixels(strips[index],img,frame*img.W,0)
   if(res===2&&[0,3,6].includes(frame))copyPixels(sheet,doublePixels(img),16+vi*400,36+(row*3+[0,3,6].indexOf(frame))*288)
  }
 }
 for(const[index,strip]of strips.entries())writePNG(path.join(out,`${level}-${index%2?'after':'before'}-res${index<2?1:2}.png`),strip)
 for(const[stage,label]of['FROZEN','RELEASE','SETTLING'].entries()){sheet.ctx.fillStyle='#e6e9ee';sheetLabel(sheet.ctx,D,`LEVEL ${level} - ${label} - BEFORE / AFTER`,408,12+(row*3+stage)*288)}
 return{level,start,thawTick,frozen:{x:f.x,y:f.y,dir:f.dir},records}
}
function thawHTML(levels,contact,stamp){return `<!doctype html><meta charset="utf-8"><title>Cold storage - rescues</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}a{color:#7aa2f7}.pair{display:flex;gap:24px;flex-wrap:wrap}.film{width:288px;height:192px;background-size:2592px 192px;image-rendering:pixelated;animation:thaw 3s steps(9) infinite}section{margin:32px 0}@keyframes thaw{to{background-position:-2592px 0}}@media(prefers-reduced-motion:reduce){.film{animation:none}}</style><h1>Cold storage.</h1><p>Natural seed-3 rescues, from eight ticks before release through the fading shards. Equal review time per pose; real ticks in the manifest. Reduced motion holds this review still.</p><p><a href="${contact}">Current contact sheet</a> · <a href="manifest.json">Source/image hashes</a></p>${levels.map(level=>`<section><h2>Level ${level}</h2><div class="pair">${['before','after'].map(tag=>`<div><p>${tag}</p><div class="film" style="background-image:url(${level}-${tag}-res2.png?v=${stamp})"></div><p><a href="${level}-${tag}-res1.png">Native strip</a> · <a href="${level}-${tag}-res2.png">Page strip</a></p></div>`).join('')}</div></section>`).join('')}`}
export function thawReview(out,{base='44ef025',levels=THAW_CASES}={}){
 const start=performance.now(),source=fs.readFileSync(path.join(ROOT,'public/agents/Draw.js')),oldSource=execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}),D=load('Draw.js'),old=renderer(oldSource.toString()),sheet=canvas(816,levels.length*864+20,'#121822')
 fs.mkdirSync(out,{recursive:true});const rows=levels.map((level,i)=>thawStrips(out,D,old,level,sheet,i)),stamp=sha(Buffer.concat([source,oldSource,fs.readFileSync(fileURLToPath(import.meta.url)),Buffer.from(JSON.stringify(levels))])).slice(0,8),contact=`contact-sheet-${stamp}.png`
 writePNG(path.join(out,contact),sheet);writePNG(path.join(out,'contact-sheet.png'),sheet);fs.writeFileSync(path.join(out,'index.html'),thawHTML(levels,contact,stamp))
 const files=levels.flatMap(level=>['before','after'].flatMap(tag=>[1,2].map(res=>`${level}-${tag}-res${res}.png`))).concat([contact,'contact-sheet.png']),images=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(out,f)))])),result={base,drawSHA256:sha(source),beforeSHA256:sha(oldSource),contactSheet:contact,contactSHA256:images[contact],rows,images,seconds:+((performance.now()-start)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(thawReview(path.resolve(process.argv[2]||'shots/thaws'))))
