import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {occupiedTrain,metroAdvance,metroUntil,metroBox,metroFrame,metroStrips} from '../tools/train-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),hash=b=>createHash('sha256').update(b).digest('hex')
const pal=P.build(themeOf('tokyo-night').theme,18)
function marks(fn,{balanced=false}={}){
 const ctx=canvas(400,248).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=0.35
 ctx.fillRect=(...r)=>{
  assert.ok(calls.length<4000,'fixed paint bound');assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0)
  assert.ok(r.every(n=>Number.isInteger(n*2)),'half-pixel grid');assert.ok(ctx.globalAlpha<=0.35+1e-9,'inherited opacity')
  calls.push([...r,ctx.fillStyle,ctx.globalAlpha])
 }
 fn(ctx);assert.equal(ctx.globalAlpha,0.35);if(balanced)assert.equal(ctx.fillStyle,'#123456');return calls
}
function nativeAggregate(){
 const h=createHash('sha256')
 for(const level of[18,38])for(const theme of Object.keys(THEMES))for(const res of[undefined,1,3])for(const phase of['wait','run','drop','back']){
  const w=S.generate(level,0,3),tr=w.trains[0];w.res=res;w.ticks=240
  Object.assign(tr,{phase,t:2,x:(tr.ax+tr.bx)/2,v:0.35,riders:[1,2,3]})
  const img=canvas(400,248);D.drawSubwayTrain(img.ctx,w,P.build(themeOf(theme).theme,level),tr);h.update(img.buf)
 }
 return h.digest('hex')
}
test('native and share-card trains keep their original pixels in both directions and all five palettes',()=>{
 assert.equal(nativeAggregate(),'c6899737f5dc599313447c0476a8a814c4b0d2131ca8cb85bd7b80454d75c28e')
})
test('only the sprung body moves; open pickup doors and wheels stay on the platform, with calm reduced motion',()=>{
 const w={reducedMotion:false},tr={phase:'run',t:0,v:0.45,x:1}
 const poses=new Set()
 for(const x of[0.1,0.6,1.1,1.6]){tr.x=x;const bob=D.metroBodyBob(w,tr,false);assert.ok(Math.abs(bob)<=0.5);poses.add(bob);assert.equal(D.metroBodyBob(w,tr,true),0)}
 assert.equal(poses.size,3)
 tr.v=0;assert.equal(D.metroBodyBob(w,tr,false),0)
 for(let t=0;t<35;t++){tr.t=t;tr.phase='drop';assert.ok(Math.abs(D.metroBodyBob(w,tr,true))<=0.5);if(t>=6)assert.equal(D.metroBodyBob(w,tr,true),0)}
 for(const phase of['wait','run','drop','back'])for(let t=0;t<8;t++){Object.assign(tr,{phase,t,v:0.45});assert.equal(D.metroBodyBob({reducedMotion:true},tr,false),0)}
 const reduced={reducedMotion:true};tr.x=1
 const first=marks(ctx=>D.drawMetroWheels(ctx,reduced,pal,tr,100,120));tr.x=2.3
 assert.deepEqual(marks(ctx=>D.drawMetroWheels(ctx,reduced,pal,tr,100,120)),first)
 const live=marks(ctx=>D.drawMetroWheels(ctx,w,pal,tr,100,120));assert.ok(live.every(c=>c[1]>=117&&c[1]+c[3]<=120))
 assert.notDeepEqual(live,first,'hubs turn with travel, not idle time')
})
test('reduced motion keeps the complete train steady as idle ticks and dwell timers advance',()=>{
 for(const level of[18,38,78]){
  const{w,train}=occupiedTrain(level);w.reducedMotion=true
  for(const phase of['run','drop','back']){
   Object.assign(train,{phase,t:0,v:0.45})
   const first=marks(ctx=>D.drawSubwayTrain(ctx,w,pal,train),{balanced:true})
   for(const t of[1,2,7,12,34]){w.ticks+=17;train.t=t;assert.deepEqual(marks(ctx=>D.drawSubwayTrain(ctx,w,pal,train),{balanced:true}),first)}
  }
 }
})
test('pocket doors leave every window clear, preserve the lit step and keep an honest open/closed recess',()=>{
 for(const bob of[-0.5,0,0.5])for(const open of[false,true]){
  const calls=marks(ctx=>D.drawMetroDoors(ctx,100,120+bob,120,open))
  assert.ok(calls.some(([x,y,width,height])=>x===97&&y===118&&width===6&&height===0.5),'step stays on its original floor')
  for(const[x,y,width]of calls)assert.ok(x>=95.5&&x+width<=104.5,'no door or lamp covers a seated head')
  if(open)assert.ok(calls.length<10,'leaves retract into pockets instead of sliding over the windows')
 }
})
test('head/tail lamps swap at the physical ends on return, including a single carriage; spill stays ahead in current air',()=>{
 for(const dir of[-1,1])for(const phase of['wait','run','drop','back'])for(const cars of[1,2]){
  const tr={dir,phase},calls=[]
  for(let car=0;car<cars;car++)calls.push(...marks(ctx=>D.drawMetroEndLamps(ctx,tr,100-dir*38*car,120,car,cars)))
  const heads=calls.filter(c=>c[4]===D.METRO_WARM),tails=calls.filter(c=>c[4]===D.METRO_TAIL)
  assert.equal(heads.length,1);assert.equal(tails.length,1)
  const travel=phase==='back'?-dir:dir,leading=phase==='back'?100-dir*(cars-1)*38:100
  assert.equal(heads[0][0],leading+travel*16-0.5)
  const w=S.generate(18,0,3),g={x:180,y:160,cars,dir};w.terrain.fill(w.k.EMPTY)
  const spill=marks(ctx=>D.drawMetroHeadlight(ctx,w,tr,g));assert.equal(spill.length,3)
  const nose=180-dir*(phase==='back'?cars-1:0)*38+travel*18
  for(const[x,y,width]of spill)assert.ok(travel>0?x>nose:x+width<nose)
  w.terrain.fill(w.k.STEEL);assert.equal(marks(ctx=>D.drawMetroHeadlight(ctx,w,tr,g)).length,0)
 }
})
test('HOME uses whole-art-pixel lettering and the rear car has a small route badge, all within the roof board',()=>{
 for(const car of[0,1]){
  const calls=marks(ctx=>D.drawMetroRollsign(ctx,100,120,car));assert.ok(calls.length>8)
  const ink=calls.filter(c=>c[4]===D.METRO_WARM);assert.ok(ink.every(c=>c[2]===1&&c[3]===1))
  for(const[x,y,width,height]of calls)assert.ok(x>=91&&x+width<=109&&y>=98&&y+height<=104)
  if(!car)assert.ok(ink.length>30)
 }
})
test('real occupied journeys, brake, dock and return are bounded, RNG-free and read-only in all palettes',()=>{
 const random=Math.random
 try{for(const level of[18,38,78]){
  const{w,train}=occupiedTrain(level),phases=new Set()
  for(let frame=0;frame<8;frame++){
   metroAdvance(w,train,frame);phases.add(train.phase)
   for(const theme of Object.keys(THEMES)){
    const colors=P.build(themeOf(theme).theme,level),before=hash(JSON.stringify(w));Math.random=()=>{throw Error('render RNG')}
    const one=marks(ctx=>D.drawSubwayTrain(ctx,w,colors,train),{balanced:true})
    assert.deepEqual(marks(ctx=>D.drawSubwayTrain(ctx,w,colors,train),{balanced:true}),one)
    assert.equal(hash(JSON.stringify(w)),before);Math.random=random
   }
  }
  assert.ok(phases.has('run')&&phases.has('drop')&&phases.has('back'))
 }}finally{Math.random=random}
 assert.throws(()=>occupiedTrain(1),/No occupied metro/)
 const w=S.generate(18,0,3);assert.equal(metroUntil(w,()=>true,0),0);assert.throws(()=>metroUntil(w,()=>false,0),/stage exceeded 0/)
})
test('new metro ink remains behind walkers and clipped to foreground terrain, including edge-of-board headlight spill',()=>{
 const{w,train}=occupiedTrain();w.terrain.fill(w.k.EMPTY)
 const g=D.subwayTrainDrawing(w,train),col=Math.floor(g.x/4),row=Math.floor((g.y-12)/4)
 w.terrain[row*w.k.COLS+col]=w.k.ROCK
 for(const[x,y,width,height]of marks(ctx=>D.drawSubwayTrain(ctx,w,pal,train),{balanced:true}))for(let yy=y;yy<y+height;yy+=0.5)for(let xx=x;xx<x+width;xx+=0.5)
  assert.ok(D.mechanismAir(w,xx,yy))
 w.terrain.fill(w.k.STEEL);assert.equal(marks(ctx=>D.drawSubwayTrain(ctx,w,pal,train),{balanced:true}).length,0)
 w.terrain.fill(w.k.EMPTY)
 for(const dir of[-1,1])assert.equal(marks(ctx=>D.drawMetroHeadlight(ctx,w,{dir,phase:'run'},{x:dir>0?399:1,y:160,cars:1,dir})).length,0)
})
test('direct actor crops match full frames and refresh cached terrain, resolution and palette',()=>{
 const{w,train}=occupiedTrain(),cache={},box=metroBox(w,train),small=metroFrame(D,w,train,cache),full=canvas(800,496)
 D.drawTerrain(full.ctx,w,pal);D.drawActors(full.ctx,w,pal,{intro:false,feed:false})
 assert.equal(hash(small.buf),hash(crop(full,box.x*2,box.y*2,224,112).buf))
 for(const change of[()=>w.terrainVersion++,()=>w.res=1,()=>w.res=2]){const old=cache.terrain;change();metroFrame(D,w,train,cache);assert.notEqual(cache.terrain,old)}
 const old=cache.terrain;metroFrame(D,w,train,cache,'nord');assert.notEqual(cache.terrain,old)
})
test('comparison emits real pick-up to return frames, native/page sheets and a reduced-motion static alternative',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'metro-art-'))
 try{
  const r=metroStrips(out,{base:'HEAD',levels:[18,38]});assert.equal(r.records.length,2)
  for(const record of r.records){assert.equal(record.frames.length,8);assert.equal(record.frames[0].phase,'run');assert.ok(record.frames[3].v<S.TRAIN_SPEED*0.85&&record.frames[3].v>0);assert.ok(Math.abs(record.frames[3].x-record.bx)<10,'braking on approach, not initial acceleration');assert.equal(record.frames[4].phase,'drop');assert.equal(record.frames[6].phase,'back')}
  for(const level of[18,38])for(const res of[1,2])for(const tag of['before','after']){const png=fs.readFileSync(path.join(out,`${level}-${tag}-res${res}.png`));assert.equal(png.readUInt32BE(16),112*res*8);assert.equal(png.readUInt32BE(20),56*res)}
  assert.ok(fs.statSync(path.join(out,'contact-sheet.png')).size>1000)
  assert.match(fs.readFileSync(path.join(out,'index.html'),'utf8'),/prefers-reduced-motion/)
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
