#!/usr/bin/env node
// Real occupied journeys, small direct actor crops, one cached terrain per view.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {load,canvas,crop,writePNG,themeOf} from './render.js'
import {renderer,copyPixels,doublePixels} from './gag-art.js'
const S=load('Sim.js'),P=load('Palette.js'),ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export function occupiedLift(level=9,seed=3,res=2){
 const random=Math.random;let cosmetic=317
 try{
  Math.random=()=>((cosmetic=(Math.imul(cosmetic,1664525)+1013904223)>>>0)/4294967296)
  const w=S.generate(level,0,seed);w.res=res
  for(let tick=0;tick<12000&&!w.done;tick++){
   const lift=w.lifts?.find(L=>!L.stairs&&L.riders>0&&L.hold===0&&!L.parked)
   if(lift)return{w,lift}
   S.step(w)
  }
  throw Error('No occupied lift in 12000 ticks on level '+level)
 }finally{Math.random=random}
}
export function liftBox(w,L){
 return{x:Math.max(0,Math.min(320,Math.round(L.mid*w.k.CELL)-40)),
  y:Math.max(0,Math.min(184,Math.round(L.car*w.k.CELL)-42)),width:80,height:64}
}
export function liftFrame(D,w,L,cache={},theme='tokyo-night'){
 const res=w.res||1,pal=P.build(themeOf(theme).theme,w.level),box=liftBox(w,L),key=[w.terrainVersion,res,theme].join(':')
 if(cache.key!==key){
  cache.terrain=canvas(400*res,248*res,themeOf(theme).background)
  D.drawTerrain(cache.terrain.ctx,w,pal);cache.key=key
 }
 const img=crop(cache.terrain,box.x*res,box.y*res,box.width*res,box.height*res),set=img.ctx.setTransform.bind(img.ctx)
 img.ctx.setTransform=(a,b,c,d,e,f)=>set(a,b,c,d,e-box.x*res,f-box.y*res)
 D.drawActors(img.ctx,w,pal,{intro:false,feed:false});return img
}
export function journeyOffsets(L){
 const arrival=Math.ceil(Math.abs(L.stops[L.to]-L.car)/S.LIFT_SPEED)
 return[0,Math.floor(arrival/4),Math.floor(arrival/2),Math.floor(arrival*3/4),arrival,arrival+2,arrival+4,arrival+10]
}
function reviewHTML(levels){
 return `<!doctype html><meta charset="utf-8"><title>A little lift · before / after</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}.pair{display:flex;gap:24px;flex-wrap:wrap}.flip{width:320px;height:256px;background-size:2560px 256px;image-rendering:pixelated;animation:ride 1.2s steps(8) infinite}a{color:#7aa2f7}section{margin:32px 0}@keyframes ride{to{background-position:-2560px 0}}@media(prefers-reduced-motion:reduce){.flip{animation:none}}</style><h1>A little lift</h1><p>Real occupied journeys, seed 3. Four travel phases followed by arrival and its settling lamp; each crop follows the car. Eight selected poses, not equal time intervals.</p><p><a href="contact-sheet.png">All journeys · before / after</a></p>${levels.map(level=>`<section><h2>Skyscraper · level ${level}</h2><div class="pair">${['before','after'].map(tag=>`<div><p>${tag}</p><div class="flip" style="background-image:url(${level}-${tag}-res2.png)"></div></div>`).join('')}</div><a href="${level}-frames.png">Native and page-resolution frame sheet</a></section>`).join('')}`
}
export function liftStrips(out,{base='main',levels=[9,29,49]}={}){
 const started=performance.now(),D=load('Draw.js'),old=renderer(execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}).toString()),records=[]
 fs.mkdirSync(out,{recursive:true});const sheet=canvas(684,576*levels.length+30,'#121822')
 for(const[row,level]of levels.entries()){
  const{w,lift}=occupiedLift(level),at=w.ticks,offsets=journeyOffsets(lift),caches=[{},{},{},{}],strips=[1,1,2,2].map(res=>canvas(80*res*8,64*res))
  const frames=[]
  for(const[i,offset]of offsets.entries()){
   for(let n=0;w.ticks<at+offset&&n<100;n++)S.step(w)
   if(w.ticks!==at+offset)throw Error('Journey step bound')
   frames.push({tick:w.ticks,car:lift.car,hold:lift.hold,doorFor:lift.doorFor,riders:lift.riders,parked:lift.parked})
   for(const[ri,res]of[1,2].entries())for(const[vi,draw]of[old,D].entries()){
    w.res=res;const index=ri*2+vi,img=liftFrame(draw,w,lift,caches[index]);copyPixels(strips[index],img,i*img.W,0)
    if((i===1||i===6)&&res===2)copyPixels(sheet,doublePixels(img),20+vi*332,40+row*576+(i===6?288:0))
   }
  }
  const compare=canvas(1410,580,'#121822');compare.ctx.fillStyle='#e6e9ee';D.drawTransitionText(compare.ctx,`LEVEL ${level} - LOADED CAR AND REAL ARRIVAL`,705,8,1)
  sheet.ctx.fillStyle='#e6e9ee'
  D.drawTransitionText(sheet.ctx,`LEVEL ${level} - LOADED - BEFORE / AFTER`,342,15+row*576,1)
  D.drawTransitionText(sheet.ctx,`LEVEL ${level} - ARRIVED - BEFORE / AFTER`,342,303+row*576,1)
  for(const[index,strip]of strips.entries()){
   const res=index<2?1:2,tag=index%2?'after':'before';writePNG(path.join(out,`${level}-${tag}-res${res}.png`),strip)
   compare.ctx.fillStyle='#e6e9ee';D.drawTransitionText(compare.ctx,`${tag.toUpperCase()} ${res}X`,42,65+index*136,1)
   copyPixels(compare,res===1?doublePixels(strip):strip,100,30+index*136)
  }
  writePNG(path.join(out,`${level}-frames.png`),compare);records.push({level,startTick:at,offsets,frames})
 }
 writePNG(path.join(out,'contact-sheet.png'),sheet);fs.writeFileSync(path.join(out,'index.html'),reviewHTML(levels))
 const result={base,records,seconds:+((performance.now()-started)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
 console.log(JSON.stringify(liftStrips(path.resolve(arg('--out','shots/lift')),{base:arg('--base','main')})))
}
