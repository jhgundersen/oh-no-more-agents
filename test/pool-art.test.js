import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {poolScene,poolBox,poolFrame,poolStrips,POOL_LEVELS} from '../tools/pool-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),hash=b=>createHash('sha256').update(b).digest('hex')
function marks(fn){
 const ctx=canvas(400,248).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=0.35
 ctx.fillRect=(...r)=>{assert.ok(calls.length<1500,'bounded paint');assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0);assert.ok(r.every(n=>Number.isInteger(n*2)),'half-pixel grid');assert.ok(ctx.globalAlpha<=0.35+1e-9);calls.push([...r,ctx.fillStyle,ctx.globalAlpha])}
 fn(ctx);assert.equal(ctx.globalAlpha,0.35);assert.equal(ctx.fillStyle,'#123456');return calls
}
function nativeAggregate(Draw=D){
 const h=createHash('sha256')
 for(const level of POOL_LEVELS)for(const name of Object.keys(THEMES))for(const res of[undefined,1,3])for(const reduced of[false,true]){
  const w=S.generate(level,0,3);w.res=res;w.reducedMotion=reduced;w.ticks=117
  for(const p of w.pits)p.ripple=109
  const img=canvas(400,248);Draw.drawPits(img.ctx,w,P.build(themeOf(name).theme,level));h.update(img.buf)
 }
 return h.digest('hex')
}
test('native/default and share-card liquid pits retain original pixels in all six biomes and five palettes',()=>{
 assert.equal(nativeAggregate(),'dd865be3426c8d9e88efd8ccbb7c9e1db9463be21e0ea14ac78ac2c8a0c4928f')
})
test('material surfaces are read-only, RNG-free, deterministic, bounded and restore canvas state',()=>{
 const random=Math.random
 try{for(const level of POOL_LEVELS){
  const{w,pool}=poolScene(level);const before=hash(JSON.stringify(w));Math.random=()=>{throw Error('render RNG')}
  for(const name of Object.keys(THEMES)){
   const pal=P.build(themeOf(name).theme,level),a=marks(ctx=>D.drawPagePool(ctx,w,pal,pool))
   assert.ok(a.length>0&&a.length<=160);assert.deepEqual(marks(ctx=>D.drawPagePool(ctx,w,pal,pool)),a)
  }
  assert.equal(hash(JSON.stringify(w)),before);Math.random=random
 }}finally{Math.random=random}
 assert.throws(()=>poolScene(5),/No liquid pit/)
})
test('new paint stays in current liquid air, with only the small entry crown above the shaft',()=>{
 for(const level of POOL_LEVELS){
  const{w,pool}=poolScene(level,{entry:true}),pal=P.build(themeOf('tokyo-night').theme,level)
  for(const age of[0,6,12,24,35,36]){
   w.ticks=pool.ripple+age
   const calls=marks(ctx=>D.drawPagePool(ctx,w,pal,pool))
   for(const[x,y,ww,hh]of calls)for(let yy=y;yy<y+hh;yy+=0.5)for(let xx=x;xx<x+ww;xx+=0.5){
    const cx=Math.floor(xx/4),cy=Math.floor(yy/4),i=cy*w.k.COLS+cx
    assert.ok(xx>=0&&xx<400&&yy>=0&&yy<248);assert.equal(w.terrain[i],0)
    if(cy<pool.surfaceY)assert.ok(cx>=pool.x0&&cx<=pool.x1&&yy>=pool.surfaceY*4-8)
    else assert.ok(pool.wet?pool.wet[i]:cx>=pool.x0&&cx<=pool.x1)
   }
  }
 }
})
test('clipping follows connected flood cells, carved side chambers, surviving bricks and board edges',()=>{
 const w=S.generate(8,0,3);w.terrain.fill(0);const p={x0:10,x1:12,surfaceY:20,wet:new Uint8Array(w.k.COLS*w.k.ROWS)}
 p.wet[20*w.k.COLS+9]=1;p.wet[20*w.k.COLS+10]=1;w.terrain[20*w.k.COLS+10]=1
 const a=marks(ctx=>{ctx.save();D.poolAccentRect(ctx,w,p,32,80,16,4);ctx.restore()})
 assert.deepEqual(a.map(c=>c.slice(0,4)),[[36,80,4,4]])
 assert.equal(marks(ctx=>{ctx.save();D.poolAccentRect(ctx,w,p,-8,-8,4,4);D.poolAccentRect(ctx,w,p,400,248,8,8);D.poolAccentRect(ctx,w,p,36,68,4,4);ctx.restore()}).length,0)
 p.wet=null;w.terrain[20*w.k.COLS+10]=0
 assert.deepEqual(marks(ctx=>{ctx.save();D.poolAccentRect(ctx,w,p,36,80,12,4);ctx.restore()}).map(c=>c.slice(0,4)),[[40,80,4,4],[44,80,4,4]])
})
test('all four materials move gently and settle to the same texture under reduced motion',()=>{
 for(const level of[2,24,7,8]){
  const{w,pool}=poolScene(level),pal=P.build(themeOf('tokyo-night').theme,level);pool.ripple=-999
  const poses=new Set()
  for(const tick of[0,6,18,36,72,100]){w.ticks=tick;poses.add(hash(JSON.stringify(marks(ctx=>D.drawPagePool(ctx,w,pal,pool)))))}
  assert.ok(poses.size>1)
  w.reducedMotion=true;w.ticks=0;const first=marks(ctx=>D.drawPagePool(ctx,w,pal,pool))
  for(const tick of[1,12,60,120]){w.ticks=tick;assert.deepEqual(marks(ctx=>D.drawPagePool(ctx,w,pal,pool)),first)}
 }
})
test('entry rings use the existing sink location for colleagues and enemies; flood-only rings use pool centre',()=>{
 const{w,pool}=poolScene(8,{entry:true}),ag=w.agents.at(-1)
 assert.equal(ag.diedAt,pool.ripple);assert.equal(D.poolImpactX(w,pool),Math.round(ag.x*8)/2)
 assert.notEqual(D.poolImpactX(w,pool),(pool.x0+pool.x1+1)*2)
 ag.diedAt--;const en={x:pool.x1-0.5,y:pool.surfaceY,gone:false};S.sinkEnemy(w,en,pool);w.enemies.push(en);S.noteDeaths(w)
 assert.equal(D.poolImpactX(w,pool),en.x*4)
 en.y--;assert.equal(D.poolImpactX(w,pool),(pool.x0+pool.x1+1)*2)
})
test('entry effect expires, reduced motion has a short static mark, and the waterline settles too',()=>{
 const{w,pool}=poolScene(8,{entry:true}),pal=P.build(themeOf('tokyo-night').theme,8)
 const draw=()=>marks(ctx=>{ctx.save();D.drawPagePoolImpact(ctx,w,pal,pool);ctx.restore()})
 w.ticks=pool.ripple-1;assert.equal(draw().length,0);w.ticks=pool.ripple+36;assert.equal(draw().length,0)
 w.reducedMotion=true;w.ticks=pool.ripple;const first=draw();assert.ok(first.length>0)
 w.ticks++;const next=draw();assert.deepEqual(first.map(c=>c.slice(0,5)),next.map(c=>c.slice(0,5)))
 w.ticks=pool.ripple+6;assert.equal(draw().length,0)
 const line=()=>marks(ctx=>{ctx.save();D.drawPoolWaterline(ctx,w,pal,pool,pool.x0*4,(pool.x1-pool.x0+1)*4);ctx.restore()})
 const a=line();w.ticks+=120;assert.deepEqual(line(),a)
})
test('drawing during live simulation leaves digests identical and preserves current pool masks',()=>{
 const random=Math.random
 try{for(const level of POOL_LEVELS){
  const a=S.generate(level,0,3),b=S.generate(level,0,3);a.res=b.res=2
  for(let tick=0;tick<500;tick++){
   Math.random=()=>0.25;S.step(a);S.step(b)
   if(tick%25===0){const img=canvas(800,496);D.drawPits(img.ctx,a,P.build(themeOf('tokyo-night').theme,level));assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))}
  }
 }}finally{Math.random=random}
})
test('cached direct crops equal full-frame crops through spill updates and resolution changes',()=>{
 const D=load('Draw.js'),{w,pool}=poolScene(8),cache={}
 for(const res of[1,2])for(const rising of[false,true]){
  w.res=res;if(rising){pool.rising=3;w.ticks=104;S.stepSpill(w)}
  const img=canvas(400*res,248*res,themeOf('tokyo-night').background),pal=P.build(themeOf('tokyo-night').theme,w.level),box=poolBox(w,pool)
  D.drawTerrain(img.ctx,w,pal);D.drawActors(img.ctx,w,pal,{intro:false,feed:false})
  const expected=crop(img,box.x*res,box.y*res,box.width*res,box.height*res)
  assert.equal(hash(poolFrame(D,w,pool,cache).buf),hash(expected.buf));assert.equal(hash(poolFrame(D,w,pool,cache).buf),hash(expected.buf))
 }
})
test('comparison harness renders bounded ambient and explicitly staged entry strips',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pool-art-'))
 try{
  const result=poolStrips(dir,{base:'e114230',levels:[8]});assert.equal(result.records.length,2);assert.equal(result.records[0].frames.length,8)
  assert.ok(fs.statSync(path.join(dir,'8-entry-after-res2.png')).size>0);assert.match(fs.readFileSync(path.join(dir,'index.html'),'utf8'),/explicitly stage/)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
