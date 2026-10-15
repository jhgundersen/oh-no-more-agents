#!/usr/bin/env node
// Bounded release strips, no browser and no wait per animation frame.
import fs from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {load,canvas,writePNG,themeOf} from './render.js'
import {renderer,copyPixels,doublePixels} from './gag-art.js'
const S=load('Sim.js'),P=load('Palette.js'),ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
export const HATCH_AGES=[0,1,3,5,7,9,11,12]
export function releaseFixture(level=8,age=3,res=2){
 const w=S.generate(level,0,3);w.res=res
 for(let i=0;i<500&&w.released<2;i++)S.step(w)
 if(w.released!==2)throw Error('Hatch fixture did not release two agents in 500 ticks')
 for(let i=0;i<age;i++)S.step(w)
 return w
}
export function hatchFrame(D,w,theme='tokyo-night'){
 const img=canvas(64*w.res,40*w.res,themeOf(theme).background),pal=P.build(themeOf(theme).theme,w.level)
 img.ctx.setTransform(w.res,0,0,w.res,(32-w.hatch.x*w.k.CELL)*w.res,(22-w.hatch.y*w.k.CELL)*w.res)
 D.drawHatch(img.ctx,w,pal)
 return img
}
function animationHTML(){
 return `<!doctype html><meta charset="utf-8"><title>Hatch release · before / after</title><style>body{background:#1a1b26;color:#e6e9ee;font:16px monospace;margin:24px}.pair{display:flex;gap:24px;flex-wrap:wrap}.flip{width:384px;height:240px;background-size:3072px 240px;image-rendering:pixelated;animation:release 0.5s steps(8) infinite}a{color:#7aa2f7}@keyframes release{to{background-position:-3072px 0}}@media(prefers-reduced-motion:reduce){.flip{animation:none}}</style><h1>A hatch doing its best</h1><p>Second real release, seed 3. Enlarged animation; native and page-resolution frame strips below.</p>${[8,10].map(level=>`<h2>${level===10?'Trench bubbles':'Factory breath'}</h2><div class="pair">${['before','after'].map(tag=>`<div><p>${tag}</p><div class="flip" style="background-image:url(${level}-${tag}-res2.png)"></div></div>`).join('')}</div>`).join('')}<p><a href="contact-sheet.png">Static contact sheet</a></p>`
}
export function hatchStrips(out,{base='main',levels=[8,10]}={}){
 const started=performance.now(),D=load('Draw.js'),old=renderer(execFileSync('git',['show',base+':public/agents/Draw.js'],{cwd:ROOT,maxBuffer:4<<20}).toString())
 fs.mkdirSync(out,{recursive:true});const sheet=canvas(1104,432*levels.length,'#121822')
 for(const[row,level]of levels.entries()){
  const y=row*432;sheet.ctx.fillStyle='#e6e9ee';D.drawTransitionText(sheet.ctx,level===10?'TRENCH BUBBLES':'FACTORY BREATH',552,y+5,1)
  for(const[ri,res]of[1,2].entries())for(const[vi,draw]of[old,D].entries()){
   const strip=canvas(64*res*HATCH_AGES.length,40*res)
   for(const[i,age]of HATCH_AGES.entries())copyPixels(strip,hatchFrame(draw,releaseFixture(level,age,res)),i*64*res,0)
   const tag=vi?'after':'before';writePNG(path.join(out,`${level}-${tag}-res${res}.png`),strip)
   const yy=y+28+(ri*2+vi)*100;D.drawTransitionText(sheet.ctx,`${tag.toUpperCase()} ${res}X`,38,yy+36,1)
   copyPixels(sheet,res===1?doublePixels(strip):strip,80,yy)
  }
 }
 writePNG(path.join(out,'contact-sheet.png'),sheet);fs.writeFileSync(path.join(out,'index.html'),animationHTML())
 const result={base,levels,ages:HATCH_AGES,seconds:+((performance.now()-started)/1000).toFixed(2),peakRssMB:+(process.resourceUsage().maxRSS/1024).toFixed(1)}
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(result,null,2));return result
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d
 console.log(JSON.stringify(hatchStrips(path.resolve(arg('--out','shots/hatch')),{base:arg('--base','main')})))
}
