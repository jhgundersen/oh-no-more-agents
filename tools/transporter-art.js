#!/usr/bin/env node
// Natural beaming events, cached terrain and direct crops at both ends.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {load,canvas,crop,writePNG,themeOf} from './render.js'
import {renderer,copyPixels,doublePixels} from './gag-art.js'
import {sheetLabel} from './art-label.js'
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),S=load('Sim.js'),P=load('Palette.js'),sha=b=>createHash('sha256').update(b).digest('hex')
export const TRANSPORT_CASES=[27,87,107]
export const TRANSPORT_PHASES=[0,2,4,6,9,12,18,24]
export function transporterScene(level=27,seed=3){
 const random=Math.random
 try{Math.random=()=>.25;const w=S.generate(level,0,seed);w.res=2
 for(let n=0;n<4000&&!w.done;n++){S.step(w);const p=w.pads.find(p=>!p.tube&&p.usedAt===w.ticks);if(p)return{w,p}}
 throw Error('No natural transporter use within 4000 ticks on level '+level)
 }finally{Math.random=random}
}
export function transporterAdvance(w,ticks){const random=Math.random;try{Math.random=()=>.25;for(let i=0;i<ticks;i++)S.step(w)}finally{Math.random=random}}
export function transporterBox(w,p,receiver=false){const x=receiver?p.bx:p.ax,y=receiver?p.by:p.ay;return{x:Math.max(0,Math.min(304,(x+.5)*4-48)),y:Math.max(0,Math.min(184,(y+1)*4-44)),width:96,height:64}}
export function transporterFrame(D,w,p,receiver=false,cache={},theme='tokyo-night'){
 const res=w.res||1,box=transporterBox(w,p,receiver),pal=P.build(themeOf(theme).theme,w.level),key=[w.terrainVersion,res,theme].join(':')
 if(cache.key!==key){cache.terrain=canvas(400*res,248*res,themeOf(theme).background);D.drawTerrain(cache.terrain.ctx,w,pal);cache.key=key}
 const img=crop(cache.terrain,box.x*res,box.y*res,96*res,64*res),set=img.ctx.setTransform.bind(img.ctx)
 img.ctx.setTransform=(a,b,c,d,e,f)=>set(a,b,c,d,e-box.x*res,f-box.y*res)
 D.drawActors(img.ctx,w,pal,{intro:false,feed:false});return img
}
function transporterStrips(out,D,old,level,sheet,row){
 const{w,p}=transporterScene(level),start=w.ticks,caches=Array.from({length:4},()=>({})),strips=Array.from({length:8},(_,i)=>canvas(96*(i<4?1:2)*8,64*(i<4?1:2))),records=[]
 let offset=0
 for(const[frame,age]of TRANSPORT_PHASES.entries()){
  transporterAdvance(w,age-offset);offset=age;records.push({tick:w.ticks,usedAt:p.usedAt,who:p.who,age:w.ticks-p.usedAt})
  for(const[ri,res]of[1,2].entries())for(const[vi,draw]of[old,D].entries())for(const[side,receiver]of[false,true].entries()){
   w.res=res;const index=ri*4+side*2+vi,img=transporterFrame(draw,w,p,receiver,caches[ri*2+vi]);copyPixels(strips[index],img,frame*img.W,0)
   if(res===2&&frame===2)copyPixels(sheet,doublePixels(img),16+vi*400,36+(row*2+side)*288)
  }
 }
 for(const[index,strip]of strips.entries()){const res=index<4?1:2,side=Math.floor(index%4/2)?'arrival':'departure',tag=index%2?'after':'before';writePNG(path.join(out,`${level}-${side}-${tag}-res${res}.png`),strip)}
 for(const[side,label]of['DEPARTURE','ARRIVAL'].entries()){sheet.ctx.fillStyle='#e6e9ee';sheetLabel(sheet.ctx,D,`LEVEL ${level} - ${label} - BEFORE / AFTER`,408,12+(row*2+side)*288)}
 return{level,start,records,pad:{ax:p.ax,ay:p.ay,bx:p.bx,by:p.by}}
}
function transporterHTML(levels,contact,stamp){return `<!doctype html><meta charset="utf-8"><title>Energise - transporters</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}a{color:#7aa2f7}.pair{display:flex;gap:24px;flex-wrap:wrap}.film{width:288px;height:192px;background-size:2304px 192px;image-rendering:pixelated;animation:beam 2s steps(8) infinite}section{margin:32px 0}@keyframes beam{to{background-position:-2304px 0}}@media(prefers-reduced-motion:reduce){.film{animation:none}}</style><h1>Energise.</h1><p>Natural seed-3 uses. Both ends, before / after, eight real offsets (including later passengers when they arrive). Motion below is a review loop; reduced motion holds it still.</p><p><a href="${contact}">Current contact sheet</a> · <a href="manifest.json">Source/image hashes</a></p>${levels.map(level=>['departure','arrival'].map(side=>`<section><h2>Level ${level} · ${side}</h2><div class="pair">${['before','after'].map(tag=>`<div><p>${tag}</p><div class="film" style="background-image:url(${level}-${side}-${tag}-res2.png?v=${stamp})"></div><p><a href="${level}-${side}-${tag}-res1.png">Native strip</a> · <a href="${level}-${side}-${tag}-res2.png">Page strip</a></p></div>`).join('')}</div></section>`).join('')).join('')}`}
export function transporterReview(out,{base='5822e88',levels=TRANSPORT_CASES}={}){
 const start=performance.now(),source=fs.readFileSync(path.join(ROOT,'public/agents/Draw.js')),oldSource=execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}),D=load('Draw.js'),old=renderer(oldSource.toString()),sheet=canvas(816,levels.length*576+20,'#121822')
 fs.mkdirSync(out,{recursive:true});const rows=levels.map((level,i)=>transporterStrips(out,D,old,level,sheet,i)),stamp=sha(Buffer.concat([source,oldSource,fs.readFileSync(fileURLToPath(import.meta.url)),Buffer.from(JSON.stringify(levels))])).slice(0,8),contact=`contact-sheet-${stamp}.png`
 writePNG(path.join(out,contact),sheet);writePNG(path.join(out,'contact-sheet.png'),sheet);fs.writeFileSync(path.join(out,'index.html'),transporterHTML(levels,contact,stamp))
 const files=levels.flatMap(level=>['departure','arrival'].flatMap(side=>['before','after'].flatMap(tag=>[1,2].map(res=>`${level}-${side}-${tag}-res${res}.png`)))).concat([contact,'contact-sheet.png']),images=Object.fromEntries(files.map(f=>[f,sha(fs.readFileSync(path.join(out,f)))])),result={base,drawSHA256:sha(source),beforeSHA256:sha(oldSource),contactSheet:contact,contactSHA256:images[contact],rows,images,seconds:+((performance.now()-start)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(transporterReview(path.resolve(process.argv[2]||'shots/transporters'))))
