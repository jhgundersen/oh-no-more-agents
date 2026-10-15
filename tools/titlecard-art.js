#!/usr/bin/env node
// A bounded, single-browser title-card review: actual CSS sizes, cached pixels,
// timing, input and all three competing board presentations. No production API.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {serve,browser} from './phone.js'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
function evaluator(b){
 return async expression=>{
  const r=await b.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails)throw Error(r.exceptionDetails.text)
  return r.result.value
 }
}
async function navigate(b,ev,url){
 await b.cmd('Page.navigate',{url})
 for(let i=0;i<60;i++){
  if(await ev('!!window.AgentWorld&&!!AgentWorld()'))return
  await sleep(50)
 }
 throw Error('title card page did not become ready within three seconds')
}
async function titleView(b,ev,out,url,mobile,dpr,phoneShots){
 await b.cmd('Emulation.setDeviceMetricsOverride',{width:mobile?390:1280,height:mobile?844:900,deviceScaleFactor:dpr,mobile})
 await b.cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile})
 await navigate(b,ev,url)
 await ev('Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,1000))])')
 const metrics=await ev(`(()=>{
  document.getElementById('c-pause').click();document.getElementById('c-restart').click();
  const w=AgentWorld(),layout=levelTitleLayout(w);while(w.ticks<18)step(w);
  document.querySelector('#themes .theme.on').click();
  document.getElementById('overlay').style.visibility='hidden';
  const c=document.getElementById('levelTitle'),board=document.getElementById('board');
  if(innerWidth<600)scrollTo(0,scrollY+board.getBoundingClientRect().top-32);
  const r=board.getBoundingClientRect();
  for(const a of c.getAnimations()){a.pause();a.currentTime=300}
  return{viewport:innerWidth,scrollY,viewportHeight:innerHeight,pageWidth:document.documentElement.scrollWidth,hidden:c.hidden,canvas:{width:c.width,height:c.height},board:{x:r.x,y:r.y,width:r.width,height:r.height},layout,hatch:{x:w.hatch.x*4,y:w.hatch.y*4},level:w.level,biome:w.biome,ticks:w.ticks,subtitle:levelTitleSubtitle(w.level,w.biome)}
 })()`)
 const name=`${mobile?'phone':'desktop'}-dpr${dpr}${metrics.level===20?'':'-level'+metrics.level}`
 const shot=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
 fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'))
 const r=metrics.board
 const x=Math.max(0,r.x),width=Math.min(r.x+r.width,metrics.viewport)-x
 const crop=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x,y:r.y+metrics.scrollY,width,height:r.height,scale:1}})
 fs.writeFileSync(path.join(out,name+'-board.png'),Buffer.from(crop.data,'base64'))
 if(mobile&&dpr===1)phoneShots.push({level:metrics.level,biome:metrics.biome,png:crop.data})
 return{mobile,dpr,...metrics}
}
async function timingChecks(b,ev){
 const normal=await ev(`(()=>{document.getElementById('c-restart').click();const c=document.getElementById('levelTitle'),ctx=c.getContext('2d'),fill=ctx.fillRect;window.titleLivePaints=0;window.titleSelections=0;const choose=levelTitleLayout;levelTitleLayout=function(w){window.titleSelections++;return choose(w)};ctx.fillRect=function(...r){window.titleLivePaints++;return fill.apply(this,r)};return{duration:getComputedStyle(c).animationDuration,pointerEvents:getComputedStyle(c).pointerEvents,hidden:c.hidden,ariaHidden:c.getAttribute('aria-hidden')}})()`)
 await sleep(850)
 const fading=await ev('Number(getComputedStyle(document.getElementById("levelTitle")).opacity)')
 const cached=await ev('window.titleLivePaints===0&&window.titleSelections===0')
 await sleep(450)
 const expired=await ev('document.getElementById("levelTitle").hidden')
 // A theme repaint must neither change the world nor restart the fade.
 const pure=await ev(`(()=>{document.getElementById('c-pause').click();document.getElementById('c-restart').click();const a=JSON.stringify(AgentWorld());window.titleSelections=0;document.querySelector('#themes .theme.on').click();return a===JSON.stringify(AgentWorld())&&window.titleSelections===0})()`)
 await b.cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
 const reduced=await ev(`(()=>{document.getElementById('c-restart').click();return getComputedStyle(document.getElementById('levelTitle')).animationDuration})()`)
 await sleep(700)
 const reducedExpired=await ev('document.getElementById("levelTitle").hidden')
 await b.cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]})
 await ev('document.getElementById("c-restart").click()');await sleep(650)
 await ev('document.getElementById("c-next").click()');await sleep(650)
 const reset=await ev('!document.getElementById("levelTitle").hidden')
 return{normal,fading,cached,expired,pure,reduced,reducedExpired,reset}
}
async function inputChecks(b,ev){
 // The timing check leaves the game paused. A real tap both skips and resumes.
 await ev('document.getElementById("c-restart").click()')
 const r=await ev('(()=>{const r=document.getElementById("board").getBoundingClientRect();return{x:r.x+20,y:r.y+20}})()')
 await b.cmd('Input.dispatchMouseEvent',{type:'mousePressed',...r,button:'left',clickCount:1})
 await b.cmd('Input.dispatchMouseEvent',{type:'mouseReleased',...r,button:'left',clickCount:1})
 return ev('({skipped:document.getElementById("levelTitle").hidden,resumed:document.getElementById("overlay").style.display==="none"})')
}
async function exclusionChecks(ev){
 // Force a real early replay/report while the new card would still be alive.
 await ev(`(()=>{document.getElementById('c-restart').click();const w=AgentWorld();w.done=true;w.moments=[{kind:'agi',score:5,t:70}]})()`)
 await sleep(60)
 const replay=await ev('({hidden:document.getElementById("levelTitle").hidden,active:!!AgentReplay()})')
 await ev('if(AgentReplay())document.getElementById("board").click()')
 const report=await ev('document.getElementById("levelTitle").hidden&&AgentWorld().done')
 // Five completed levels lead to the normal standup, not another overlay.
 for(let i=0;i<5;i++){
  await ev(`(()=>{document.getElementById('c-restart').click();const w=AgentWorld();w.done=true;w.doneTicks=111;w.moments=[];w.agents=[spawn(w)];w.agents[0].state='saved';w.saved=1})()`)
  await sleep(65)
 }
 const meeting=await ev('({hidden:document.getElementById("levelTitle").hidden,done:AgentWorld().done,ticks:AgentWorld().doneTicks})')
 await ev('document.getElementById("board").click()')
 const next=await ev('!AgentWorld().done&&!document.getElementById("levelTitle").hidden')
 return{replay,report,meeting,next}
}
async function phoneSheet(ev,out,shots){
 const png=await ev(`(async()=>{
  const shots=${JSON.stringify(shots)},c=document.createElement('canvas');c.width=414;c.height=24+shots.length*284;
  const ctx=c.getContext('2d');ctx.imageSmoothingEnabled=false;ctx.fillStyle='#1a1b26';ctx.fillRect(0,0,c.width,c.height);
  for(let i=0;i<shots.length;i++){
   const y=12+i*284,im=new Image();im.src='data:image/png;base64,'+shots[i].png;await im.decode();
   ctx.fillStyle='#c0caf5';drawTransitionText(ctx,'PHONE 390 PX · LEVEL '+shots[i].level+' · '+shots[i].biome.toUpperCase(),207,y,1.5);
   ctx.drawImage(im,12,y+20);
  }
  return c.toDataURL().split(',')[1]
 })()`)
 fs.writeFileSync(path.join(out,'phone-sheet.png'),Buffer.from(png,'base64'))
}
export async function captureTitleCards(out){
 fs.mkdirSync(out,{recursive:true})
 const server=await serve(),records=[],exceptions=[],phoneShots=[]
 let b
 const url=`http://127.0.0.1:${server.address().port}/?level=20&seed=3`
 try{
  b=await browser()
  const ev=evaluator(b)
  b.onEvent=d=>{if(d.method==='Runtime.exceptionThrown'&&exceptions.length<20)exceptions.push(d.params.exceptionDetails.exception?.description||d.params.exceptionDetails.text)}
  await b.cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]})
  for(const mobile of[false,true])for(const dpr of[1,2])records.push(await titleView(b,ev,out,url,mobile,dpr,phoneShots))
  for(const level of[13,29])records.push(await titleView(b,ev,out,url.replace('level=20','level='+level),true,1,phoneShots))
  await phoneSheet(ev,out,phoneShots)
  await navigate(b,ev,url)
  const timing=await timingChecks(b,ev),input=await inputChecks(b,ev),exclusions=await exclusionChecks(ev)
  const result={records,timing,input,exclusions,errors:b.errors,exceptions}
  fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(result,null,2))
  return result
 }finally{if(b)await b.close();server.close()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 captureTitleCards(process.argv[2]||'shots/titlecard-art').then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1})
}
