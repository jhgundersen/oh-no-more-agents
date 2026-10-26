#!/usr/bin/env node
// One local browser for caption evidence and lifecycle checks. The same seeded
// views serve before/after; no screenshots or sleeps per simulated tick.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {serve,browser} from './phone.js'
export const CAPTION_VIEWS = [
  {name:'desktop',level:17,width:1280,height:900,mobile:false},
  {name:'phone',level:20,width:390,height:844,mobile:true},
  {name:'halloween',level:17,width:390,height:844,mobile:true,season:'halloween'},
  {name:'christmas',level:8,width:390,height:844,mobile:true,season:'christmas'},
  {name:'landscape',level:19,width:844,height:390,mobile:true}
]
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
function evaluator(b){return async expression=>{
 const r=await b.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})
 if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails))
 return r.result.value
}}
// A view without a season pins ?season=none: otherwise the viewer's calendar
// picks one, and in late October every view grew Halloween captions.
async function openView(b,ev,base,v){
 await b.cmd('Emulation.setDeviceMetricsOverride',{width:v.width,height:v.height,deviceScaleFactor:1,mobile:v.mobile})
 await b.cmd('Emulation.setTouchEmulationEnabled',{enabled:v.mobile})
 await b.cmd('Page.navigate',{url:base+'/?level='+v.level+'&seed=3&season='+(v.season||'none')})
 let ready=false
 for(let i=0;i<80;i++){if(await ev('window.AgentWorld?.()?.level==='+v.level)){ready=true;break}await sleep(40)}
 if(!ready)throw Error('Caption page did not become ready within 3.2 seconds')
 // Load every declared face now: a face loads only once text first uses it, so a
 // caption shown after fonts.ready would otherwise be measured in the fallback
 // font on a slow machine (the CI runner, LOG 392).
 await ev('Promise.race([Promise.allSettled([...document.fonts].map(f=>f.load())),new Promise(r=>setTimeout(r,5000))])')
}
const MEASURE=`(()=>{
 document.getElementById('c-pause').click();const w=AgentWorld();
 for(let i=0;i<400&&w.ticks<400&&!w.done;i++)step(w);
 document.querySelector('#themes .theme.on').click();
 // Repaint and refresh the host's readouts after advancing the paused world.
 document.getElementById('who').click();document.getElementById('who').click();
 document.getElementById('overlay').style.visibility='hidden';document.getElementById('tip').hidden=true;
 document.getElementById('levelTitle').hidden=true;
 scrollTo(0,0);const rect=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height}};
 const caption=document.getElementById('eventCaption'),text=document.getElementById('eventText');
 return{level:w.level,biome:w.biome,ticks:w.ticks,feed:w.feed.at(-1),season:w.season?.note,
  caption:caption&&{...rect(caption),text:text.textContent,font:getComputedStyle(text).fontSize,line:getComputedStyle(text).lineHeight,
   textBox:rect(text),scrollHeight:text.scrollHeight,hidden:caption.getAttribute('aria-hidden'),live:caption.getAttribute('aria-live')},
  board:rect(document.getElementById('board')),stage:rect(document.getElementById('stage')),width:innerWidth,height:innerHeight,pageWidth:document.documentElement.scrollWidth}
})()`
export async function captionLifecycle(ev){
 return ev(`(()=>{
  const w=AgentWorld(),c=document.getElementById('eventCaption'),text=document.getElementById('eventText'),
   refresh=()=>{document.getElementById('speed').click();document.getElementById('speed').click();document.getElementById('speed').click()},
   originalNow=performance.now,originalTicks=w.ticks,results={};
  let now=100000;performance.now=()=>now;
  try{
   w.season=null;w.feed=[{t:w.ticks,text:'AGENT 006 · UMBRELLA SAVE'}];refresh();
   results.first=text.textContent;
   const observer=new MutationObserver(()=>{});observer.observe(c,{subtree:true,childList:true,attributes:true});
   refresh();refresh();results.rewrites=observer.takeRecords().length;observer.disconnect();
   const before=JSON.stringify(w);refresh();results.readOnly=JSON.stringify(w)===before;
   // Pausing permits reading indefinitely; a resume expires on wall time.
   now+=4900;document.getElementById('c-pause').click();results.at4900=text.textContent;
   w.ticks+=1000;refresh();results.fastForward=text.textContent;
   now+=101;refresh();results.expired=text.textContent;results.profile=typeof skyCardCaption==='function'?skyCardCaption(w):'';
   document.getElementById('c-pause').click();
   w.feed=[{t:w.ticks,text:'AGENT 006 · RICOCHET'}];refresh();now+=10000;refresh();results.paused=text.textContent;
   w.feed=[{t:w.ticks,text:'AGENT 001 IS FIRST HOME'}];w.season={note:{t:w.ticks,text:'AGENT 001 IS HOME FOR THE HOLIDAYS'}};refresh();results.season=text.textContent;
   w.replaying=true;refresh();results.replay=text.textContent;w.replaying=false;
   w.done=true;refresh();results.report=text.textContent;w.done=false;
   w.season=null;w.ticks=originalTicks;
   w.feed=[{t:w.ticks,text:radioLine(w,'pacer','SPECULATIVE DECODER')}];refresh();
   const r=text.getBoundingClientRect(),a=c.getBoundingClientRect();results.longFits=r.y>=a.y&&r.bottom<=a.bottom;
   results.live=c.getAttribute('aria-live');results.role=c.getAttribute('role');
   document.getElementById('c-next').click();results.navigation=text.textContent;results.nextProfile=typeof skyCardCaption==='function'?skyCardCaption(AgentWorld()):'';
  }finally{performance.now=originalNow}
  return results
 })()`)
}
export async function captureCaptions(out,{root,checks=false,before,views=CAPTION_VIEWS,setup,heading,actualSize=false}={}){
 fs.mkdirSync(out,{recursive:true})
 const server=await serve({root}),b=await browser(),ev=evaluator(b),records=[]
 try{
  const base='http://127.0.0.1:'+server.address().port
  for(const v of views){
   await openView(b,ev,base,v)
   const record=setup?await setup(ev,v):await ev(MEASURE)
   const shot=await b.cmd('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})
   fs.writeFileSync(path.join(out,v.name+'.png'),Buffer.from(shot.data,'base64'));records.push({name:v.name,...record})
  }
  const result={records,errors:b.errors,lifecycle:typeof checks==='function'?await checks(ev,b):checks?await captionLifecycle(ev):null}
  if(before)await comparisonSheet(b,ev,out,before,views,heading,actualSize)
  fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(result,null,2))
  return result
 }finally{await b.close();await new Promise(r=>server.close(r))}
}
async function comparisonSheet(b,ev,out,before,views,heading,actualSize){
 const pictures=views.map(v=>({name:v.name,images:[before,out].map(dir=>'data:image/png;base64,'+fs.readFileSync(path.join(dir,v.name+'.png')).toString('base64'))}))
 const png=await ev(`(async()=>{
  const rows=${JSON.stringify(pictures)},c=document.createElement('canvas');
  const load=src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=src});
  for(const row of rows)row.images=await Promise.all(row.images.map(load));
  const column=${actualSize}?Math.max(...rows.flatMap(r=>r.images.map(i=>i.width)))+20:660;c.width=column*2+20;
  c.height=70+rows.reduce((n,r)=>n+Math.max(...r.images.map(i=>(r.name==='halloween'||r.name==='christmas'?315:i.height)*(${actualSize}?1:Math.min(1,640/i.width))))+44,0);
  const x=c.getContext('2d');x.imageSmoothingEnabled=false;x.fillStyle='#1a1b26';x.fillRect(0,0,c.width,c.height);
  x.font='14px monospace';x.fillStyle='#f3ead9';x.fillText(${JSON.stringify(heading||'COLONY EVENT CAPTIONS · BEFORE / AFTER · seed 3, tick 400')},20,24);
  let y=50;
  for(const row of rows){
   x.fillStyle='#f3ead9';x.fillText(row.name.toUpperCase()+' · BEFORE',20,y);x.fillText('AFTER',20+column,y);y+=12;
   const images=row.images;
   let height=0;
   for(let j=0;j<2;j++){
    const i=images[j],crop=row.name==='halloween'||row.name==='christmas',sy=crop?240:0,sh=crop?315:i.height,scale=${actualSize}?1:Math.min(1,640/i.width);
    x.drawImage(i,0,sy,i.width,sh,20+j*column,y,i.width*scale,sh*scale);height=Math.max(height,sh*scale)
   }y+=height+32;
  }
  return c.toDataURL('image/png').split(',')[1]
 })()`)
 fs.writeFileSync(path.join(out,'contact-sheet.png'),Buffer.from(png,'base64'))
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2).filter(a=>a!=='--checks')
 captureCaptions(args[0]||'shots/captions',{root:args[1],before:args[2],checks:process.argv.includes('--checks')})
  .then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1})
}
