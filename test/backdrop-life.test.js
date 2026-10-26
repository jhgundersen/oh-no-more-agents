import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {load,canvas} from '../tools/render.js'
const S=load('Sim.js'),D=load('Draw.js'),hash=v=>createHash('sha256').update(v).digest('hex')
function marks(w){
 const ctx=canvas(800,496).ctx,calls=[]
 ctx.fillStyle='#123456';ctx.globalAlpha=.6
 ctx.fillRect=(...r)=>{assert.ok(calls.length<1000);assert.ok(r.every(Number.isFinite));assert.ok(r[2]>0&&r[3]>0);assert.ok(r.every(n=>Number.isInteger(n*2)));calls.push([...r,ctx.fillStyle,ctx.globalAlpha])}
 D.drawRackFans(ctx,w);D.drawPortGulls(ctx,w)
 assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,.6)
 return calls
}
test('rack fans and port gulls are gated, bounded, clipped to air, and leave the world and RNG alone',()=>{
 const random=Math.random
 try{Math.random=()=>assert.fail('ambient RNG')
 for(let level=1;level<=40;level++){
  const w=S.generate(level,0,3);w.res=2;const before=hash(JSON.stringify(w)),calls=marks(w)
  assert.equal(hash(JSON.stringify(w)),before)
  if(![12,19,32,39].includes(level))assert.equal(calls.length,0)
  for(const[x,y,width,height]of calls)for(let yy=y;yy<y+height;yy+=.5)for(let xx=x;xx<x+width;xx+=.5)assert.ok(D.mechanismAir(w,xx,yy))
  for(const res of[undefined,1,3]){w.res=res;assert.equal(marks(w).length,0)}
 }
 }finally{Math.random=random}
})
test('both biomes animate gently, retain fixed reduced-motion poses, and do not retain stale terrain masks',()=>{
 for(const level of[12,19,32,39]){
  const w=S.generate(level,0,3);w.res=2;w.ticks=0;const first=marks(w);assert.ok(first.length>0)
  w.ticks=91;assert.notDeepEqual(marks(w),first)
  w.reducedMotion=true;const still=marks(w);w.ticks=709;assert.deepEqual(marks(w),still)
  w.terrain.fill(w.k.ROCK);w.terrainVersion++;assert.equal(marks(w).length,0)
 }
})
test('ambient rendering between live steps preserves complete simulation digests on both and neighbouring biomes',()=>{
 const random=Math.random
 try{for(const level of[11,12,13,18,19,20,32,39]){
  const a=S.generate(level,0,3),b=S.generate(level,0,3);a.res=b.res=2
  for(let tick=0;tick<450;tick++){
   Math.random=()=>.25;S.step(a);Math.random=()=>.25;S.step(b)
   if(tick%13===0)marks(a)
  }
  assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))
 }}finally{Math.random=random}
})
