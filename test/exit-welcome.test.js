import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {arrivalWorld,welcomeFrame,welcomeStrips,HOME_AGES} from '../tools/exit-welcome.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),hash=b=>createHash('sha256').update(b).digest('hex')
const pal=P.build(themeOf('tokyo-night').theme,1)
function arrival(w){return w.agents.find(a=>!a.gone&&a.state==='saved')}
function marks(w,fn=ctx=>D.drawExitWelcome(ctx,w,pal)){
 const img=canvas(400,248),calls=[],ctx=img.ctx
 ctx.fillRect=(...r)=>{assert.ok(calls.length<48,'fixed paint budget');assert.ok(r.every(Number.isFinite));assert.ok(r.every(n=>Number.isInteger(n*2)),'half-pixel grid');assert.ok(r[2]>0&&r[3]>0);calls.push([...r,ctx.globalAlpha,ctx.fillStyle])}
 ctx.fillStyle='#123456';ctx.globalAlpha=0.35;fn(ctx)
 assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,0.35)
 return calls
}
test('native arrival actors retain the original pixels in all 20 biomes, including owned umbrellas',()=>{
 const h=createHash('sha256')
 for(let level=1;level<=20;level++){
  const w=arrivalWorld(level,3,1),at=w.ticks,a=arrival(w),cache={}
  for(const age of[0,4,10,15]){w.ticks=at+age;a.fade=age;h.update(welcomeFrame(D,w,cache).buf)}
 }
 assert.equal(h.digest('hex'),'5fca7a850f19b5067a611d3d3fec0ee450630925f0ad5e000a366d025243c1d8')
})
test('only real recent arrivals trigger; a crowd shares the strongest pulse and gone bodies cannot stick it on',()=>{
 const w=arrivalWorld(),a=arrival(w)
 assert.equal(D.exitWelcomeArrival(w),a)
 for(const over of[{res:1},{res:undefined},{res:3},{saved:0},{exit:null},{mission:{done:false}}])assert.equal(D.exitWelcomeArrival({...w,...over}),null)
 assert.equal(D.exitWelcomeArrival(null),null)
 const young={...a,id:900,fade:0},peak={...a,id:901,fade:4},gone={...a,fade:0,gone:true},old={...a,fade:15},outside={...a,x:w.exit.x-5},future={...a,fade:-1},walker={...a,state:'walk'}
 w.agents=[gone,old,outside,future,walker,young,peak];assert.equal(D.exitWelcomeArrival(w),peak)
 const count=marks(w).length;w.agents=Array.from({length:100},()=>({...peak}));assert.equal(marks(w).length,count,'no storm of per-agent effects')
 w.agents=[old,gone,outside,future,walker];assert.equal(D.exitWelcomeArrival(w),null);assert.equal(marks(w).length,0)
 w.agents=[a];w.done=true;w.doneTicks=0;assert.equal(D.exitWelcomeArrival(w),a,'the final colleague is welcomed too')
})
test('every biome has appropriate bounded paint; render is deterministic and read-only in five palettes',()=>{
 const random=Math.random
 try{for(let level=1;level<=20;level++){
  const w=arrivalWorld(level),a=arrival(w),e=w.exit,C=w.k.CELL
  assert.ok(Object.hasOwn(D.EXIT_WELCOMES,w.biome))
  for(const age of[0,4,10,14]){
   a.fade=age;const before=hash(JSON.stringify(w));Math.random=()=>{throw Error('render RNG')}
   const calls=marks(w);assert.ok(calls.length>=7)
   for(const[x,y,width,height]of calls){assert.ok(x>=e.x*C-10&&x+width<=(e.x+e.w)*C+14);assert.ok(y>=e.y*C-10&&y+height<=(e.y+e.h)*C+1)}
   assert.equal(hash(JSON.stringify(w)),before);Math.random=random
  }
  for(const name of Object.keys(THEMES)){
   const colors=P.build(themeOf(name).theme,level),draw=()=>{const img=canvas(400,248);D.drawExitWelcome(img.ctx,w,colors);return hash(img.buf)}
   const before=hash(JSON.stringify(w));Math.random=()=>{throw Error('render RNG')};assert.equal(draw(),draw());assert.equal(hash(JSON.stringify(w)),before);Math.random=random
  }
 }}finally{Math.random=random}
 const w=arrivalWorld();w.biome='__proto__';assert.ok(marks(w).length>0,'unknown biome uses the stone welcome')
})
test('reduced motion has one steady threshold light, without moving flourishes or an expanding doorway',()=>{
 for(const level of[10,13,14,17,20]){
  const w=arrivalWorld(level),a=arrival(w);w.reducedMotion=true;let first
  for(let age=0;age<15;age++){
   a.fade=age;w.ticks++;const calls=marks(w);assert.equal(calls.length,6)
   if(!first)first=calls;else assert.deepEqual(calls,first)
  }
  a.gone=true;assert.equal(marks(w).length,0)
 }
})
test('off-frame accents clip against current air and world edges',()=>{
 const w=arrivalWorld(),ctx=canvas(400,248).ctx;let count=0;ctx.fillRect=()=>count++
 w.terrain.fill(w.k.ROCK);D.welcomeAirMark(ctx,w,40,40,3,3);assert.equal(count,0)
 w.terrain.fill(w.k.EMPTY);D.welcomeAirMark(ctx,w,40,40,3,3);assert.equal(count,1)
 D.welcomeAirMark(ctx,w,-1,40,3,3);D.welcomeAirMark(ctx,w,399,40,3,3);assert.equal(count,1)
 w.terrain[10*w.k.COLS+10]=w.k.STEEL;D.welcomeAirMark(ctx,w,39.5,39.5,3,3);assert.equal(count,1)
})
test('home umbrellas carry through, close an in-use canopy, keep their ink, and respect native/diver/hero/reduced-motion poses',()=>{
 const w=arrivalWorld(20),a=arrival(w);w.saved--;Object.assign(a,{state:'fall',ownBrolly:true,special:false,fall:5,floater:true});assert.equal(S.agentAtExit(w,a,w.exit),'home')
 const draw=()=>{const img=canvas(100,100);img.ctx.setTransform(2,0,0,2,20,40);D.drawHomeUmbrella(img.ctx,w,pal,a,0,0);return hash(img.buf)}
 const phases=new Set();for(let age=0;age<8;age++){a.fade=age;phases.add(draw())}assert.ok(phases.size>=5)
 w.reducedMotion=true;a.fade=0;const calm=draw();a.fade=6;assert.equal(draw(),calm)
 w.reducedMotion=false;a.floater=false;a.fade=0;const cane=draw();a.fade=6;assert.equal(draw(),cane)
 for(const over of[{res:1},{submerged:true}])assert.equal(D.drawHomeUmbrella(canvas(10,10).ctx,{...w,...over},pal,a,0,0),false)
 for(const over of[{special:true},{ownBrolly:false},{state:'walk'}])assert.equal(D.drawHomeUmbrella(canvas(10,10).ctx,w,pal,{...a,...over},0,0),false)
 // Every canopy panel, its handle, and the following body keep the home fade.
 for(const fade of[0,2,4,6,7,14]){
  a.floater=true;a.fade=fade;const ctx=canvas(100,100).ctx,alpha=1-fade/14;ctx.globalAlpha=alpha;let count=0
  ctx.fillRect=()=>{assert.ok(count++<200);assert.ok(ctx.globalAlpha<=alpha+1e-9,'no opaque canopy panel during a fade')}
  D.drawHomeUmbrella(ctx,w,pal,a,20,20);assert.equal(ctx.globalAlpha,alpha,'body following the umbrella still fades');assert.ok(count>0)
 }
 // A drip's decision uses the arrival clock, not a future phase of its cycle.
 const d={x:10,top:5,floor:20,phase:0,period:100},under={state:'saved',x:10.5,y:12,fade:3}
 assert.equal(D.underDrip(d,under),false);assert.equal(D.underDrip(d,under,true),true)
 const source=fs.readFileSync(new URL('../public/agents/Draw.js',import.meta.url),'utf8')
 const scoped=new Function(source+'\ndripSpots=function(){return [{x:10,top:5,floor:20,phase:0,period:100}]};return dripOver')()
 assert.equal(scoped({ticks:27},under,true),true);assert.equal(scoped({ticks:35},{...under,fade:11},true),true)
 assert.equal(scoped({ticks:80},under,true),false)
})
test('direct-crop actor rendering equals full-frame crops and refreshes carved terrain',()=>{
 for(const level of[10,17,20]){
  const w=arrivalWorld(level),cache={},colors=P.build(themeOf('tokyo-night').theme,level),small=welcomeFrame(D,w,cache),full=canvas(800,496)
  D.drawTerrain(full.ctx,w,colors);D.drawActors(full.ctx,w,colors,{intro:false,feed:false})
  const C=w.k.CELL,x=Math.max(0,Math.min(304,Math.round((w.exit.x+w.exit.w/2)*C)-48)),y=Math.max(0,Math.min(176,w.exit.y*C-18))
  assert.equal(hash(small.buf),hash(crop(full,x*2,y*2,192,144).buf))
  const first=cache.terrain;w.terrainVersion++;welcomeFrame(D,w,cache);assert.notEqual(cache.terrain,first)
 }
})
test('the bounded comparison pipeline emits actual native/page frames and an animation preview',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'exit-welcome-'))
 try{
  const r=welcomeStrips(out,{levels:[10,14,17,20]});assert.deepEqual(r.ages,HOME_AGES);assert.equal(r.records.length,4)
  for(const level of[10,14,17,20])for(const res of[1,2])for(const tag of['before','after'])assert.ok(fs.statSync(path.join(out,`${level}-${tag}-res${res}.png`)).size>100)
  assert.match(fs.readFileSync(path.join(out,'index.html'),'utf8'),/prefers-reduced-motion/)
  assert.ok(fs.statSync(path.join(out,'contact-sheet.png')).size>1000)
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
