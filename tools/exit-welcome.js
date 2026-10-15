#!/usr/bin/env node
// Real first arrivals, cached terrain, and actor painting directly into crops.
// node tools/exit-welcome.js --base <ref> --out /tmp/exit-welcome
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {load,canvas,crop,writePNG,themeOf} from './render.js'
import {renderer,copyPixels,doublePixels} from './gag-art.js'
const S=load('Sim.js'),P=load('Palette.js'),ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export const HOME_AGES=[0,2,4,6,8,10,12,16]
export function arrivalWorld(level=1,seed=3,res=2){
 const random=Math.random;let cosmetic=317
 try{
  Math.random=()=>((cosmetic=(Math.imul(cosmetic,1664525)+1013904223)>>>0)/4294967296)
  const w=S.generate(level,0,seed);w.res=res
  for(let i=0;i<12000&&!w.saved&&!w.done;i++)S.step(w)
  if(!w.saved)throw Error('No first arrival within 12000 ticks on level '+level)
  return w
 }finally{Math.random=random}
}
export function welcomeBox(w){
 const C=w.k.CELL
 return{x:Math.max(0,Math.min(w.k.COLS*C-96,Math.round((w.exit.x+w.exit.w/2)*C)-48)),
  y:Math.max(0,Math.min(w.k.ROWS*C-72,w.exit.y*C-18)),width:96,height:72}
}
export function welcomeFrame(D,w,cache={},theme='tokyo-night'){
 const res=w.res||1,pal=P.build(themeOf(theme).theme,w.level),box=welcomeBox(w)
 if(cache.version!==w.terrainVersion){
  cache.terrain=canvas(w.k.COLS*w.k.CELL*res,w.k.ROWS*w.k.CELL*res,themeOf(theme).background)
  D.drawTerrain(cache.terrain.ctx,w,pal);cache.version=w.terrainVersion
 }
 const img=crop(cache.terrain,box.x*res,box.y*res,box.width*res,box.height*res),set=img.ctx.setTransform.bind(img.ctx)
 img.ctx.setTransform=(a,b,c,d,e,f)=>set(a,b,c,d,e-box.x*res,f-box.y*res)
 D.drawActors(img.ctx,w,pal,{intro:false,feed:false})
 return img
}
function reviewHTML(levels){
 return `<!doctype html><meta charset="utf-8"><title>Welcome home · exits</title><style>body{background:#121822;color:#e6e9ee;font:16px monospace;margin:24px}.pair{display:flex;gap:24px;flex-wrap:wrap}.flip{width:384px;height:288px;background-size:3072px 288px;image-rendering:pixelated;animation:home .6s steps(8) infinite}a{color:#7aa2f7}section{margin:32px 0}@keyframes home{to{background-position:-3072px 0}}@media(prefers-reduced-motion:reduce){.flip{animation:none}}</style><h1>Welcome home · before / after</h1><p>Real first arrivals, seed 3. Eight selected phases, enlarged for inspection. Native and page sheets preserve their pixels.</p><p><a href="contact-sheet.png">All biomes · before / after</a></p>${levels.map(level=>`<section><h2>${S.BIOMES[level-1]}</h2><div class="pair">${['before','after'].map(tag=>`<div><p>${tag}</p><div class="flip" style="background-image:url(${level}-${tag}-res2.png)"></div></div>`).join('')}</div><a href="${level}-frames.png">Native and page-resolution frame sheet</a></section>`).join('')}`
}
export function welcomeStrips(out,{base='main',levels=S.BIOMES.map((_,i)=>i+1)}={}){
 const started=performance.now(),D=load('Draw.js'),old=renderer(execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}).toString())
 fs.mkdirSync(out,{recursive:true});const sheet=canvas(824,194*Math.ceil(levels.length/2)+30,'#121822'),records=[]
 sheet.ctx.fillStyle='#e6e9ee';D.drawTransitionText(sheet.ctx,'WELCOME HOME - BEFORE / AFTER - SEED 3',412,9,1)
 for(const[row,level]of levels.entries()){
  const w=arrivalWorld(level),at=w.ticks,comparison=canvas(1648,4*154+28,'#121822'),caches=[{},{},{},{}],strips=[1,1,2,2].map(res=>canvas(96*res*8,72*res))
  const first=w.agents.find(a=>!a.gone&&a.state==='saved'),saved=w.saved
  D.drawTransitionText(comparison.ctx,w.biome.toUpperCase(),824,5,1)
  for(const[i,age]of HOME_AGES.entries()){
   for(let step=0;w.ticks<at+age&&step<20;step++)S.step(w)
   for(const[ri,res]of[1,2].entries())for(const[vi,draw]of[old,D].entries()){
    w.res=res;const index=ri*2+vi,img=welcomeFrame(draw,w,caches[index]);copyPixels(strips[index],img,i*img.W,0)
    if(i===2&&res===2)copyPixels(sheet,img,20+(row%2)*402+vi*198,56+Math.floor(row/2)*194)
   }
  }
  sheet.ctx.fillStyle='#e6e9ee';D.drawTransitionText(sheet.ctx,w.biome.toUpperCase(),212+(row%2)*402,37+Math.floor(row/2)*194,1)
  for(const[index,strip]of strips.entries()){
   const res=index<2?1:2,tag=index%2?'after':'before';writePNG(path.join(out,`${level}-${tag}-res${res}.png`),strip)
   comparison.ctx.fillStyle='#e6e9ee';D.drawTransitionText(comparison.ctx,`${tag.toUpperCase()} ${res}X`,40,47+index*154,1)
   copyPixels(comparison,res===1?doublePixels(strip):strip,100,28+index*154)
  }
  writePNG(path.join(out,`${level}-frames.png`),comparison)
  records.push({level,biome:w.biome,tick:at,agent:first.id,saved,exit:w.exit})
 }
 writePNG(path.join(out,'contact-sheet.png'),sheet);fs.writeFileSync(path.join(out,'index.html'),reviewHTML(levels))
 const result={base,ages:HOME_AGES,records,seconds:+((performance.now()-started)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
 console.log(JSON.stringify(welcomeStrips(path.resolve(arg('--out','shots/exit-welcome')),{base:arg('--base','main')})))
}
