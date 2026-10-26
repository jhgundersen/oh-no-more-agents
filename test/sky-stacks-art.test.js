import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {load,canvas} from '../tools/render.js'
const S=load('Sim.js'),D=load('Draw.js'),hash=x=>createHash('sha256').update(x).digest('hex')
function marks(w,draw=D.drawSkyStackLife){
 const ctx=canvas(800,496).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=.6
 ctx.fillRect=(...r)=>{assert.ok(calls.length<5000,'bounded fragments');assert.ok(r.every(Number.isFinite));assert.ok(r[2]>0&&r[3]>0);assert.ok(r.every(n=>Number.isInteger(n*2)),'half-pixel grid');assert.ok(ctx.globalAlpha>=0&&ctx.globalAlpha<=.6);calls.push([...r,ctx.fillStyle,ctx.globalAlpha])}
 draw(ctx,w);assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,.6);return calls
}
test('sky/stacks/tunnel art is page-only, deterministic, clipped, RNG-free and read-only',()=>{
 const random=Math.random
 try{Math.random=()=>assert.fail('ambient entropy')
 for(let level=1;level<=40;level++){
  const w=S.generate(level,0,3);w.res=2;w.ticks=60;const before=hash(JSON.stringify(w)),calls=marks(w)
  assert.deepEqual(marks(w),calls);assert.equal(hash(JSON.stringify(w)),before)
  if(!['The Cloud','Library','Subway'].includes(w.biome))assert.equal(calls.length,0)
  for(const[x,y,width,height]of calls)for(let yy=y;yy<y+height;yy+=.5)for(let xx=x;xx<x+width;xx+=.5)assert.ok(D.mechanismAir(w,xx,yy))
  for(const res of[undefined,1,3]){w.res=res;assert.equal(marks(w).length,0)}
 }
 }finally{Math.random=random}
})
test('new motion is visible at page resolution, fixed under reduced motion and survives terrain replacement',()=>{
 for(const level of[13,18,20,33,38,40]){
  const w=S.generate(level,0,3);w.res=2;w.ticks=60;const first=marks(w);assert.ok(first.length>0)
  w.ticks=95;assert.notDeepEqual(marks(w),first)
  w.reducedMotion=true;const still=marks(w);w.ticks=709;assert.deepEqual(marks(w),still)
  const cached=D.skyStackLayout(w);assert.equal(D.skyStackLayout(w),cached)
  w.terrain=new Uint8Array(w.terrain).fill(w.k.ROCK);assert.notEqual(D.skyStackLayout(w),cached);assert.equal(marks(w).length,0)
  w.terrain.fill(w.k.EMPTY);w.terrainVersion++;assert.ok(marks(w).length>0)
 }
})
test('Cloud masks exclude cached bank contours and Library fits real windows/desks; tunnel light has a quiet interval',()=>{
 const w=S.generate(20,0,3);w.res=2;const scene=D.skyStackLayout(w)
 for(const b of D.cloudLayout(w).outline)for(let y=Math.max(0,Math.round(b.y*2));y<Math.min(scene.height,Math.round((b.y+b.height)*2));y++)for(let x=Math.max(0,Math.round(b.x*2));x<Math.min(scene.width,Math.round((b.x+b.width)*2));x++)assert.equal(scene.mask[y*scene.width+x],0)
 const lib=S.generate(13,0,3);lib.res=2;const rooms=D.skyStackLayout(lib);assert.ok(rooms.windows.length>0&&rooms.desks.length>0);assert.ok(rooms.windows.length<=2&&rooms.desks.length<=2)
 const sub=S.generate(18,0,3);sub.res=2;sub.ticks=180;assert.equal(marks(sub).length,0);sub.ticks=60;assert.ok(marks(sub).length>0)
})
test('Library lamp dust shares the fixed reduced-motion pose with the new window dust',()=>{
 const w=S.generate(13,0,3);w.res=2;w.reducedMotion=true;w.ticks=60;const still=marks(w,D.drawReadingDust);w.ticks=709;assert.deepEqual(marks(w,D.drawReadingDust),still)
})
test('drawing between live steps leaves complete simulation digests identical in all three and neighbouring biomes',()=>{
 const random=Math.random
 try{for(const level of[12,13,14,17,18,19,20,33,38,40]){
  const a=S.generate(level,0,3),b=S.generate(level,0,3);a.res=b.res=2
  for(let tick=0;tick<450;tick++){
   Math.random=()=>.25;S.step(a);Math.random=()=>.25;S.step(b)
   if(tick%19===0)marks(a)
  }
  assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))
 }}finally{Math.random=random}
})
