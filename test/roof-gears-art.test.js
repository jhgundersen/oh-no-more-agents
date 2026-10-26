import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {load,canvas} from '../tools/render.js'
const S=load('Sim.js'),D=load('Draw.js'),hash=x=>createHash('sha256').update(x).digest('hex')
function marks(w,draw=D.drawRoofGearsLife){
 const ctx=canvas(800,496).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=.6
 ctx.fillRect=(...r)=>{assert.ok(calls.length<5000,'bounded fragments');assert.ok(r.every(Number.isFinite));assert.ok(r[2]>0&&r[3]>0);assert.ok(r.every(n=>Number.isInteger(n*2)),'half-pixel grid');assert.ok(ctx.globalAlpha>=0&&ctx.globalAlpha<=.6);calls.push([...r,ctx.fillStyle,ctx.globalAlpha])}
 draw(ctx,w);assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,.6);return calls
}
test('roofs, gears and fronds stay in backdrop air, deterministic, page-only, read-only and RNG-free',()=>{
 const random=Math.random
 try{Math.random=()=>assert.fail('ambient entropy')
 for(let level=1;level<=40;level++){
  const w=S.generate(level,0,3);w.res=2;w.ticks=1700;const before=hash(JSON.stringify(w)),calls=marks(w)
  assert.deepEqual(marks(w),calls);assert.equal(hash(JSON.stringify(w)),before)
  if(!['Rooftops','Clock Tower','Jungle'].includes(w.biome))assert.equal(calls.length,0)
  for(const[x,y,width,height]of calls)for(let yy=y;yy<y+height;yy+=.5)for(let xx=x;xx<x+width;xx+=.5)assert.ok(D.mechanismAir(w,xx,yy))
  for(const res of[undefined,1,3]){w.res=res;assert.equal(marks(w).length,0)}
 }
 }finally{Math.random=random}
})
test('new poses move visibly, reduced motion freezes them and replaced terrain invalidates the air mask',()=>{
 for(const level of[5,16,17,25,36,37]){
  const w=S.generate(level,0,3);w.res=2;w.ticks=1700;const first=marks(w);assert.ok(first.length>0)
  w.ticks=1737;assert.notDeepEqual(marks(w),first)
  w.reducedMotion=true;const still=marks(w);w.ticks=2400;assert.deepEqual(marks(w),still)
  const cached=D.roofGearsLayout(w);assert.equal(D.roofGearsLayout(w),cached)
  w.terrain=new Uint8Array(w.terrain).fill(w.k.ROCK);assert.notEqual(D.roofGearsLayout(w),cached);assert.equal(marks(w).length,0)
  w.terrain.fill(w.k.EMPTY);w.terrainVersion++;assert.ok(marks(w).length>0)
 }
})
test('fireflies and aircraft beacon use the shared dusk clock, with fixed reduced-motion light poses',()=>{
 for(const[level,draw]of[[5,D.drawGroveFireflies],[17,D.drawRoofAircraft]]){
  const w=S.generate(level,0,3);w.res=2;w.reducedMotion=true
  const light=()=>marks(w,(ctx,world)=>{ctx.save();draw(ctx,world,D.roofGearsLayout(world),0,ctx.globalAlpha);ctx.restore()}).filter(c=>c[4]===(level===5?'#d8df8e':'#ee9a8c'))
  w.ticks=0;assert.equal(light().length,0)
  w.ticks=940;const mid=light();assert.ok(mid.length>0)
  w.ticks=1700;const late=light();assert.equal(late.length,mid.length)
  assert.ok(late.every((c,i)=>c[5]>mid[i][5]));assert.deepEqual(late.map(c=>c.slice(0,5)),mid.map(c=>c.slice(0,5)))
 }
})
test('older smoke, dial motion and jungle air share fixed reduced-motion poses',()=>{
 for(const[level,draw]of[[5,D.drawJungleLife],[16,D.drawDialMotion],[17,D.drawNightWisps]]){
  const w=S.generate(level,0,3);w.res=2;w.reducedMotion=true;w.ticks=1700
  const ctx=canvas(800,496),first=()=>{ctx.buf.fill(0);draw(ctx.ctx,w);return hash(ctx.buf)}
  const still=first();w.ticks=2400;assert.equal(first(),still)
 }
})
test('the ambient dispatcher includes this batch and rendering preserves live simulation digests',()=>{
 const random=Math.random
 try{for(const level of[4,5,6,15,16,17,18,25,36,37]){
  const a=S.generate(level,0,3),b=S.generate(level,0,3);a.res=b.res=2
  if([5,16,17].includes(level)){a.ticks=b.ticks=1700;assert.ok(marks(a,D.drawBackdropLife).length>0);a.ticks=b.ticks=0}
  for(let tick=0;tick<450;tick++){
   Math.random=()=>.25;S.step(a);Math.random=()=>.25;S.step(b)
   if(tick%19===0)marks(a)
  }
  assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))
 }}finally{Math.random=random}
})
