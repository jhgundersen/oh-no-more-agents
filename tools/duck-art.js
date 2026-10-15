#!/usr/bin/env node
// Natural rubber-duck drop, pickup and explanation; no forced gameplay poses.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {load,canvas,crop,writePNG,themeOf} from './render.js'
import {renderer,copyPixels,doublePixels} from './gag-art.js'
import {sheetLabel} from './art-label.js'
const S=load('Sim.js'),P=load('Palette.js'),ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=s=>createHash('sha256').update(s).digest('hex')
export const DUCK_CASES=[{level:13,seed:11,pickup:3},{level:12,seed:11,pickup:5},{level:7,seed:11,pickup:18}]
export function duckScene(level=13,seed=11,res=2){
 const random=Math.random
 try{
  Math.random=()=>0.25;const w=S.generate(level,0,seed);w.res=res
  for(let n=0;n<5000&&!w.done;n++){if(w.duck)return{w,d:w.duck};S.step(w)}
  throw Error('No natural duck within 5000 live ticks on level '+level+' seed '+seed)
 }finally{Math.random=random}
}
export function duckAdvance(w,count){
 const random=Math.random
 try{Math.random=()=>0.25;for(let n=0;n<count;n++)S.step(w)}finally{Math.random=random}
}
export function duckOffsets(info){const p=info.pickup;return[0,2,p,p+8,p+16,p+22,p+30,p+34,p+38,p+44,p+48,p+52]}
export function duckBox(w,d){return{x:Math.max(0,Math.min(272,Math.round(d.x*4)-64)),y:Math.max(0,Math.min(184,(d.y+1)*4-44)),width:128,height:64}}
export function duckFrame(D,w,d,cache={},theme='tokyo-night'){
 const res=w.res||1,pal=P.build(themeOf(theme).theme,w.level),box=duckBox(w,d),key=[w.terrainVersion,res,theme].join(':')
 if(cache.key!==key){cache.terrain=canvas(400*res,248*res,themeOf(theme).background);D.drawTerrain(cache.terrain.ctx,w,pal);cache.key=key}
 const img=crop(cache.terrain,box.x*res,box.y*res,box.width*res,box.height*res),set=img.ctx.setTransform.bind(img.ctx)
 img.ctx.setTransform=(a,b,c,d,e,f)=>set(a,b,c,d,e-box.x*res,f-box.y*res)
 D.drawActors(img.ctx,w,pal,{intro:false,feed:false});return img
}
function duckReviewHTML(cases,contact,stamp){
 return `<!doctype html><meta charset="utf-8"><title>A good listener · before / after</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}.pair{display:flex;gap:24px;flex-wrap:wrap}.flip{width:512px;height:256px;background-size:6144px 256px;image-rendering:pixelated;animation:duck 3s steps(12) infinite}a{color:#7aa2f7}section{margin:32px 0}@keyframes duck{to{background-position:-6144px 0}}@media(prefers-reduced-motion:reduce){.flip{animation:none}}</style><h1>A good listener.</h1><p>Natural drops, pickups, explanations and the answer. Twelve poses get equal review time; exact simulation ticks are in the manifest.</p><p>Review ${stamp}: <a href="${contact}">current contact sheet</a> · <a href="manifest.json">source and image hashes</a></p>${cases.map(({level,seed})=>`<section><h2>Level ${level} · seed ${seed}</h2><div class="pair">${['before','after'].map(tag=>`<div><p>${tag}</p><div class="flip" style="background-image:url(${level}-${seed}-${tag}-res2.png?v=${stamp})"></div></div>`).join('')}</div><a href="${level}-${seed}-frames.png?v=${stamp}">Native and page frame sheet</a></section>`).join('')}`
}
function duckStripScene(out,D,old,info,sheet,row){
 const{w,d}=duckScene(info.level,info.seed),offsets=duckOffsets(info),caches=[{},{},{},{}],strips=[1,1,2,2].map(res=>canvas(128*res*12,64*res)),frames=[]
 const compare=canvas(3184,576,'#121822');compare.ctx.fillStyle='#e6e9ee';sheetLabel(compare.ctx,D,`Level ${info.level} seed ${info.seed} - natural duck`,1592,8)
 let age=0
 for(let frame=0;frame<offsets.length;frame++){
  duckAdvance(w,offsets[frame]-age);age=offsets[frame];const a=w.agents.find(a=>a.id===d.takenBy)
  frames.push({tick:w.ticks,age,visible:!!w.duck,takenBy:d.takenBy,explainFor:a?.explainFor||0,dir:a?.dir||0})
  for(const[ri,res]of[1,2].entries())for(const[vi,draw]of[old,D].entries()){
   w.res=res;const index=ri*2+vi,img=duckFrame(draw,w,d,caches[index]);copyPixels(strips[index],img,frame*img.W,0)
   const key=[0,3,7].indexOf(frame);if(key>=0&&res===2)copyPixels(sheet,doublePixels(img),16+vi*528,40+(row*3+key)*296)
  }
 }
 for(let key=0;key<3;key++){sheet.ctx.fillStyle='#e6e9ee';sheetLabel(sheet.ctx,D,`Level ${info.level} seed ${info.seed} - ${['drop','listening','OH!'][key]} - before / after`,536,15+(row*3+key)*296)}
 for(const[index,strip]of strips.entries()){
  const res=index<2?1:2,tag=index%2?'after':'before';writePNG(path.join(out,`${info.level}-${info.seed}-${tag}-res${res}.png`),strip)
  compare.ctx.fillStyle='#e6e9ee';sheetLabel(compare.ctx,D,`${tag} ${res}x`,42,65+index*136);copyPixels(compare,res===1?doublePixels(strip):strip,100,30+index*136)
 }
 writePNG(path.join(out,`${info.level}-${info.seed}-frames.png`),compare);return{...info,offsets,frames}
}
export function duckStrips(out,{base='main',cases=DUCK_CASES}={}){
 const started=performance.now(),source=fs.readFileSync(path.join(ROOT,'public/agents/Draw.js')),
  stamp=sha(Buffer.concat([source,fs.readFileSync(fileURLToPath(import.meta.url)),Buffer.from(base+JSON.stringify(cases))])).slice(0,8),
  D=load('Draw.js'),old=renderer(execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}).toString()),records=[]
 fs.mkdirSync(out,{recursive:true});const sheet=canvas(1072,888*cases.length+30,'#121822')
 for(const[row,info]of cases.entries())records.push(duckStripScene(out,D,old,info,sheet,row))
 const contact=`contact-sheet-${stamp}.png`;writePNG(path.join(out,'contact-sheet.png'),sheet);writePNG(path.join(out,contact),sheet)
 fs.writeFileSync(path.join(out,'index.html'),duckReviewHTML(cases,contact,stamp))
 const result={base,drawSHA256:sha(source),review:stamp,contactSheet:contact,contactSHA256:sha(fs.readFileSync(path.join(out,contact))),records,seconds:+((performance.now()-started)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
 console.log(JSON.stringify(duckStrips(path.resolve(arg('--out','shots/ducks')),{base:arg('--base','main')})))
}
