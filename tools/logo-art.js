#!/usr/bin/env node
// Real before/after mastheads, at CSS size and both requested DPRs. Reuse one
// browser and the existing capped, ephemeral local server/profile helpers.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {serve,browser} from './phone.js'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
function evaluator(b) {
 return async expression=>{
  const r=await b.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
  if(r.exceptionDetails)throw Error(r.exceptionDetails.text)
  return r.result.value
 }
}
async function logoView(b,ev,out,server,tag,mobile,dpr) {
   const width=mobile?390:1280,height=mobile?844:900
   await b.cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
   await b.cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:dpr,mobile})
   await b.cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile})
   await b.cmd('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?level=20&seed=3`})
   let ready=false
   for(let i=0;i<60;i++){if(await ev('!!window.AgentWorld&&!!AgentWorld()'+(tag==='after'?'&&document.getElementById("pageTitle").classList.contains("logo-ready")':''))){ready=true;break}await sleep(50)}
   if(!ready)throw Error('header did not become ready within three seconds')
   await ev('Promise.race([document.fonts.ready.then(()=>true),new Promise(r=>setTimeout(()=>r(false),1000))])')
   await ev('(()=>{document.getElementById("c-pause").click();const w=AgentWorld();for(let i=0;i<400&&!w.done&&w.ticks<400;i++)step(w);document.querySelector("#themes .theme.on").click()})()')
   const data=await ev(`(()=>{const h=document.querySelector('h1'),c=document.getElementById('pageLogo'),r=h.getBoundingClientRect();return{heading:h.textContent.trim(),pageWidth:document.documentElement.scrollWidth,viewport:innerWidth,rect:{x:r.x,y:r.y,width:r.width,height:r.height},canvas:c?{width:c.width,height:c.height,hidden:c.hidden}:null}})()`)
   const name=`${mobile?'phone':'desktop'}-${tag}-dpr${dpr}`
   const shot=await b.cmd('Page.captureScreenshot',{format:'png'})
   fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'))
   const top=await b.cmd('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width,height:Math.ceil(data.rect.y+data.rect.height+12),scale:1}})
   fs.writeFileSync(path.join(out,name+'-header.png'),Buffer.from(top.data,'base64'))
 return {tag,mobile,dpr,...data}
}
async function logoChecks(b,ev) {
  // Dynamic preference changes must freeze/resume the one small idle canvas.
  const encoded=()=>ev('document.getElementById("pageLogo").toDataURL()')
  const neutral=await encoded();await sleep(1100);const reducedStable=neutral===await encoded()
  await ev('(()=>{window.logoIdlePaints=0;const c=document.getElementById("pageLogo").getContext("2d"),draw=c.drawImage;c.drawImage=function(...args){window.logoIdlePaints++;return draw.apply(this,args)}})()')
  await b.cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]})
  const frames=new Set([await encoded()]);for(let i=0;i<3;i++){await sleep(1050);frames.add(await encoded())}
  const idlePaints=await ev('window.logoIdlePaints')
  await ev('scrollTo(0,document.body.scrollHeight)');await sleep(100)
  const offscreen=await encoded();await sleep(1100);const offscreenStable=offscreen===await encoded()
  await ev('scrollTo(0,0)');await sleep(100);const visible=await encoded();await sleep(1100);const resumed=visible!==await encoded()
  await b.cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await sleep(50);const frozen=await encoded();await sleep(1100);const stopped=frozen===await encoded()
  const ax=await b.cmd('Accessibility.getFullAXTree')
  const heading= ax.nodes.find(n=>n.role?.value==='heading'&&n.name?.value==='Oh No! More Agents')
  const themeCount=await ev('(()=>{const hashes=new Set();for(const button of document.querySelectorAll("#themes button")){button.click();hashes.add(document.getElementById("pageLogo").toDataURL())}return hashes.size})()')

 return {motion:{reducedStable,animatedFrames:frames.size,idlePaints,offscreenStable,resumed,stopped},accessibleHeading:!!heading,themeCount}
}
export async function captureLogo(out,beforeRoot){
 fs.mkdirSync(out,{recursive:true})
 const after=await serve(),before=beforeRoot?await serve({root:beforeRoot}):null,b=await browser(),records=[],ev=evaluator(b)
 const versions=[{tag:'after',server:after,dprs:[1,2]}]
 if(before)versions.unshift({tag:'before',server:before,dprs:[1]})
 try{
  for(const v of versions)for(const mobile of[false,true])for(const dpr of v.dprs)records.push(await logoView(b,ev,out,v.server,v.tag,mobile,dpr))
  const result={records,errors:b.errors,...await logoChecks(b,ev)}
  fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(result,null,2))
  return result
 }finally{await b.close();after.close();if(before)before.close()}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 captureLogo(process.argv[2]||'shots/logo-art',process.argv[3]).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1})
}
