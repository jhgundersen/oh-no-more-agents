import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {createHash} from "node:crypto"
import {load,canvas,themeOf,THEMES} from "../tools/render.js"
import {ACTIONS,fixture,frame,run} from "../tools/agent-art.js"
const S=load("Sim.js"),D=load("Draw.js"),P=load("Palette.js")
const hash=x=>createHash("sha256").update(x).digest("hex")
const pal=P.build(themeOf("tokyo-night").theme,1)
function actor(D,w,a,pal){
 const img=canvas(96,96),ctx=img.ctx
 ctx.setTransform(2,0,0,2,48-a.x*8,70-(a.y+1)*8)
 if(a.gone)D.drawDeath(ctx,w,pal,a);else D.drawAgent(ctx,w,pal,a,{})
 return hash(img.buf)
}
function record(fn){
 const img=canvas(160,160),ctx=img.ctx,calls=[],fill=ctx.fillRect.bind(ctx)
 ctx.setTransform(2,0,0,2,0,0)
 ctx.fillRect=(...r)=>{
  assert.ok(calls.length<300,"bounded local paint")
  assert.ok(r.every(Number.isFinite)&&r[2]>=0&&r[3]>=0,"non-negative finite rectangles")
  assert.ok(r.every(n=>Number.isInteger(n*2)),"half-pixel grid")
  calls.push([...r,ctx.fillStyle]);fill(...r)
 }
 fn(ctx);return{calls,hash:hash(img.buf)}
}
test("ordinary motion is strictly res 2; panel, share card, heroes and divers retain their poses",()=>{
 const {w,a}=fixture("walk",1)
 for(const res of[undefined,1,3]){w.res=res;assert.equal(D.pageMotionAgent(w,a),false)}
 w.res=2;assert.equal(D.pageMotionAgent(w,a),true)
 for(const fields of[{special:true},{special:"hero"}])assert.equal(D.pageMotionAgent(w,{...a,...fields}),false)
 w.submerged=true;assert.equal(D.pageMotionAgent(w,a),false)
 assert.equal(D.pageMotionAgent(null,a),false)
 for(const state of["wait","bomb","slide","constructor","__proto__"]){
  a.state=state;assert.equal(D.pageHomeStep(w,a),0)
  assert.equal(D.pageAgentX(w,a),Math.round(a.x*4)-4)
 }
})
test("all action phases are deterministic and read-only in both facings and five palettes",()=>{
 const random=Math.random
 try{for(const name of ACTIONS)for(const dir of[-1,1])for(const theme of Object.keys(THEMES)){
  const colors=P.build(themeOf(theme).theme,1),poses=new Set()
  for(let i=0;i<8;i++){
   const {w,a}=fixture(name,i,dir);w.res=2
   const before=hash(JSON.stringify(w));Math.random=()=>{throw Error("render RNG")}
   const one=actor(D,w,a,colors);assert.equal(actor(D,w,a,colors),one,name)
   assert.equal(hash(JSON.stringify(w)),before,name);poses.add(one);Math.random=random
  }
  assert.ok(poses.size>=3,name+" has intermediate poses")
 }}finally{Math.random=random}
})
test("new body, tools and contact poses use bounded half pixels; feet and work contacts remain local",()=>{
 const {w,a}=fixture("walk");w.res=2
 for(const dir of[-1,1])for(let i=0;i<8;i++){
  Object.assign(a,{anim:i*2,timer:i,dir,fade:i,floater:i%2,fall:8})
  for(const name of["drawPageWalk","drawPageFall","drawPageBash","drawPageDig","drawPageBuilder","drawPageBlock","drawPageHome"]){
   const marks=record(ctx=>name==="drawPageWalk"?D[name](ctx,w,pal,a,32,24,dir,pal.robe,pal.skin,0,0):D[name](ctx,w,pal,a,32,24,dir,pal.robe,0)).calls
   assert.ok(marks.length>0);assert.ok(marks.every(r=>r[0]>=16&&r[0]+r[2]<=60&&r[1]>=24&&r[1]+r[3]<=42),name)
  }
  for(const name of["drawPagePick","drawPageSpade"])record(ctx=>D[name](ctx,pal,a,32,24,dir))
  const c=D.pageClimbContacts(a,8);assert.equal(c.x,8);assert.ok(c.hand<c.knee&&c.other<c.knee)
 }
 const feet=[]
 for(let i=0;i<8;i++){w.ticks=i*8;feet.push(record(ctx=>D.drawPageBlock(ctx,w,pal,a,32,24,1,pal.robe)).calls.filter(c=>c[1]>=37))}
 for(const row of feet)assert.deepEqual(row,feet[0],"blocker boots planted")
 w.reducedMotion=true
 const calm=record(ctx=>D.drawPageBlock(ctx,w,pal,a,32,24,1,pal.robe)).hash
 w.ticks+=8;assert.equal(record(ctx=>D.drawPageBlock(ctx,w,pal,a,32,24,1,pal.robe)).hash,calm)
})
test("mine animation follows the real planting cooldown, without inventing a mining state",()=>{
 const {w,a}=fixture("mine");assert.equal(a.state,"walk");assert.equal(w.mines[0].fuse,S.MINE_FUSE)
 assert.equal(a.mineCool,S.MINE_FUSE+60)
 for(let age=0;age<6;age++)assert.equal(D.pageMineAge({...a,mineCool:a.mineCool-age}),age)
 for(const mineCool of[0,1,30,144,undefined])assert.equal(D.pageMineAge({mineCool}),-1)
 for(const fuse of[90,30,29,1])record(ctx=>D.drawPageCharge(ctx,w,pal,{fuse},40,40))
})
test("umbrella opening progresses, closing joins the carried cane and reduced motion holds secondary flex",()=>{
 for(const dir of[-1,1]){
  const {w,a}=fixture("float",0,dir);w.res=2
  const open=new Set()
  for(const fall of[2.01,2.25,2.5,2.75,3,8]){a.fall=fall;open.add(record(ctx=>D.drawPageFloat(ctx,w,pal,a,32,24,pal.umbrella)).hash)}
  assert.ok(open.size>=4)
  w.reducedMotion=true;const calm=record(ctx=>D.drawPageFloat(ctx,w,pal,a,32,24,pal.umbrella)).hash
  w.ticks+=8;assert.equal(record(ctx=>D.drawPageFloat(ctx,w,pal,a,32,24,pal.umbrella)).hash,calm)
  a.state="walk";a.floater=false
  for(let age=0;age<8;age++)record(ctx=>D.drawPageFold(ctx,w,pal,a,32,24,age))
  assert.equal(record(ctx=>D.drawPageFold(ctx,w,pal,a,32,24,7)).hash,record(ctx=>D.drawFurledBrolly(ctx,w,pal,a,32,24)).hash)
 }
})
test("home steps approach the actual exit; death details respect their existing window and unknown causes",()=>{
 const {w,a}=fixture("exit");w.res=2
 for(const side of[-1,1]){
  a.x=w.exit.x+w.exit.w/2+side*2
  for(const fade of[0,2,6,10,13]){
   a.fade=fade;const dx=D.pageHomeStep(w,a)
   assert.ok(Math.abs(dx)<=3&&dx*side<=0);assert.ok(D.agentHomeLift(w,a)<=1)
  }
 }
 a.state="walk";assert.equal(D.pageHomeStep(w,a),0)
 a.state="saved";const exit=w.exit;w.exit=null;assert.equal(D.pageHomeStep(w,a),0);w.exit=exit
 for(const cause of["red team","splat"])for(const age of[0,2,8,12,14,18,26,40]){
  a.diedBy=cause;record(ctx=>D.drawPageDeath(ctx,w,pal,a,age))
 }
 for(const cause of["constructor","__proto__","fell","unknown"]){a.diedBy=cause;assert.equal(record(ctx=>D.drawPageDeath(ctx,w,pal,a,0)).calls.length,0)}
})
test("rendering leaves complete gameplay digests identical in all nineteen biomes",()=>{
 const random=Math.random,seeded=n=>()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296)
 try{for(let level=1;level<=19;level++){
  const a=S.generate(level,0,level*7919+13),b=S.generate(level,0,level*7919+13);a.res=b.res=2
  const img=canvas(800,496),colors=P.build(themeOf("tokyo-night").theme,level)
  for(let tick=0;tick<600;tick++){
   Math.random=seeded(level*997+tick);S.step(a);Math.random=seeded(level*997+tick);S.step(b)
   if(tick%60===0){D.drawTerrain(img.ctx,a,colors);D.drawActors(img.ctx,a,colors,{});assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)),`${level}:${tick}`)}
  }
 }}finally{Math.random=random}
})
test("comparison tool emits native frame sheets and animated strips with cached terrain",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"agent-art-test-"))
 try{
  const r=run("HEAD",dir);assert.equal(r.actions,14);assert.equal(r.frames,448)
  for(const action of ACTIONS)for(const res of[1,2]){
   const png=fs.readFileSync(path.join(dir,`${action}-after-res${res}-strip.png`))
   assert.equal(png.readUInt32BE(16),64*res*8);assert.equal(png.readUInt32BE(20),48*res)
  }
  const html=fs.readFileSync(path.join(dir,"index.html"),"utf8");assert.match(html,/steps\(8\)/);assert.match(html,/prefers-reduced-motion/)
  assert.throws(()=>run("not-a-ref",dir),/Cannot read agent baseline/)
  assert.throws(()=>fixture("not-an-action"),/Unknown action/)
  const D=load("Draw.js"),{w}=fixture("walk");w.res=2
  const colors=P.build(themeOf("tokyo-night").theme,1),img=canvas(800,496)
  D.drawTerrain(img.ctx,w,colors)
  const cached=frame(D,"walk",4,2,1,"steady","tokyo-night",1,{img,work:canvas(800,496),pal:colors})
  assert.equal(hash(cached.img.buf),hash(frame(D,"walk",4).img.buf),"terrain cache has identical pixels")
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
