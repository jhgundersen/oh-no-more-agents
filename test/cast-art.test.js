import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {createHash} from "node:crypto"
import {load,canvas,themeOf,THEMES} from "../tools/render.js"
import {CASES,fixture,terrain,picture,run} from "../tools/cast-art.js"
const S=load("Sim.js"),D=load("Draw.js"),P=load("Palette.js")
const hash=x=>createHash("sha256").update(x).digest("hex")
function record(fn,res=2){
 const img=canvas(400*res,248*res),calls=[],ctx=img.ctx,fill=ctx.fillRect.bind(ctx)
 ctx.setTransform(res,0,0,res,0,0)
 ctx.fillRect=(...a)=>{
  assert.ok(calls.length<1500,"bounded draw recording")
  assert.ok(a.every(Number.isFinite)&&a[2]>0&&a[3]>0,"finite positive rectangles")
  assert.ok(a.every(n=>n*res===Math.round(n*res)),"canvas pixel grid")
  calls.push([...a,ctx.fillStyle,ctx.globalAlpha]);fill(...a)
 }
 fn(ctx);return{hash:hash(img.buf),calls,ctx}
}
test("cast action fixtures draw deterministically without RNG or world writes, at both resolutions and in five palettes",()=>{
 const random=Math.random
 try{for(const entry of CASES){
  const {w}=fixture(entry)
  for(const res of[undefined,1,2])for(const theme of Object.keys(THEMES)){
   const back=terrain(D,w,res||1,theme);w.res=res
   const before=hash(JSON.stringify(w));Math.random=()=>{throw Error("cast render RNG")}
   const a=picture(D,w,res,back),b=picture(D,w,res,back)
   assert.equal(hash(a.buf),hash(b.buf),entry[0]);assert.equal(hash(JSON.stringify(w)),before,entry[0])
   Math.random=random
  }
 }}finally{Math.random=random}
})
test("all hostile poses stay on the hard pixel grid and their native panel frames have no page additions",()=>{
 for(const kind of["gun","sniper","bouncer","drone","operator","xeno","harpoon"])
 for(const dir of[-1,1])for(const state of["walk","aim","reload","jet","recover"]){
  const w={k:{CELL:4},ticks:100,res:1,agents:[],submerged:kind==="harpoon"}
  const en={id:1,kind,dir,state,x:30,y:20,anim:8,timer:24,lineTo:45,lineY:18,shotFor:state==="reload"?6:0,hp:3,targetId:1,hurtAt:92}
  const a=record(ctx=>D.drawEnemy(ctx,w,{},en,{}),1)
  w.res=undefined;assert.equal(record(ctx=>D.drawEnemy(ctx,w,{},en,{}),1).hash,a.hash)
  w.res=2;const b=record(ctx=>D.drawEnemy(ctx,w,{},en,{}))
  assert.ok(b.calls.some(c=>c.slice(0,4).some(n=>!Number.isInteger(n))))
 }
})
test("pre-shot glints close only during real aims, and late aim differs from early aim",()=>{
 for(const dir of[-1,1])for(const span of[8,36,46]){
  const draw=en=>record(ctx=>D.drawCastAim(ctx,en,150,100,dir,span))
  const a=draw({state:"aim",timer:0}),b=draw({state:"aim",timer:span-1})
  assert.notEqual(a.hash,b.hash);assert.ok(b.calls.some(c=>c[4]==="#ffffff"))
  for(const state of["walk","reload","recover"])assert.equal(draw({state,timer:span}).calls.length,0)
  assert.equal(draw({state:"aim",timer:span,throttled:1}).calls.length,0)
 }
})
test("Moderator armoury, Bouncer stop/throw and Head Bouncer crown remain local and respect existing HP strips",()=>{
 for(const dir of[-1,1])for(const boss of[false,true]){
  const w={k:{CELL:4},res:2,ticks:100,agents:[{x:30+dir*3,y:20,state:"walk"}]}
  const en={kind:"bouncer",dir,x:30,y:20,state:"walk",anim:0,hp:boss?5:3,boss}
  const stop=record(ctx=>D.drawEnemy(ctx,w,{},en,{})),thrown=record(ctx=>D.drawEnemy(ctx,w,{}, {...en,threwAt:98},{}))
  assert.notEqual(stop.hash,thrown.hash)
  const pips=stop.calls.filter(c=>c[1]===63&&c[2]===2&&c[3]===1&&c[4]==="#ff5268")
  assert.equal(pips.length,boss?5:3)
  // The head crown is below the health strip, instead of covering its middle pip.
  if(boss)assert.ok(stop.calls.filter(c=>c[4]==="#e0b649"&&c[1]<68).every(c=>c[1]>=64))
  const m={...en,kind:"gun",boss:true,hp:3,state:"aim",timer:6,lineTo:45,lineY:18,shotFor:0}
  const armour=record(ctx=>D.drawEnemy(ctx,w,{},m,{}))
  assert.ok(armour.calls.some(c=>c[4]==="#e0b649"&&c[2]===3.5))
  assert.ok(armour.calls.every(c=>c[1]>=61),"boss retains 23px corridor headroom")
 }
})
test("the Head Bouncer crown follows the actual heavy stride and stagger, below its stationary health strip",()=>{
 const crown=(en,ticks=100)=>record(ctx=>D.drawEnemy(ctx,{k:{CELL:4},res:2,ticks,agents:[]},{},en,{})).calls.filter(c=>c[4]==="#78552b")
 const en={kind:"bouncer",boss:true,hp:5,x:30,y:20,dir:1,anim:0,state:"walk",timer:0,shotFor:0}
 const a=crown(en)[0],b=crown({...en,anim:8})[0],c=crown({...en,state:"recover",hurtAt:92})[0]
 assert.equal(b[0],a[0]+1);assert.equal(b[1],a[1]-1)
 assert.equal(c[0],a[0]-3);assert.equal(c[1],a[1]+2)
})
test("ricochet streaks need a recent ricochet defeat and a facing held umbrella",()=>{
 const en={x:30,y:20,diedBy:"ricochet"},a={x:20,y:20,brollyFor:20,brollyDir:1},w={k:{CELL:4},agents:[a]}
 const draw=(age=2)=>record(ctx=>D.drawCastRicochet(ctx,w,en,age))
 assert.ok(draw().calls.length>0)
 for(const age of[0,3,5])assert.ok(draw(age).calls.length>0)
 assert.ok(draw(0).calls.every(c=>c[0]>a.x*4+4),"return starts on the canopy, clear of the face/collar")
 assert.equal(draw(6).calls.length,0)
 for(const change of[{gone:true},{brollyFor:0},{brollyDir:-1},{y:10}]){
  w.agents=[{...a,...change}];assert.equal(draw().calls.length,0)
 }
 w.agents=[a];en.diedBy="red team down";assert.equal(draw().calls.length,0)
})
test("Backup warning expires with the existing reserve and reduced motion keeps a steady beacon",()=>{
 const w={res:2,ticks:100,backupAt:130,reinforcements:2},pal={}
 const draw=()=>record(ctx=>D.drawBackupLamp(ctx,w,pal,100,100))
 const a=draw();w.ticks=108;assert.notEqual(draw().hash,a.hash)
 w.reducedMotion=true;const b=draw();w.ticks=109;assert.equal(draw().hash,b.hash)
 w.reinforcements=0;assert.equal(draw().calls.length,0)
 w.reinforcements=2;w.done=true;assert.equal(draw().calls.length,0)
 w.done=false;w.backupAt=0;assert.equal(draw().calls.length,0)
})
test("Cloud Provider prepares only for a real nearby recipient, keeps face pixels clear and throws a tied canopy",()=>{
 const {w,target:a}=fixture(CASES.find(e=>e[0]==="cloud-provider-ready"))
 assert.ok(D.castProviderReady(w,a))
 for(const fields of[{ownBrolly:true},{gone:true},{special:true},{state:"saved"},{x:a.x+15},{y:a.y+3}]){
  const original=w.agents[1];w.agents[1]={...original,...fields};assert.equal(D.castProviderReady(w,a),false);w.agents[1]=original
 }
 for(const cool of[0,17])assert.equal(D.castProviderReady(w,{...a,cool}),false)
 for(const dir of[-1,1])for(const state of["walk","height","fall","swim"]){
  const r=record(ctx=>D.drawCastProvider(ctx,w,{}, {...a,dir,state},100,100,dir,0))
  assert.ok(r.calls.every(c=>c[1]>=105),"coat and hand only, below face")
 }
 for(const spin of[0,1,2,3]){
  const r=record(ctx=>D.drawCastParcel(ctx,w,{umbrellaStem:"#ffffff"},100,100,spin));assert.ok(r.calls.length<10)
 }
 const calm={reducedMotion:true};const pal={umbrellaStem:"#ffffff"}
 const canopy=t=>record(ctx=>D.drawCastCloudCanopy(ctx,calm,pal,a,100,100,"#4f6bd8","#eef1f8",{hp:t}))
 assert.equal(canopy(0).hash,canopy(0.5).hash)
})
test("rendered play has identical complete simulation digests in every biome",()=>{
 const random=Math.random,seeded=n=>()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296)
 try{for(let level=1;level<=19;level++){
  const a=S.generate(level,0,level*7919+13),b=S.generate(level,0,level*7919+13);a.res=b.res=2
  const img=canvas(800,496),pal=P.build(themeOf("tokyo-night").theme,level)
  for(let tick=0;tick<600;tick++){
   Math.random=seeded(level*997+tick);S.step(a);Math.random=seeded(level*997+tick);S.step(b)
   if(tick%60===0){D.drawTerrain(img.ctx,a,pal);D.drawActors(img.ctx,a,pal,{});assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)),`${level}:${tick}`)}
  }
 }}finally{Math.random=random}
})
test("cast comparison keeps bounded native full frames and covers each named cast member in action",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"cast-art-test-"))
 try{
  const r=run("HEAD",dir);assert.equal(r.scenes,25);assert.equal(r.frames,100)
  for(const name of["red-team-fire","sniper-aim","ricochet","moderator-aim","bouncer-stop","head-bouncer-stop","backup-call","cloud-provider-descent"])
   for(const res of[1,2]){
    const png=fs.readFileSync(path.join(dir,`${name}-after-res${res}.png`));assert.equal(png.readUInt32BE(16),400*res);assert.equal(png.readUInt32BE(20),248*res)
   }
  assert.throws(()=>run("not-a-ref",dir),/Cannot read cast baseline/)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
