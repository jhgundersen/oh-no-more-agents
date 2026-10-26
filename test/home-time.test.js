import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {captureHomeTime} from '../tools/home-time-art.js'
import {createHash} from 'node:crypto'
import {loadCore} from '../tools/load-core.js'
import {canvas,themeOf} from '../tools/render.js'
import {serve,browser} from '../tools/phone.js'
const S=loadCore('Sim.js'),D=loadCore('Draw.js'),P=loadCore('Palette.js')
const hash=x=>createHash('sha256').update(x).digest('hex')
const sleep=ms=>new Promise(r=>setTimeout(r,ms))

test('commute geometry covers the old board then reveals the next without moving reduced-motion frames',()=>{
 for(const width of[400,800]){
  assert.equal(D.commuteFrame(0,width,false).front,0)
  assert.equal(D.commuteFrame(1,width,false).tail,width)
  for(const p of[-1,0,.25,.5,.75,1,2]){
   const f=D.commuteFrame(p,width,true);assert.equal(f.front,0);assert.equal(f.opacity,1-Math.max(0,Math.min(1,p)))
  }
 }
 const c=canvas(800,496).ctx,old=c.fillRect.bind(c);let calls=0
 c.fillRect=(x,y,w,h)=>{assert.ok(++calls<20000);assert.ok(x>=0&&y>=0&&x+w<=400&&y+h<=248);assert.ok([x,y,w,h].every(v=>Number.isInteger(v*2)));old(x,y,w,h)}
 c.fillStyle='#123456';c.globalAlpha=.7
 for(const dusk of[0,.5,1])for(const p of[0,.1,.5,.9,1]){const f=D.commuteFrame(p,400,false);D.drawCommuteTrain(c,400,248,f.tail,f.width,dusk)}
 assert.equal(c.fillStyle,'#123456');assert.equal(c.globalAlpha,.7)
})

test('home lights count rescues, keep lost windows dark, fill stands, and preserve world/RNG/context',()=>{
 const random=Math.random
 try{
  Math.random=()=>assert.fail('home art consumed RNG')
  for(const total of[0,1,18,30,128])for(const saved of[0,Math.floor(total/2),total])for(const reduced of[false,true]){
   const w=S.generate(1,0,3);Object.assign(w,{saved,toRelease:total,lost:total-saved,doneTicks:300,ticks:1640,reducedMotion:reduced})
   const before=hash(JSON.stringify(w)),a=canvas(800,496),c=a.ctx,p=P.build(themeOf('tokyo-night').theme,1)
   const background=a.buf.slice();let lit=0,dark=0,calls=0;const fill=c.fillRect.bind(c)
   c.fillRect=(x,y,w,h)=>{assert.ok(++calls<1000);if(w===2&&h===2){if(c.fillStyle==='#edc086')lit++;if(c.fillStyle==='#182332')dark++}fill(x,y,w,h)}
   c.fillStyle='#123456';c.globalAlpha=.8;D.drawHomeVignette(c,w,p,200,100)
   assert.equal(lit,saved);assert.equal(dark,total-saved);assert.equal(c.fillStyle,'#123456');assert.equal(c.globalAlpha,.8)
   assert.equal(hash(JSON.stringify(w)),before)
   if(reduced){const first=hash(a.buf);w.doneTicks=9;a.buf.set(background);D.drawHomeVignette(c,w,p,200,100);assert.equal(hash(a.buf),first)}
  }
 }finally{Math.random=random}
 const w={saved:12,toRelease:18,lost:6,doneTicks:8}
 assert.equal(D.homeVignetteCounts(w).lit,0);w.doneTicks=20;assert.equal(D.homeVignetteCounts(w).lit,6)
 w.doneTicks=32;assert.equal(D.homeVignetteCounts(w).lit,12)
})

test('page commute holds tick zero, takes 0.8 seconds while paused, and consumes skipping input once',{timeout:30000},async()=>{
 const server=await serve(),b=await browser()
 const ev=async expression=>{const r=await b.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
 const wait=async expression=>{for(let i=0;i<100;i++){if(await ev(expression))return;await sleep(25)}assert.fail('Timed out: '+expression)}
 try{
  await b.cmd('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/?level=8&seed=3'})
  await wait('!!window.AgentWorld?.()');assert.equal(await ev('document.getElementById("commute").hidden'),true,'no first-load commute')
  await ev('document.getElementById("c-pause").click();document.getElementById("c-next").click()')
  assert.equal(await ev('AgentWorld().level'),9)
  await sleep(250);assert.equal(await ev('AgentWorld().ticks'),0);assert.equal(await ev('document.getElementById("commute").hidden'),false)
  await wait('document.getElementById("commute").hidden');assert.equal(await ev('AgentWorld().ticks'),0,'paused clock stays paused')
  // Space skips the commute; it must not also resume the paused game.
  await ev('document.getElementById("c-next").click();document.dispatchEvent(new KeyboardEvent("keydown",{key:" ",code:"Space",bubbles:true,cancelable:true}))')
  assert.equal(await ev('AgentWorld().level'),10);assert.equal(await ev('document.getElementById("pauseWord").textContent'),'resume')
  assert.equal(await ev('document.getElementById("commute").hidden'),true)
  // A real pointer sequence consumes its generated click, then the next click works.
  await ev('document.getElementById("c-next").click()')
  await ev('document.getElementById("c-next").scrollIntoView({block:"center"})')
  const point=await ev('(()=>{const r=document.getElementById("c-next").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()')
  await b.cmd('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1})
  await b.cmd('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1})
  assert.equal(await ev('AgentWorld().level'),11,'skip did not advance twice')
  await b.cmd('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1})
  await b.cmd('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1})
  assert.equal(await ev('AgentWorld().level'),12,'next deliberate click works')
  await ev('document.dispatchEvent(new WheelEvent("wheel",{deltaY:1,bubbles:true,cancelable:true}))')
  assert.equal(await ev('document.getElementById("commute").hidden'),true)
  await ev('document.getElementById("c-restart").click()')
  assert.equal(await ev('document.getElementById("commute").hidden'),true,'restart has no commute')
  await b.cmd('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await ev('document.getElementById("c-next").click()')
  assert.equal(await ev('AgentWorld().reducedMotion'),true)
  await sleep(250)
  const fade=await ev('document.getElementById("commute").getContext("2d").getImageData(0,0,1,1).data[3]')
  assert.ok(fade>0&&fade<255,'a changed preference cross-fades the outgoing image without a moving curtain')
  await wait('document.getElementById("commute").hidden')
  // The wipe holds the live simulation too, independently of game speed.
  await ev('document.getElementById("speed").click();document.getElementById("speed").click();document.getElementById("c-pause").click();document.getElementById("c-next").click()')
  await sleep(250);assert.equal(await ev('AgentWorld().ticks'),0)
  await wait('document.getElementById("commute").hidden&&AgentWorld().ticks>0')
  assert.deepEqual(b.errors,[])
 }finally{await b.close();await new Promise(r=>server.close(r))}
})

test('repeatable reduced-motion evidence captures the complete card at desktop and 390px',{timeout:30000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'home-time-'))
 try{
  const r=await captureHomeTime(out,{reduced:true});assert.deepEqual(r.errors,[])
  for(const v of r.records){
   assert.equal(v.active,true);assert.ok(v.clip.x>=0&&v.clip.width<=v.width)
   assert.ok(v.layout.y>=4&&v.layout.y+v.layout.height+3<=248)
   const frames=fs.readdirSync(path.join(out,v.name+'-frames'));assert.equal(frames.length,21)
   assert.notEqual(hash(fs.readFileSync(path.join(out,v.name+'-frames/000.png'))),hash(fs.readFileSync(path.join(out,v.name+'-frames/008.png'))),'cross-fade changes opacity')
  }
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
