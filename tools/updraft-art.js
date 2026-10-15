#!/usr/bin/env node
// Natural Cloud umbrella lifts; one seek and cached direct crops.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {load,canvas,crop,writePNG,themeOf} from './render.js'
import {renderer,copyPixels,doublePixels} from './gag-art.js'
import {sheetLabel} from './art-label.js'
const S=load('Sim.js'),P=load('Palette.js'),ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),sha=s=>createHash('sha256').update(s).digest('hex')
export const UPDRAFT_CASES=[{level:60,seed:3},{level:100,seed:3},{level:120,seed:3}]
export const UPDRAFT_OFFSETS=[0,4,8,12,16,20,24,28,32,40,48,64]
export function updraftScene(level=60,seed=3,res=2){
 const random=Math.random
 try{
  Math.random=()=>0.25;const w=S.generate(level,0,seed);w.res=res
  if(!w.updraftLift)throw Error('No Cloud lift on level '+level)
  for(let n=0;n<5000&&!w.done;n++){
   const a=w.agents.find(a=>!a.gone&&a.state==='fall'&&a.floater&&a.drafted&&w.updraft[Math.floor(a.x)])
   if(a)return{w,a,anchor:{x:a.x,y:a.y,id:a.id}}
   S.step(w)
  }
  throw Error('No natural updraft lift within 5000 live ticks on level '+level+' seed '+seed)
 }finally{Math.random=random}
}
export function updraftAdvance(w,count){
 const random=Math.random
 try{Math.random=()=>0.25;for(let n=0;n<count;n++)S.step(w)}finally{Math.random=random}
}

export function updraftBox(w,d){return{x:Math.max(0,Math.min(272,Math.round(d.x*4)-64)),y:Math.max(0,Math.min(184,Math.round((d.y+1)*4)-44)),width:128,height:64}}
export function updraftFrame(D,w,d,cache={},theme='tokyo-night'){
 const res=w.res||1,pal=P.build(themeOf(theme).theme,w.level),box=updraftBox(w,d),key=[w.terrainVersion,res,theme].join(':')
 if(cache.key!==key){cache.terrain=canvas(400*res,248*res,themeOf(theme).background);D.drawTerrain(cache.terrain.ctx,w,pal);cache.key=key}
 const img=crop(cache.terrain,box.x*res,box.y*res,box.width*res,box.height*res),set=img.ctx.setTransform.bind(img.ctx)
 img.ctx.setTransform=(a,b,c,d,e,f)=>set(a,b,c,d,e-box.x*res,f-box.y*res)
 D.drawActors(img.ctx,w,pal,{intro:false,feed:false});return img
}
function updraftReviewHTML(cases,contact,stamp){
 return `<!doctype html><meta charset="utf-8"><title>A little lift · before / after</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}.pair{display:flex;gap:24px;flex-wrap:wrap}.flip{width:512px;height:256px;background-size:6144px 256px;image-rendering:pixelated;animation:updraft 3s steps(12) infinite}a{color:#7aa2f7}section{margin:32px 0}@keyframes updraft{to{background-position:-6144px 0}}@media(prefers-reduced-motion:reduce){.flip{animation:none}}</style><h1>A little lift.</h1><p>Natural umbrella lifts and rising curls. Twelve poses get equal review time; exact simulation ticks are in the manifest.</p><p>Review ${stamp}: <a href="${contact}">current contact sheet</a> · <a href="manifest.json">source and image hashes</a></p>${cases.map(({level,seed})=>`<section><h2>Level ${level} · seed ${seed}</h2><div class="pair">${['before','after'].map(tag=>`<div><p>${tag}</p><div class="flip" style="background-image:url(${level}-${seed}-${tag}-res2.png?v=${stamp})"></div></div>`).join('')}</div><a href="${level}-${seed}-frames.png?v=${stamp}">Native and page frame sheet</a></section>`).join('')}`
}
function updraftStripScene(out,D,old,info,sheet,row){
 const{w,a,anchor:d}=updraftScene(info.level,info.seed),offsets=UPDRAFT_OFFSETS,caches=[{},{},{},{}],strips=[1,1,2,2].map(res=>canvas(128*res*12,64*res)),frames=[]
 const compare=canvas(3184,576,'#121822');compare.ctx.fillStyle='#e6e9ee';sheetLabel(compare.ctx,D,`Level ${info.level} seed ${info.seed} - natural updraft`,1592,8)
 let age=0
 for(let frame=0;frame<offsets.length;frame++){
  updraftAdvance(w,offsets[frame]-age);age=offsets[frame]
  frames.push({tick:w.ticks,age,id:a.id,x:a.x,y:a.y,state:a.state,floater:a.floater,inDraft:!!w.updraft[Math.floor(a.x)]})
  for(const[ri,res]of[1,2].entries())for(const[vi,draw]of[old,D].entries()){
   w.res=res;const index=ri*2+vi,img=updraftFrame(draw,w,d,caches[index]);copyPixels(strips[index],img,frame*img.W,0)
   const key=[0,5,9].indexOf(frame);if(key>=0&&res===2)copyPixels(sheet,doublePixels(img),16+vi*528,40+(row*3+key)*296)
  }
 }
 for(let key=0;key<3;key++){sheet.ctx.fillStyle='#e6e9ee';sheetLabel(sheet.ctx,D,`Level ${info.level} seed ${info.seed} - ${['catching air','hanging on','drifting down'][key]} - before / after`,536,15+(row*3+key)*296)}
 for(const[index,strip]of strips.entries()){
  const res=index<2?1:2,tag=index%2?'after':'before';writePNG(path.join(out,`${info.level}-${info.seed}-${tag}-res${res}.png`),strip)
  compare.ctx.fillStyle='#e6e9ee';sheetLabel(compare.ctx,D,`${tag} ${res}x`,42,65+index*136);copyPixels(compare,res===1?doublePixels(strip):strip,100,30+index*136)
 }
 writePNG(path.join(out,`${info.level}-${info.seed}-frames.png`),compare);return{...info,offsets,frames}
}
export function updraftStrips(out,{base='main',cases=UPDRAFT_CASES}={}){
 const started=performance.now(),source=fs.readFileSync(path.join(ROOT,'public/agents/Draw.js')),
  stamp=sha(Buffer.concat([source,fs.readFileSync(fileURLToPath(import.meta.url)),Buffer.from(base+JSON.stringify(cases))])).slice(0,8),
  D=load('Draw.js'),old=renderer(execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}).toString()),records=[]
 fs.mkdirSync(out,{recursive:true});const sheet=canvas(1072,888*cases.length+30,'#121822')
 for(const[row,info]of cases.entries())records.push(updraftStripScene(out,D,old,info,sheet,row))
 const contact=`contact-sheet-${stamp}.png`;writePNG(path.join(out,'contact-sheet.png'),sheet);writePNG(path.join(out,contact),sheet)
 fs.writeFileSync(path.join(out,'index.html'),updraftReviewHTML(cases,contact,stamp))
 const result={base,drawSHA256:sha(source),review:stamp,contactSheet:contact,contactSHA256:sha(fs.readFileSync(path.join(out,contact))),records,seconds:+((performance.now()-started)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
 console.log(JSON.stringify(updraftStrips(path.resolve(arg('--out','shots/updrafts')),{base:arg('--base','main')})))
}
