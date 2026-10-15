import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {occupiedCrane,craneUntil,craneAdvance,craneBox,craneFrame,craneStrips} from '../tools/crane-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),hash=b=>createHash('sha256').update(b).digest('hex')
const pal=P.build(themeOf('tokyo-night').theme,15)
function marks(fn,{balanced=false}={}){
 const ctx=canvas(400,248).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=0.35
 ctx.fillRect=(...r)=>{
  assert.ok(calls.length<4000,'bounded paint');assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0)
  assert.ok(r.every(n=>Number.isInteger(n*2)),'half-pixel grid');assert.ok(ctx.globalAlpha<=0.35+1e-9,'inherited opacity')
  calls.push([...r,ctx.fillStyle,ctx.globalAlpha])
 }
 fn(ctx);assert.equal(ctx.globalAlpha,0.35);if(balanced)assert.equal(ctx.fillStyle,'#123456');return calls
}
function nativeAggregate(Draw=D){
 const h=createHash('sha256')
 for(const level of[15,35,75]){
  const{w,crane}=occupiedCrane(level),ag=w.agents.find(a=>a.id===crane.who)
  for(const name of Object.keys(THEMES))for(const res of[undefined,1,3])for(const reduced of[false,true])for(const phase of['wait','up','across','down','back']){
   w.res=res;w.reducedMotion=reduced;w.ticks=240
   Object.assign(crane,{phase,drop:4.5,hookX:(crane.ax+crane.hx)/2,who:ag.id});ag.state='hooked'
   const img=canvas(400,248),colors=P.build(themeOf(name).theme,level)
   Draw.drawCrane(img.ctx,w,colors,crane);Draw.drawHookedAgent(img.ctx,w,colors,ag,{});h.update(img.buf)
  }
 }
 return h.digest('hex')
}
test('native/default and share-card cranes and riders preserve the original bytes in every phase and palette',()=>{
 assert.equal(nativeAggregate(),'eb6ed354293f5c703d7bfe9b2bd102cfa9c1d4691335579b06672622294a8055')
})
test('rope, block and rider keep the exact simulation contacts through real journeys, without RNG or world writes',()=>{
 const random=Math.random
 try{for(const level of[15,35,75]){
  const{w,crane}=occupiedCrane(level),phases=new Set()
  for(let frame=0;frame<8;frame++){
   craneAdvance(w,crane,frame);phases.add(crane.phase)
   const g=D.craneDrawing(w,crane),box=craneBox(w,crane)
   assert.equal(g.tipY,g.feet-10);assert.ok(g.railY>=box.y&&g.feet<=box.y+box.height)
   if(crane.who>=0){const ag=w.agents.find(a=>a.id===crane.who);assert.deepEqual(D.hookedDrawing(w,ag),g);assert.equal(g.feet,Math.round((ag.y+1)*8)/2)}
   for(const name of Object.keys(THEMES)){
    const before=hash(JSON.stringify(w)),colors=P.build(themeOf(name).theme,level);Math.random=()=>{throw Error('render RNG')}
    const a=marks(ctx=>D.drawCrane(ctx,w,colors,crane),{balanced:true})
    assert.deepEqual(marks(ctx=>D.drawCrane(ctx,w,colors,crane),{balanced:true}),a);assert.ok(a.length<=800,'bounded cell-sliced hoist')
    assert.equal(hash(JSON.stringify(w)),before);Math.random=random
   }
  }
  assert.deepEqual([...phases].sort(),['across','back','down','up','wait'])
 }}finally{Math.random=random}
 assert.throws(()=>occupiedCrane(1),/No occupied crane/)
 const w=S.generate(15,0,3);assert.equal(craneUntil(w,()=>true,0),0);assert.throws(()=>craneUntil(w,()=>false,0),/stage exceeded 0/)
})
test('the girder stays inside the original four-pixel clearance and all machinery respects foreground stone',()=>{
 for(const level of[15,35,75]){
  const{w,crane}=occupiedCrane(level),g=D.craneDrawing(w,crane),left=Math.min(crane.ax,crane.hx)*4,width=(Math.abs(crane.ax-crane.hx)+1)*4
  const rail=marks(ctx=>D.drawHoistGirder(ctx,pal,left,g.railY,width))
  for(const[x,y,ww,hh]of rail)assert.ok(x>=left&&x+ww<=left+width&&y>=g.railY&&y+hh<=g.railY+4)
  for(const[x,y,ww,hh]of marks(ctx=>D.drawCrane(ctx,w,pal,crane),{balanced:true}))for(let yy=y;yy<y+hh;yy+=0.5)for(let xx=x;xx<x+ww;xx+=0.5)assert.ok(D.mechanismAir(w,xx,yy))
  w.terrain.fill(w.k.ROCK);assert.equal(marks(ctx=>D.drawCrane(ctx,w,pal,crane),{balanced:true}).length,0)
 }
})
test('reduced motion holds the complete hoist and rider steady through idle ticks and suppresses landing puffs',()=>{
 const{w,crane}=occupiedCrane(),ag=w.agents.find(a=>a.id===crane.who);w.reducedMotion=true
 for(const phase of['wait','up','across','down','back']){
  crane.phase=phase
  const draw=ctx=>{D.drawCrane(ctx,w,pal,crane);D.drawHookedAgent(ctx,w,pal,ag,{})},first=marks(draw,{balanced:true})
  for(const t of[1,7,15,31]){w.ticks+=t;assert.deepEqual(marks(draw,{balanced:true}),first)}
  assert.equal(D.craneDrawing(w,crane).tipX,D.craneDrawing(w,crane).x)
 }
 for(const distance of[-1.5,0,2.3,14])assert.equal(D.hoistTurn(w,distance),0)
 const states=new Set([0,0.25,0.5,0.75,-0.25].map(n=>D.hoistTurn({reducedMotion:false},n)));assert.equal(states.size,4)
})
test('drum and wheels respond to lift/travel rather than wall-clock ticks or a stalled wait',()=>{
 const{w,crane}=occupiedCrane(),g=D.craneDrawing(w,crane);crane.phase='up'
 const first=marks(ctx=>D.drawHoistTrolley(ctx,w,pal,crane,g));w.ticks+=100
 assert.deepEqual(marks(ctx=>D.drawHoistTrolley(ctx,w,pal,crane,g)),first)
 crane.drop+=0.25;assert.notDeepEqual(marks(ctx=>D.drawHoistTrolley(ctx,w,pal,crane,g)),first)
 const wound=marks(ctx=>D.drawHoistTrolley(ctx,w,pal,crane,g));crane.hookX+=0.25
 assert.notDeepEqual(marks(ctx=>D.drawHoistTrolley(ctx,w,pal,crane,g)),wound)
 for(const tipY of[g.railY+10,g.railY+20,g.railY+100]){
  const gg={...g,tipY},calls=marks(ctx=>D.drawHoistRopes(ctx,w,pal,crane,gg))
  for(const[x,y,width,height]of calls)assert.ok(y>=g.railY+5&&y+height<=tipY-9.5&&width===0.5)
 }
})
test('set-down puffs follow the existing release distance, expire, and do not appear on aborted releases',()=>{
 const{w,crane}=occupiedCrane();craneUntil(w,()=>crane.phase==='back')
 assert.equal(D.hoistSetdownAge(crane),0)
 const first=marks(ctx=>D.drawHoistSetdown(ctx,w,pal,crane));assert.ok(first.length>0&&first.length<=4)
 for(const patch of[{phase:'wait'},{hookX:crane.ax},{usedAt:-1},{drop:99},{drop:0}])assert.equal(D.hoistSetdownAge({...crane,...patch}),-1)
 for(let i=0;i<11;i++)S.step(w)
 assert.equal(marks(ctx=>D.drawHoistSetdown(ctx,w,pal,crane)).length,0)
})
test('direct crops equal full frames, contain the complete long shaft, and refresh cached terrain and palette',()=>{
 for(const level of[15,75]){
  const{w,crane}=occupiedCrane(level),cache={},box=craneBox(w,crane),colors=P.build(themeOf('tokyo-night').theme,level)
  const small=craneFrame(D,w,crane,cache),full=canvas(800,496);D.drawTerrain(full.ctx,w,colors);D.drawActors(full.ctx,w,colors,{intro:false,feed:false})
  assert.equal(hash(small.buf),hash(crop(full,box.x*2,box.y*2,224,box.height*2).buf))
  assert.ok((crane.land+1)*4<box.y+box.height)
  for(const change of[()=>w.terrainVersion++,()=>w.res=1,()=>w.res=2]){const old=cache.terrain;change();craneFrame(D,w,crane,cache);assert.notEqual(cache.terrain,old)}
  const old=cache.terrain;craneFrame(D,w,crane,cache,'nord');assert.notEqual(cache.terrain,old)
 }
})
test('comparison includes real lift, mid-descent, set-down and return, with variable-height native/page strips',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'crane-art-'))
 try{
  const r=craneStrips(out,{base:'HEAD',levels:[15,75]});assert.equal(r.records.length,2)
  for(const record of r.records){
   const f=record.frames;assert.equal(f.length,8);assert.equal(f[0].phase,'up');assert.equal(f[1].phase,'across');assert.equal(f[3].phase,'down');assert.ok(f[4].drop>=f[5].drop/2&&f[4].drop<f[5].drop);assert.equal(f[5].phase,'back');assert.equal(f[5].who,-1);assert.equal(f[7].phase,'wait')
   for(const res of[1,2])for(const tag of['before','after']){const png=fs.readFileSync(path.join(out,`${record.level}-${tag}-res${res}.png`));assert.equal(png.readUInt32BE(16),112*res*8);assert.equal(png.readUInt32BE(20),record.box.height*res)}
  }
  assert.ok(r.records[1].box.height>r.records[0].box.height,'long descent remains visible')
  assert.ok(fs.statSync(path.join(out,'contact-sheet.png')).size>1000);assert.match(fs.readFileSync(path.join(out,'index.html'),'utf8'),/prefers-reduced-motion/)
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
