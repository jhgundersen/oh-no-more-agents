import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {gateCycle,gateUntil,gateAdvance,gateBox,gateFrame,gateStrips} from '../tools/gate-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),hash=b=>createHash('sha256').update(b).digest('hex')
const pal=P.build(themeOf('tokyo-night').theme,36)
function marks(fn,{balanced=false}={}){
 const ctx=canvas(400,248).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=0.35
 ctx.fillRect=(...r)=>{
  assert.ok(calls.length<2000,'bounded paint');assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0)
  assert.ok(r.every(n=>Number.isInteger(n*2)),'half-pixel grid');assert.ok(ctx.globalAlpha<=0.35+1e-9,'inherited opacity')
  calls.push([...r,ctx.fillStyle,ctx.globalAlpha])
 }
 fn(ctx);assert.equal(ctx.globalAlpha,0.35);if(balanced)assert.equal(ctx.fillStyle,'#123456');return calls
}
function nativeAggregate(Draw=D){
 const h=createHash('sha256')
 for(const level of[36,76,96]){
  const w=S.generate(level,0,3);w.ticks=400
  for(const name of Object.keys(THEMES))for(const res of[undefined,1,3])for(const reduced of[false,true])for(const g of w.gates)
   for(const[open,changedAt]of[[false,-1],[true,-1],[true,400],[true,395],[false,400],[false,395],[false,390]]){
    w.res=res;w.reducedMotion=reduced;Object.assign(g,{open,changedAt})
    const img=canvas(400,248);Draw.drawClockGate(img.ctx,w,P.build(themeOf(name).theme,level),g);h.update(img.buf)
   }
 }
 return h.digest('hex')
}
test('native/default and share-card gates keep original bytes in all phases, palettes and motion preferences',()=>{
 assert.equal(nativeAggregate(),'601fa17be05a9a4797de6965fd12ff48c6c03551c8de2a49f0a3c236b645401c')
})
test('real gate cycles retain their exact tween positions, without RNG, mutations or excess paint',()=>{
 const random=Math.random
 try{for(const level of[36,76,96]){
  const{w,gate}=gateCycle(level)
  for(let frame=0;frame<8;frame++){
   gateAdvance(w,gate,frame)
   for(const name of Object.keys(THEMES)){
    const before=hash(JSON.stringify(w)),colors=P.build(themeOf(name).theme,level);Math.random=()=>{throw Error('render RNG')}
    const a=marks(ctx=>D.drawClockGate(ctx,w,colors,gate),{balanced:true})
    assert.deepEqual(marks(ctx=>D.drawClockGate(ctx,w,colors,gate),{balanced:true}),a);assert.ok(a.length<=160)
    assert.equal(hash(JSON.stringify(w)),before);Math.random=random
   }
  }
 }}finally{Math.random=random}
 assert.throws(()=>gateCycle(56),/No gate/);assert.throws(()=>gateCycle(36,3,2,99),/No gate/)
 const w=S.generate(36,0,3);assert.equal(gateUntil(w,()=>true,0),0);assert.throws(()=>gateUntil(w,()=>false,0),/stage exceeded 0/)
})
test('all moving leaf paint stays inside the exact slot at every half-pixel drop and every supported thickness',()=>{
 for(const width of[4,8,12])for(let drop=0;drop<=20;drop+=0.5){
  const b={x:100,y:80,width,height:20,drop}
  for(const[x,y,ww,hh]of marks(ctx=>D.drawPageGateBars(ctx,b)))assert.ok(x>=b.x&&x+ww<=b.x+width&&y>=b.y&&y+hh<=b.y+drop)
 }
 const b={x:100,y:80,width:4,height:20,drop:10}
 assert.equal(marks(ctx=>D.gateSlotRect(ctx,b,90,70,2,2)).length,0)
 const clipped=marks(ctx=>D.gateSlotRect(ctx,b,99,79,4,4));assert.deepEqual(clipped[0].slice(0,4),[100,80,3,3])
})
test('counterweights travel opposite the leaf and remain inside the original fixed reservation',()=>{
 for(const width of[4,8,12]){
  const ys=[]
  for(const drop of[0,10,20]){
   const b={x:100,y:80,width,height:20,drop},calls=marks(ctx=>D.drawGateWeights(ctx,b))
   const weights=calls.filter(c=>c[4]===D.CLOCK_GLINT);assert.equal(weights.length,2);ys.push(weights[0][1])
   for(const[x,y,ww,hh]of calls)assert.ok(x>=96&&x+ww<=104+width&&y>=80&&y+hh<=100)
  }
  assert.ok(ys[0]>ys[1]&&ys[1]>ys[2])
 }
})
test('closing tell uses the final eighteen open ticks and remains amber through a real occupancy deferral',()=>{
 for(const phase of[0,101,239])for(const cycle of[0,100,131,132,149,150,200,239])for(const open of[false,true]){
  const w={ticks:(cycle-phase+240)%240},g={phase,open};assert.equal(D.gateClosingSoon(w,g),open&&cycle>=132)
 }
 const w=S.generate(36,0,3),g=w.gates[0],ag=S.spawn(w);w.res=2
 S.setGate(w,g,true);Object.assign(ag,{state:'walk',x:g.x0+0.5,y:g.bottom});w.agents=[ag];w.ticks=(S.GATE_OPEN-g.phase+S.GATE_PERIOD)%S.GATE_PERIOD
 S.stepGates(w);assert.equal(g.open,true);assert.equal(D.clockGateDrawing(w,g).drop,0)
 for(const reduced of[false,true]){
  w.reducedMotion=reduced;const b=D.clockGateDrawing(w,g),calls=marks(ctx=>D.drawClockGate(ctx,w,pal,g),{balanced:true})
  assert.ok(calls.some(c=>c[4]===D.GATE_AMBER))
  for(const[x,y,ww,hh,color]of calls)if(x<b.x+b.width&&x+ww>b.x&&y<b.y+b.height&&y+hh>b.y)assert.equal(color,pal.backDim,'held-open slot remains completely clear')
 }
 ag.gone=true;S.stepGates(w);assert.equal(g.open,false);assert.equal(g.changedAt,w.ticks)
 w.reducedMotion=false;w.ticks+=5;assert.equal(D.clockGateDrawing(w,g).drop,(g.bottom-g.top+1)*2)
})
test('reduced motion snaps to real open/closed state and holds all secondary motion steady',()=>{
 const w=S.generate(36,0,3),g=w.gates[0];w.res=2;w.reducedMotion=true;g.phase=0
 for(const open of[false,true]){
  Object.assign(g,{open,changedAt:10});w.ticks=10
  const first=marks(ctx=>D.drawClockGate(ctx,w,pal,g),{balanced:true})
  for(const tick of[11,15,20,30]){w.ticks=tick;assert.deepEqual(marks(ctx=>D.drawClockGate(ctx,w,pal,g),{balanced:true}),first)}
 }
 const g2={...g,open:true,phase:150,changedAt:-1};w.ticks=10
 const pending=marks(ctx=>D.drawClockGate(ctx,w,pal,g2),{balanced:true});w.ticks=25
 assert.deepEqual(marks(ctx=>D.drawClockGate(ctx,w,pal,g2),{balanced:true}),pending)
})
test('new frame, weights, drive and dial fit the unchanged scenery reservation at every phase',()=>{
 const w=S.generate(36,0,3);w.res=2
 for(const thickness of[1,2,3])for(const open of[false,true])for(const age of[0,5,10,30]){
  const g={...w.gates[0],x0:45,x1:44+thickness,top:20,bottom:24,open,changedAt:200};w.gates=[g];w.ticks=200+age
  const b=D.clockGateDrawing(w,g),boxes=D.dialReserved(w)
  for(const[x,y,width,height]of marks(ctx=>D.drawClockGate(ctx,w,pal,g),{balanced:true})){
   assert.ok(x>=b.x-4&&x+width<=b.x+b.width+4&&y>=b.y-9&&y+height<=b.y+b.height+1)
   assert.equal(D.assemblyUnreserved(boxes,x,y,width,height),false)
  }
 }
})
test('direct crops match full frames and invalidate whenever toggling terrain or changing resolution/palette',()=>{
 const{w,gate}=gateCycle(),cache={},box=gateBox(w,gate),small=gateFrame(D,w,gate,cache),full=canvas(800,496)
 D.drawTerrain(full.ctx,w,pal);D.drawActors(full.ctx,w,pal,{intro:false,feed:false})
 assert.equal(hash(small.buf),hash(crop(full,box.x*2,box.y*2,160,128).buf))
 const old=cache.terrain;gateAdvance(w,gate,1);gateFrame(D,w,gate,cache);assert.notEqual(cache.terrain,old,'real setGate repaints the crop')
 for(const change of[()=>w.terrainVersion++,()=>w.res=1,()=>w.res=2]){const previous=cache.terrain;change();gateFrame(D,w,gate,cache);assert.notEqual(cache.terrain,previous)}
 const previous=cache.terrain;gateFrame(D,w,gate,cache,'nord');assert.notEqual(cache.terrain,previous)
})
test('comparison follows actual close/open edges and outputs complete native/page cycles',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'gate-art-'))
 try{
  const r=gateStrips(out,{base:'HEAD',levels:[36,96]});assert.equal(r.records.length,2)
  for(const record of r.records){
   const f=record.frames;assert.equal(f.length,8);assert.equal(f[0].cycle,132);assert.equal(f[0].open,true);assert.equal(f[1].open,false);assert.equal(f[1].tick,f[1].changedAt)
   assert.equal(f[2].tick-f[1].tick,5);assert.ok(f[2].drop>0&&f[2].drop<f[3].drop)
   assert.equal(f[4].open,true);assert.equal(f[4].tick,f[4].changedAt);assert.equal(f[5].tick-f[4].tick,5);assert.ok(f[5].drop>f[6].drop);assert.equal(f[6].drop,0)
   for(const res of[1,2])for(const tag of['before','after']){const png=fs.readFileSync(path.join(out,`${record.level}-${tag}-res${res}.png`));assert.equal(png.readUInt32BE(16),80*res*8);assert.equal(png.readUInt32BE(20),64*res)}
  }
  assert.ok(fs.statSync(path.join(out,'contact-sheet.png')).size>1000);assert.match(fs.readFileSync(path.join(out,'index.html'),'utf8'),/prefers-reduced-motion/)
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
