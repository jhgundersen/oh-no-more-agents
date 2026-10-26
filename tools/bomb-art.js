#!/usr/bin/env node
// A staged charge on a real seeded corridor. stepBomb performs the actual
// detonation/cut; only the presentation clock and other actors are held still.
import fs from 'node:fs'
import path from 'node:path'
import {serve,browser} from './phone.js'
export const BOMB_FRAMES=[150,120,90,60,30,24,18,12,6,1].map(fuse=>({name:'fuse-'+fuse,fuse,ms:(150-fuse)*1000/30})).concat(Array.from({length:28},(_,age)=>({name:'blast-'+age,age,ms:5000+age*1000/30})))
export function bombSite(w){
 for(const c of w.corridors)for(let x=Math.max(c.x0+7,28);x<Math.min(c.x1-7,75);x++){
  const y=c.floorY-1;let clear=true
  for(let dx=-3;dx<=3;dx++)for(let dy=0;dy<5;dy++)if(w.terrain[(y-dy)*w.k.COLS+x+dx]!==w.k.EMPTY)clear=false
  if(clear&&w.terrain[(y+1)*w.k.COLS+x]!==w.k.EMPTY)return{x:x+.5,y}
 }
 throw Error('No bounded charge site on seeded corridors')
}
export function setupBomb(w,spawn,site){
 w.ticks=700;w.done=false;w.blasts=[];w.particles=[];w.agents=[];w.reducedMotion=!!w.reducedMotion
 const a=spawn(w);Object.assign(a,site,{state:'bomb',fuse:150,condemned:true,dir:1,anim:5,special:false});w.agents.push(a)
 for(const dx of[-8,-5]){const n=spawn(w);Object.assign(n,{x:site.x+dx,y:site.y,state:'walk',dir:1,anim:5,special:false});w.agents.push(n)}
 return a.id
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
function evaluator(b){return async expression=>{const r=await b.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}}
async function prepareBombPage(b,ev,base,v){
 await b.cmd('Emulation.setDeviceMetricsOverride',{...v,deviceScaleFactor:1})
 await b.cmd('Page.navigate',{url:base+'/?level=8&seed=3&season=none'})
 let ready=false;for(let i=0;i<100;i++){if(await ev('!!window.AgentWorld?.()')){ready=true;break}await sleep(25)}if(!ready)throw Error('Bomb page did not start')
 await ev(`(async()=>{await document.fonts.ready;document.getElementById('c-pause').click();const w=AgentWorld(),site=(${bombSite.toString()})(w);window.bombArtId=(${setupBomb.toString()})(w,spawn,site);window.bombArtAge=-1;window.bombArtFired=false;document.getElementById('overlay').style.visibility='hidden';document.getElementById('levelTitle').hidden=true;document.getElementById('tip').hidden=true;scrollTo(0,0)})()`)
 return ev(`(()=>{const r=document.getElementById('board').getBoundingClientRect(),w=AgentWorld();return{site:{x:w.agents[0].x,y:w.agents[0].y},clip:{x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.min(r.x+r.width,innerWidth)-Math.max(0,r.x),height:Math.min(r.y+r.height,innerHeight)-Math.max(0,r.y),scale:1}}})()`)
}
async function bombPageFrame(b,ev,out,v,frame,index,clip){
 const state=await ev(`(()=>{const w=AgentWorld(),a=w.agents.find(a=>a.id===bombArtId);
 if(${frame.fuse!==undefined}){a.fuse=${frame.fuse||1};w.ticks=700+150-a.fuse}
 else{if(!bombArtFired){w.ticks=850;a.fuse=1;const random=Math.random;let seed=19;try{Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);stepBomb(w,a)}finally{Math.random=random}bombArtFired=true}
  for(let i=bombArtAge;i<${frame.age??0};i++){w.ticks=850+i+1;stepParticles(w)}bombArtAge=${frame.age??0};w.ticks=850+bombArtAge}
 document.querySelector('#themes .theme.on').click();return{ticks:w.ticks,fuse:a.fuse,blasts:w.blasts.length,terrainVersion:w.terrainVersion,world:JSON.stringify(w)}})()`)
 const image=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip})
 fs.writeFileSync(path.join(out,v.name+'-frames',String(index).padStart(3,'0')+'.png'),Buffer.from(image.data,'base64'))
 if(['fuse-1','blast-3','blast-12','blast-24'].includes(frame.name)){
  const page=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
  fs.writeFileSync(path.join(out,v.name+'-'+frame.name+'.png'),Buffer.from(page.data,'base64'))
 }
 return{...frame,...state}
}
export async function captureBomb(out,{root,reduced=false,frames=BOMB_FRAMES}={}){
 fs.mkdirSync(out,{recursive:true});const server=await serve({root}),b=await browser(),ev=evaluator(b),records=[]
 try{
  await b.cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]})
  for(const v of[{name:'desktop',width:1280,height:900,mobile:false},{name:'phone',width:390,height:844,mobile:true}]){
   const r=await prepareBombPage(b,ev,'http://127.0.0.1:'+server.address().port,v),shots=[]
   fs.mkdirSync(path.join(out,v.name+'-frames'),{recursive:true})
   for(let i=0;i<frames.length;i++)shots.push(await bombPageFrame(b,ev,out,v,frames[i],i,r.clip))
   records.push({...v,...r,shots})
  }
  const result={records,reduced,errors:b.errors};fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(result,null,2));return result
 }finally{await b.close();await new Promise(r=>server.close(r))}
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname)captureBomb(process.argv[2]||'shots/bomb',{root:process.argv[3],reduced:process.argv.includes('--reduced')}).then(r=>console.log(JSON.stringify({views:r.records.map(r=>r.name),errors:r.errors}))).catch(e=>{console.error(e);process.exitCode=1})
