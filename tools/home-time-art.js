#!/usr/bin/env node
// Actual page evidence, with only the presentation clock staged for repeatable
// transition frames. Interaction tests and FPS use the unmodified live clock.
import fs from 'node:fs'
import path from 'node:path'
import {serve,browser} from './phone.js'
import {setupReport} from './report-art.js'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
function session(b,out){
 const ev=async expression=>{const r=await b.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
 const shot=async(file,clip)=>{const r=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,...(clip?{clip}:{})});fs.writeFileSync(path.join(out,file),Buffer.from(r.data,'base64'))}
 return{ev,shot}
}
async function prepareHomeView(b,ev,shot,base,v){
   await b.cmd('Emulation.setDeviceMetricsOverride',{...v,deviceScaleFactor:1})
   await b.cmd('Page.navigate',{url:base+'/?level=8&seed=3'})
   let ready=false;for(let i=0;i<100;i++){if(await ev('!!window.AgentWorld?.()')){ready=true;break}await sleep(30)}if(!ready)throw Error('Page did not start')
   await ev(`(async()=>{await document.fonts.ready;document.getElementById('c-pause').click();const w=AgentWorld();(${setupReport.toString()})(w,'busy');w.ticks=1640;w.doneTicks=40;document.getElementById('who').click();document.getElementById('who').click();document.getElementById('tip').hidden=true;scrollTo(0,0)})()`)
   const state=await ev(`(()=>{const r=document.getElementById('board').getBoundingClientRect();return{board:{x:r.x,y:r.y,width:r.width,height:r.height},layout:pageReportLayout(AgentWorld(),{}),world:JSON.stringify(AgentWorld()),rows:reportRows(AgentWorld(),{})}})()`)
   await shot(v.name+'-report.png');const r=state.board,clip={x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.min(r.x+r.width,v.width)-Math.max(0,r.x),height:Math.min(r.y+r.height,v.height)-Math.max(0,r.y),scale:1};await shot(v.name+'-report-board.png',clip);return{state,clip}

}
async function captureCommuteFrames(out,ev,shot,v,clip){
   // Freeze only rAF presentation time. Simulation is paused through its real UI.
 const active=await ev(`(()=>{window.__clock=performance.now();window.__start=__clock;window.__frames=new Map();window.__frameId=0;performance.now=()=>__clock;window.requestAnimationFrame=cb=>{const id=++__frameId;__frames.set(id,cb);return id};window.cancelAnimationFrame=id=>__frames.delete(id);return !!document.getElementById('commute')})()`)
   if(active)await ev('document.getElementById("c-next").click()')
   fs.mkdirSync(path.join(out,v.name+'-frames'),{recursive:true})
   for(let i=0;i<=20;i++){
    if(!active&&i===8)await ev('document.getElementById("c-next").click()')
    if(active)await ev(`(()=>{__clock=__start+${i*50};const q=[...__frames.values()];__frames.clear();for(const f of q)f(__clock)})()`)
    await shot(v.name+'-frames/'+String(i).padStart(3,'0')+'.png',clip)
   }

 return active

}
async function captureHomeLights(out,ev,shot,v,clip){
 fs.mkdirSync(path.join(out,v.name+'-lights'),{recursive:true})
 for(let i=0;i<=20;i++){
  await ev(`(()=>{AgentWorld().doneTicks=${8+i*2};document.getElementById('who').click();document.getElementById('who').click()})()`)
  await shot(v.name+'-lights/'+String(i).padStart(3,'0')+'.png',clip)
 }
}
export async function captureHomeTime(out,{root,reduced=false}={}){
 fs.mkdirSync(out,{recursive:true});const server=await serve({root}),b=await browser(),records=[]
 const {ev,shot}=session(b,out)
 try{
  await b.cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]})
  for(const v of[{name:'desktop',width:1280,height:900,mobile:false},{name:'phone',width:390,height:844,mobile:true}]){
   const {state,clip}=await prepareHomeView(b,ev,shot,'http://127.0.0.1:'+server.address().port,v)
   await captureHomeLights(out,ev,shot,v,clip)
   const active=await captureCommuteFrames(out,ev,shot,v,clip)
   records.push({...v,...state,clip,active,reduced})
  }
  const result={records,errors:b.errors};fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(result,null,2));return result
 }finally{await b.close();await new Promise(r=>server.close(r))}
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname){captureHomeTime(process.argv[2]||'shots/home-time',{root:process.argv[3],reduced:process.argv.includes('--reduced')}).then(r=>console.log(JSON.stringify({views:r.records.map(r=>r.name),errors:r.errors}))).catch(e=>{console.error(e);process.exitCode=1})}
