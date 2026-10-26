#!/usr/bin/env node
// Staged enemy poses on real seeded corridor terrain, at actual page scale.
import fs from 'node:fs'
import path from 'node:path'
import {serve,browser} from './phone.js'
import {fixture} from './cast-art.js'
export const ENEMY_FRAMES=[...Array.from({length:10},(_,i)=>({name:'idle-'+i,phase:'idle',tick:i*9,ms:i*300})),...Array.from({length:24},(_,i)=>({name:'aim-'+i,phase:'aim',tick:i*2,ms:3000+i*2000/30})),...Array.from({length:17},(_,i)=>({name:'down-'+i,phase:'down',tick:i*2,ms:4600+i*2000/30}))]
export function enemySpecimen(){
 const{w,target}=fixture(['guard',13,'bouncer','walk',{hp:3,near:true}]);const x=target.x,y=target.y
 w.enemies=[target,{...target,id:201,kind:'gun',x:x+8,state:'reload',timer:40,hp:1},{...target,id:202,kind:'sniper',x:x+18,state:'camp',timer:0,hp:1},{...target,id:203,kind:'operator',x:x+40,state:'operate',timer:0,hp:1}]
 w.agents[0].x=x+3;w.agents[0].ownBrolly=true;w.agents[0].anim=5
 const friend={...w.agents[0],id:w.agents[0].id+1,x:x+44,dir:-1};w.agents.push(friend)
 for(const en of w.enemies)if(en.kind!=='bouncer'){en.targetId=friend.id;en.lineTo=friend.x;en.lineY=friend.y-2}
 w.released=w.agents.length;return w
}
export function poseEnemies(w,frame){
 w.ticks=(frame.phase==='down'?650:400)+frame.tick
 for(const en of w.enemies){
  en.gone=frame.phase==='down';en.anim=frame.tick;en.shotFor=0
  if(en.gone){en.state='dead';en.diedAt=650;en.diedBy='red team down';continue}
  if(frame.phase==='idle'){en.state=en.kind==='bouncer'?'walk':en.kind==='sniper'?'camp':en.kind==='operator'?'operate':'reload';en.timer=40;continue}
  if(en.kind==='bouncer'){en.state='walk';continue}
  if(en.kind==='operator'){en.state='operate';en.timer=144+Math.min(35,frame.tick);continue}
  const span=en.kind==='sniper'?36:8;en.timer=frame.tick
  en.state=frame.tick<span?'aim':'reload'
  if(en.state==='reload'){en.timer=frame.tick-span;en.shotFor=Math.max(0,7-en.timer)}
 }
}
const wait=ms=>new Promise(r=>setTimeout(r,ms))
export async function captureEnemies(out,{root,reduced=false,frames=ENEMY_FRAMES}={}){
 fs.mkdirSync(out,{recursive:true});const server=await serve({root}),b=await browser(),rows=[]
 const ev=async expression=>{const r=await b.cmd('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
 try{
  await b.cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]})
  for(const v of[{name:'desktop',width:1280,height:900,mobile:false},{name:'phone',width:390,height:844,mobile:true}]){
   await b.cmd('Emulation.setDeviceMetricsOverride',{...v,deviceScaleFactor:1});await b.cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/?level=13&seed=3&season=none'})
   let ready=false;for(let i=0;i<100;i++){if(await ev('!!window.AgentWorld?.()')){ready=true;break}await wait(25)}if(!ready)throw Error('Enemy page did not start')
   const w=enemySpecimen();w.terrain=Array.from(w.terrain)
   await ev(`(async()=>{await document.fonts.ready;document.getElementById('c-pause').click();const w=AgentWorld(),data=${JSON.stringify(w)};data.terrain=new Uint8Array(data.terrain);Object.assign(w,data);w.reducedMotion=${reduced};document.getElementById('overlay').style.visibility='hidden';document.getElementById('levelTitle').hidden=true;document.getElementById('tip').hidden=true;scrollTo(0,0)})()`)
   const clip=await ev(`(()=>{const r=document.getElementById('board').getBoundingClientRect();return{x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.min(r.right,innerWidth)-Math.max(0,r.x),height:Math.min(r.bottom,innerHeight)-Math.max(0,r.y),scale:1}})()`),shots=[]
   fs.mkdirSync(path.join(out,v.name+'-frames'),{recursive:true})
   for(let i=0;i<frames.length;i++){
    const frame=frames[i],world=await ev(`(()=>{const w=AgentWorld();(${poseEnemies})(w,${JSON.stringify(frame)});document.querySelector('#themes .theme.on').click();return JSON.stringify(w)})()`)
    const image=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip});fs.writeFileSync(path.join(out,v.name+'-frames',String(i).padStart(3,'0')+'.png'),Buffer.from(image.data,'base64'))
    if(['idle-2','idle-4','aim-2','aim-16','down-5'].includes(frame.name)){const page=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,v.name+'-'+frame.name+'.png'),Buffer.from(page.data,'base64'))}
    shots.push({...frame,world})
   }
   rows.push({...v,clip,shots})
  }
  const r={records:rows,reduced,errors:b.errors};fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(r,null,2));return r
 }finally{await b.close();await new Promise(r=>server.close(r))}
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname)captureEnemies(process.argv[2]||'shots/enemies',{root:process.argv[3],reduced:process.argv.includes('--reduced')}).then(r=>console.log(JSON.stringify({views:r.records.length,errors:r.errors}))).catch(e=>{console.error(e);process.exitCode=1})
