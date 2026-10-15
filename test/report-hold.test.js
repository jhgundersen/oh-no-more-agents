import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {loadCore} from '../tools/load-core.js'
import {canvas,themeOf} from '../tools/render.js'
import {serve,browser} from '../tools/phone.js'
import {captureReports} from '../tools/report-art.js'
const S=loadCore('Sim.js'),D=loadCore('Draw.js'),P=loadCore('Palette.js')
const hash=b=>createHash('sha256').update(b).digest('hex')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))

test('holding a page report lifts only the closing iris, preserving native pixels, state and RNG',()=>{
 const random=Math.random
 try{
  Math.random=()=>assert.fail('report hold consumed RNG')
  for(let level=1;level<=20;level++)for(const res of[1,2]){
   const w=S.generate(level,0,3);Object.assign(w,{res,done:true,doneTicks:108,doneHold:110})
   const before=hash(JSON.stringify(w)),pal=P.build(themeOf('tokyo-night').theme,level)
   const paint=(held,cardOnly=false)=>{
    const img=canvas(400*res,248*res),c=img.ctx;D.clearLayer(c,w)
    c.fillStyle='#123456';c.globalAlpha=.8
    if(cardOnly)D.drawLevelResults(c,w,pal)
    else D.drawLevelTransition(c,w,pal,{heldReport:held})
    if(!cardOnly){assert.equal(c.fillStyle,'#123456');assert.equal(c.globalAlpha,.8)}
    return hash(img.buf)
   }
   const normal=paint(false),held=paint(true)
   if(res===1)assert.equal(held,normal,'native closing unchanged')
   else{assert.notEqual(held,normal,'closing iris lifted');assert.equal(held,paint(true,true),'complete report retained')}
   w.doneTicks=20;assert.equal(paint(true),paint(false),'no visual change before the closing iris')
   w.doneTicks=108;assert.equal(hash(JSON.stringify(w)),before,'read only')
  }
 }finally{Math.random=random}
})

test('held reports and resume hints fit actual desktop, phones, landscape and seasonal cards',{timeout:45000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'report-hold-'))
 try{
  const result=await captureReports(out,{paused:true})
  assert.deepEqual(result.errors,[])
  for(const r of result.records){
   assert.equal(r.pauseVisible,false,r.name)
   assert.equal(r.caption.text,'Report held · Space or tap to resume')
   assert.equal(r.caption.hidden,'false')
   assert.ok(r.caption.x>=0&&r.caption.x+r.caption.width<=r.width,r.name+' caption width')
   assert.ok(r.caption.y>=r.board.y+r.board.height,'hint outside board')
   assert.ok(r.caption.textBox.y>=r.caption.y&&r.caption.textBox.y+r.caption.textBox.height<=r.caption.y+r.caption.height,'hint fits')
   assert.equal(r.pageWidth,r.width)
  }
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})

test('report pause holds its clock, resumes by Space/tap, and excludes gameplay, replay and standup',{timeout:30000},async()=>{
 const server=await serve(),b=await browser()
 const ev=async expression=>{const r=await b.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
 const waitFor=async expression=>{for(let i=0;i<80;i++){if(await ev(expression))return;await sleep(25)}assert.fail('Timed out: '+expression+'; '+JSON.stringify({state:await ev('({level:AgentWorld()?.level,ticks:AgentWorld()?.ticks,doneTicks:AgentWorld()?.doneTicks,pause:document.getElementById("pauseWord").textContent})'),errors:b.errors}))}
 const open=async query=>{
  await b.cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/?seed=3&'+query})
  await waitFor('!!window.AgentWorld?.()&&!AgentWorld().done')
  await ev("document.getElementById('c-pause').click()")
 }
 const state=()=>ev(`(()=>{const o=document.getElementById('overlay');return{overlay:getComputedStyle(o).display!=='none',hint:document.getElementById('eventText').textContent,pause:document.getElementById('pauseWord').textContent}})()`)
 try{
  await open('level=8')
  assert.equal((await state()).overlay,true,'ordinary paused board keeps its veil')
  await ev(`(()=>{const w=AgentWorld();w.done=true;w.doneTicks=20;w.moments=[];document.getElementById('who').click();document.getElementById('who').click()})()`)
  assert.deepEqual(await state(),{overlay:false,hint:'Report held · Space or tap to resume',pause:'resume'})
  const before=await ev('JSON.stringify(AgentWorld())')
  await sleep(350)
  assert.equal(await ev('JSON.stringify(AgentWorld())'),before,'paused report does not advance')
  const closing=await ev(`(()=>{
   const w=AgentWorld();w.doneTicks=108;
   const refresh=()=>{document.getElementById('who').click();document.getElementById('who').click()},c=document.getElementById('actors');refresh();
   const held=c.toDataURL(),snapshot=JSON.stringify(w),space=()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
   space();const closing=c.toDataURL(),resumed=document.getElementById('pauseWord').textContent==='pause'&&document.getElementById('eventText').textContent==='';
   space();const restored=c.toDataURL()===held,unchanged=JSON.stringify(w)===snapshot;
   const caption=document.getElementById('eventCaption'),observer=new MutationObserver(()=>{});observer.observe(caption,{subtree:true,childList:true,attributes:true});refresh();refresh();
   const rewrites=observer.takeRecords().length;observer.disconnect();
   w.doneTicks=20;refresh();document.getElementById('board').click();const tapped=document.getElementById('pauseWord').textContent==='pause';document.getElementById('c-pause').click();
   document.getElementById('c-next').click();
   return{lifted:held!==closing,resumed,restored,unchanged,rewrites,tapped,newLevel:!AgentWorld().done}
  })()`)
  assert.deepEqual(closing,{lifted:true,resumed:true,restored:true,unchanged:true,rewrites:0,tapped:true,newLevel:true})
  assert.deepEqual(await state(),{overlay:true,hint:await ev('skyCardCaption(AgentWorld())'),pause:'resume'},'navigation clears report hold')
  // Fullscreen reserves no caption row; its existing resume control remains.
  await open('level=20&full=1')
  const full=await ev(`(()=>{const w=AgentWorld();w.done=true;w.doneTicks=20;w.moments=[];document.getElementById('who').click();document.getElementById('who').click();return{caption:getComputedStyle(document.getElementById('eventCaption')).display,control:getComputedStyle(document.getElementById('c-pause')).display}})()`)
  assert.equal((await state()).overlay,false);assert.equal(full.caption,'none');assert.notEqual(full.control,'none')
  // A real host replay owns a finished source world but is not a held report.
  await open('level=8')
  await ev("const w=AgentWorld();w.done=true;w.doneTicks=20;w.moments=[{kind:'agi',score:4,t:300}];document.getElementById('c-pause').click()")
  await waitFor('!!AgentReplay()')
  await ev("document.getElementById('c-pause').click()")
  assert.deepEqual(await state(),{overlay:true,hint:'',pause:'resume'},'replay retains usual pause')
  await ev("document.getElementById('board').click()")
  assert.deepEqual(await state(),{overlay:false,hint:'Report held · Space or tap to resume',pause:'resume'},'skipping replay reveals held report')
  // Five short explicit completion fixtures reach the real standup host path.
  await open('level=1')
  for(let i=0;i<5;i++){
   await ev(`(()=>{const w=AgentWorld();for(let j=0;j<400&&!w.done;j++)step(w);w.agents.forEach(a=>{a.state='saved';a.gone=false});Object.assign(w,{done:true,doneTicks:111,moments:[],saved:w.agents.length,released:w.toRelease});document.getElementById('c-pause').click()})()`)
   await waitFor(i<4?'AgentWorld().level==='+String(i+2):'AgentWorld().level===5&&AgentWorld().doneTicks>111')
   await ev("document.getElementById('c-pause').click()")
  }
  assert.deepEqual(await state(),{overlay:true,hint:'',pause:'resume'},'standup is not a report hold')
  await ev("document.getElementById('board').click()")
  assert.equal(await ev('AgentWorld().level'),6,'tap still skips standup')
  assert.deepEqual(await state(),{overlay:true,hint:await ev('skyCardCaption(AgentWorld())'),pause:'resume'})
  assert.deepEqual(b.errors,[])
 }finally{await b.close();await new Promise(r=>server.close(r))}
})
