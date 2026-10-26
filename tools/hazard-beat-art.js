#!/usr/bin/env node
// Real sink records and fixture phase clocks, sampled on unchanged seeded terrain.
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {serve,browser} from './phone.js'
import {load} from './render.js'
import {poolScene} from './pool-art.js'
const S=load('Sim.js')
export const HAZARD_CASES=['water','green-liquid','lightning','crusher']
export function hazardSpecimen(name){
 if(name==='water'||name==='green-liquid'){
  const{w,pool}=poolScene(name==='water'?2:25);sinkForArt(w,pool);w.done=false;w.doneTicks=0;return{w,pool,from:w.ticks,age:0}
 }
 const w=S.generate(name==='lightning'?20:18,0,3),h=w.hazards.find(h=>h.kind===name)
 if(!h)throw Error('Missing seeded hazard '+name)
 w.ticks=700;w.agents=[];w.enemies=[];w.particles=[];w.hazards=[h];w.hazard=h;w.mission=null;w.special='';w.specialSpec=null
 const c=w.corridors[0],a=S.spawn(w);Object.assign(a,{x:c.x0+5,y:c.floorY-1,state:'walk',special:false,anim:5,ownBrolly:true});w.agents.push(a)
 for(let i=0;i<200;i++){if(h.phase==='charge'&&h.t===0)return{w,h,from:w.ticks,age:0};w.ticks++;S.stepOneHazard(w,h)}
 throw Error('No natural charge within 200 ticks')
}
function sinkForArt(w,pool){
 const random=Math.random;let seed=19
 try{Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);const a=S.spawn(w);a.x=(pool.x0+pool.x1+1)/2;w.agents.push(a);S.sink(w,a,pool);S.noteDeaths(w)}finally{Math.random=random}
}
export function advanceHazard(scene,age){
 if(age<scene.age)throw Error('Hazard frame clock cannot run backwards')
 for(let i=scene.age;i<age;i++){scene.w.ticks++;if(scene.h)S.stepOneHazard(scene.w,scene.h);S.stepParticles(scene.w)}scene.age=age
}
const wait=ms=>new Promise(r=>setTimeout(r,ms))
async function preparePage(b,ev,base,v,name){
 await b.cmd('Emulation.setDeviceMetricsOverride',{...v,deviceScaleFactor:1});await b.cmd('Page.navigate',{url:base+'/?level='+(name==='water'?2:name==='green-liquid'?25:name==='lightning'?20:18)+'&seed=3&season=none'})
 let ready=false;for(let i=0;i<100;i++){if(await ev('!!window.AgentWorld?.()')){ready=true;break}await wait(25)}if(!ready)throw Error('Hazard page did not start')
 await ev(`(async()=>{await document.fonts.ready;document.getElementById('c-pause').click();document.getElementById('overlay').style.visibility='hidden';document.getElementById('levelTitle').hidden=true;document.getElementById('tip').hidden=true;scrollTo(0,0)})()`)
 return ev(`(()=>{const r=document.getElementById('board').getBoundingClientRect();return{x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.min(r.right,innerWidth)-Math.max(0,r.x),height:Math.min(r.bottom,innerHeight)-Math.max(0,r.y),scale:1}})()`)
}
async function captureScene(b,ev,out,base,v,name,reduced,frames){
 const scene=hazardSpecimen(name),clip=await preparePage(b,ev,base,v,name),shots=[],dir=path.join(out,name+'-'+v.name+'-frames');fs.mkdirSync(dir,{recursive:true})
 for(let i=0;i<frames.length;i++){
  const age=frames[i];advanceHazard(scene,age);const data={...scene.w,terrain:Array.from(scene.w.terrain),reducedMotion:reduced}
  const world=await ev(`(()=>{const data=${JSON.stringify(data)};data.terrain=new Uint8Array(data.terrain);Object.assign(AgentWorld(),data);document.querySelector('#themes .theme.on').click();return JSON.stringify(AgentWorld())})()`)
  const img=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip});fs.writeFileSync(path.join(dir,String(i).padStart(3,'0')+'.png'),Buffer.from(img.data,'base64'))
  if([4,24,38,40,48].includes(age)){const page=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,name+'-'+v.name+'-'+age+'.png'),Buffer.from(page.data,'base64'))}
  shots.push({age,ms:age*1000/30,phase:scene.h?.phase,t:scene.h?.t,worldDigest:createHash('sha256').update(world).digest('hex')})
 }
 return{...v,name:name+'-'+v.name,case:name,clip,shots}
}
export async function captureHazards(out,{root,reduced=false,cases=HAZARD_CASES,frames=Array.from({length:36},(_,i)=>i*2)}={}){
 fs.mkdirSync(out,{recursive:true});const server=await serve({root}),b=await browser(),records=[]
 const ev=async expression=>{const r=await b.cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
 try{
  await b.cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]})
  for(const name of cases)for(const v of[{name:'desktop',width:1280,height:900,mobile:false},{name:'phone',width:390,height:844,mobile:true}])records.push(await captureScene(b,ev,out,'http://127.0.0.1:'+server.address().port,v,name,reduced,frames))
  const result={records,reduced,errors:b.errors};fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(result,null,2));return result
 }finally{await b.close();await new Promise(r=>server.close(r))}
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname)captureHazards(process.argv[2]||'shots/hazards',{root:process.argv[3],reduced:process.argv.includes('--reduced')}).then(r=>console.log(JSON.stringify({views:r.records.length,errors:r.errors}))).catch(e=>{console.error(e);process.exitCode=1})
