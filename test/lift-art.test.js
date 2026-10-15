import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {occupiedLift,liftBox,liftFrame,journeyOffsets,liftStrips} from '../tools/lift-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),hash=b=>createHash('sha256').update(b).digest('hex')
const pal=P.build(themeOf('tokyo-night').theme,9)
function fixture(){
 const lift={x0:7,x1:11,mid:9.5,wallX:12,out:1,headY:10,top:16,bottom:46,stops:[16,26,36,46],at:1,to:2,dir:1,car:26,hold:34,parked:false,riders:3,doorFor:34,stairs:false}
 return{w:{res:2,k:{CELL:4},lifts:[lift],ticks:400},lift}
}
function record(fn){
 const img=canvas(400,248),ctx=img.ctx,calls=[]
 ctx.fillStyle='#123456';ctx.globalAlpha=0.35
 ctx.fillRect=(...r)=>{
  assert.ok(calls.length<250,'bounded paint');assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0,'positive finite rectangles')
  assert.ok(r.every(n=>Number.isInteger(n*2)),'half-pixel grid');assert.ok(ctx.globalAlpha<=0.35+1e-9,'respect inherited opacity')
  calls.push([...r,ctx.fillStyle,ctx.globalAlpha])
 }
 fn(ctx);assert.equal(ctx.globalAlpha,0.35);assert.equal(ctx.fillStyle,'#123456');return calls
}
test('an actual served stop gives one bounded arrival signal, never a passing, idle, future or reduced-motion flash',()=>{
 const{w,lift:L}=fixture()
 const seen=[]
 for(let doorFor=34;doorFor>=0;doorFor--){L.doorFor=doorFor;const v=D.liftArrivalLight(w,L);assert.ok(v>=0&&v<=1);seen.push(v)}
 assert.equal(seen.filter(Boolean).length,12);assert.equal(seen[0],0.25);assert.equal(seen[12],0)
 for(const over of[{parked:true},{hold:0},{hold:-1},{doorFor:35},{doorFor:-1},{doorFor:undefined}])assert.equal(D.liftArrivalLight(w,{...L,...over}),0)
 L.doorFor=34;assert.equal(D.liftArrivalLight({...w,reducedMotion:true},L),0)
 const served=record(ctx=>D.drawPageLiftPortal(ctx,w,pal,L,1,48,82,104,55,true))
 const unserved=record(ctx=>D.drawPageLiftPortal(ctx,w,pal,L,0,48,82,104,55,true))
 const closed=record(ctx=>D.drawPageLiftPortal(ctx,w,pal,L,1,48,82,104,55,false))
 assert.equal(served.length,unserved.length+4);assert.equal(unserved.length,closed.length)
})
test('warm cabins keep the exact rider floor; all new paint is finite, local, bounded and opacity-safe',()=>{
 const{w,lift:L}=fixture()
 for(const dir of[-1,1])for(const riders of[0,1,5])for(const doorFor of[34,30,24,0]){
  Object.assign(L,{dir,riders,doorFor,car:26+doorFor/10})
  const marks=record(ctx=>D.drawPageLiftCabin(ctx,w,pal,L,28,40,20))
  assert.ok(marks.length<=40)
  assert.ok(marks.some(([x,y,width,height])=>x===30&&y===60&&width===16&&height===3),'floor plate stays under the riders')
  for(const[x,y,width,height]of marks){assert.ok(x>=30&&x+width<=46);assert.ok(y>=40&&y+height<=64)}
  const cable=record(ctx=>D.drawPageLiftCable(ctx,w,pal,L,40,184));assert.ok(cable.length<=20)
  for(const[x,y,width,height]of cable){assert.ok(x>=36&&x+width<=40);assert.ok(y>=40&&y+height<=184)}
 }
})
test('roof occupancy lamps match all five seats without altering boarding or covering passengers',()=>{
 const{lift:L}=fixture()
 for(let riders=0;riders<=5;riders++){
  L.riders=riders;const ctx=canvas(80,80).ctx,calls=[]
  ctx.fillRect=(...r)=>calls.push([...r,ctx.fillStyle])
  D.drawLiftOccupancy(ctx,pal,L,28,40);assert.equal(calls.length,5)
  assert.equal(calls.filter(c=>c[4]===D.LIFT_LAMP).length,riders)
  assert.ok(calls.every(c=>c[1]===41.5&&c[3]===0.5))
 }
})
test('reduced motion holds the secondary lamp and cable details steady without changing travel or door state',()=>{
 const{w,lift:L}=fixture();w.reducedMotion=true
 let first
 for(const car of[26,27.2,29.6])for(const doorFor of[34,31,25,0])for(const hold of[0,1,34]){
  Object.assign(L,{car,doorFor,hold});const calls=record(ctx=>D.drawPageLiftCabin(ctx,w,pal,L,28,40,20))
  if(!first)first=calls;else assert.deepEqual(calls,first)
 }
 const a=record(ctx=>D.drawPageLiftCable(ctx,w,pal,L,40,180));L.car+=0.6;assert.deepEqual(record(ctx=>D.drawPageLiftCable(ctx,w,pal,L,40,180)),a)
 const normal=[];w.reducedMotion=false;L.hold=0
 for(const car of[26,27.2,29.6]){L.car=car;normal.push(JSON.stringify(record(ctx=>D.drawPageLiftCabin(ctx,w,pal,L,28,40,20))))}
 assert.ok(new Set(normal).size>1,'ordinary travelling lamp has secondary motion')
})
test('native cabins and doors retain their original pixels across stop/travel/capacity/direction cases',()=>{
 const h=createHash('sha256'),{w,lift:L}=fixture()
 for(const res of[undefined,1,3])for(const dir of[-1,1])for(const car of[16,26,28.4,46])for(const parked of[false,true]){
  Object.assign(w,{res});Object.assign(L,{car,parked,dir});const img=canvas(400,248)
  D.drawLifts(img.ctx,w,pal);h.update(img.buf)
 }
 assert.equal(h.digest('hex'),'80f8f6b104566c36e52f0cc48a6570aea2a43dc7cd3fd2893d8e53643543c5ac')
})
test('real occupied travel, arrival and fire escapes render read-only and RNG-free in five themes',()=>{
 const random=Math.random
 try{for(const level of[9,29,49]){
  const{w,lift:L}=occupiedLift(level),at=w.ticks,offsets=journeyOffsets(L)
  for(const offset of offsets){
   while(w.ticks<at+offset)S.step(w)
   for(const name of Object.keys(THEMES)){
    const before=hash(JSON.stringify(w));Math.random=()=>{throw Error('render RNG')}
    const first=liftFrame(D,w,L,{},name);assert.equal(hash(liftFrame(D,w,L,{},name).buf),hash(first.buf));assert.equal(hash(JSON.stringify(w)),before)
    Math.random=random
   }
  }
  assert.ok(offsets.length===8);assert.ok(L.hold>0||L.parked,'fixture reaches a real stop')
 }}finally{Math.random=random}
 assert.throws(()=>occupiedLift(1),/No occupied lift in 12000 ticks/)
 // Fire-escape drawing stays in the existing path, including at page res.
 const w=S.generate(9,0,3),L=w.lifts.find(l=>l.stairs);assert.ok(L);w.res=2
 const img=canvas(800,496),before=hash(JSON.stringify(w));D.drawLifts(img.ctx,w,pal);assert.equal(hash(JSON.stringify(w)),before)
})
test('direct crops match full actors and refresh on terrain, resolution and palette changes',()=>{
 const{w,lift}=occupiedLift(),cache={},box=liftBox(w,lift),small=liftFrame(D,w,lift,cache),full=canvas(800,496)
 D.drawTerrain(full.ctx,w,pal);D.drawActors(full.ctx,w,pal,{intro:false,feed:false})
 assert.equal(hash(small.buf),hash(crop(full,box.x*2,box.y*2,160,128).buf))
 for(const change of[()=>w.terrainVersion++,()=>w.res=1,()=>w.res=2]){const old=cache.terrain;change();liftFrame(D,w,lift,cache);assert.notEqual(cache.terrain,old)}
 const old=cache.terrain;liftFrame(D,w,lift,cache,'nord');assert.notEqual(cache.terrain,old)
})
test('bounded comparison emits native/page strips and an accessible static alternative',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'lift-art-'))
 try{
  const r=liftStrips(out,{base:'9c34e7e',levels:[9]});assert.equal(r.records.length,1);assert.equal(r.records[0].frames.length,8)
  for(const res of[1,2])for(const tag of['before','after'])assert.ok(fs.statSync(path.join(out,`9-${tag}-res${res}.png`)).size>100)
  assert.ok(fs.statSync(path.join(out,'contact-sheet.png')).size>1000)
  assert.match(fs.readFileSync(path.join(out,'index.html'),'utf8'),/prefers-reduced-motion/)
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
