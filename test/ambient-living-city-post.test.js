import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {load,canvas,themeOf} from '../tools/render.js'
const S=load('Sim.js'),D=load('Draw.js'),hash=x=>createHash('sha256').update(x).digest('hex')
function marks(w,draw=D.drawCityPostLife){
 const ctx=canvas(800,496).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=.6
 ctx.fillRect=(...r)=>{assert.ok(calls.length<5000,'bounded fragments');assert.ok(r.every(Number.isFinite));assert.ok(r[2]>0&&r[3]>0);assert.ok(r.every(n=>Number.isInteger(n*2)),'half-pixel grid');assert.ok(ctx.globalAlpha>=0&&ctx.globalAlpha<=.6);calls.push([...r,ctx.fillStyle,ctx.globalAlpha])}
 draw(ctx,w);assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,.6);return calls
}
test('Living city, post and worksite stay in backdrop air, deterministic, page-only, read-only and RNG-free',()=>{
 const random=Math.random
 try{Math.random=()=>assert.fail('ambient entropy')
 for(let level=1;level<=40;level++){
  const w=S.generate(level,0,3);w.res=2;w.ticks=1700;const before=hash(JSON.stringify(w)),calls=marks(w)
  assert.deepEqual(marks(w),calls);assert.equal(hash(JSON.stringify(w)),before)
  if(!["Skyscraper", "Mail Room", "Building Site"].includes(w.biome))assert.equal(calls.length,0)
  for(const[x,y,width,height]of calls)for(let yy=y;yy<y+height;yy+=.5)for(let xx=x;xx<x+width;xx+=.5)assert.ok(D.mechanismAir(w,xx,yy))
  for(const res of[undefined,1,3]){w.res=res;assert.equal(marks(w).length,0)}
 }
 }finally{Math.random=random}
})
test('new poses move visibly, reduced motion freezes them and replaced terrain invalidates the air mask',()=>{
 for(const level of[9, 14, 15, 29, 34, 35]){
  const w=S.generate(level,0,3);w.res=2;w.ticks=1700;const first=marks(w);assert.ok(first.length>0)
  w.ticks=1737;assert.notDeepEqual(marks(w),first)
  w.reducedMotion=true;const still=marks(w);w.ticks=2400;assert.deepEqual(marks(w),still)
  const cached=D.quietBackdropLayout(w);assert.equal(D.quietBackdropLayout(w),cached)
  w.terrain=new Uint8Array(w.terrain).fill(w.k.ROCK);assert.notEqual(D.quietBackdropLayout(w),cached);assert.equal(marks(w).length,0)
  w.terrain.fill(w.k.EMPTY);w.terrainVersion++;assert.ok(marks(w).length>0)
 }
})
test('the ambient dispatcher includes this batch and rendering preserves live simulation digests',()=>{
 const random=Math.random
 try{for(const level of[8, 9, 10, 13, 14, 15, 16, 29, 34, 35]){
  const a=S.generate(level,0,3),b=S.generate(level,0,3);a.res=b.res=2
  if([9, 14, 15].includes(level)){a.ticks=b.ticks=1700;assert.deepEqual(marks(a,D.drawBackdropLife),marks(a));a.ticks=b.ticks=0}
  for(let tick=0;tick<450;tick++){
   Math.random=()=>.25;S.step(a);Math.random=()=>.25;S.step(b)
   if(tick%19===0)marks(a)
  }
  assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))
 }}finally{Math.random=random}
})

test('existing distant scenery keeps fixed reduced-motion poses too',()=>{for(const[level,draw]of[[9,D.drawOfficeLife],[14,D.drawPostalCycle],[15,D.drawWorkDrums]]){const w=S.generate(level,0,3);w.res=2;w.reducedMotion=true;w.ticks=1700;const c=canvas(800,496),pal=load('Palette.js').build(themeOf('tokyo-night').theme,level),digest=()=>{c.buf.fill(0);draw(c.ctx,w,pal);return hash(c.buf)};const still=digest();w.ticks=2400;assert.equal(digest(),still)}})
