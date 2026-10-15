import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import {createHash} from "node:crypto"
import {load,canvas,crop,themeOf,THEMES} from "../tools/render.js"
import {season,copyPixels} from "../tools/gag-art.js"
import {christmasWorld,christmasFrame,run} from "../tools/christmas-art.js"
const S=load("Sim.js"),D=load("Draw.js"),P=load("Palette.js")
const source=fs.readFileSync(new URL("../public/agents/season.js",import.meta.url),"utf8")
const api=season(source,"?season=christmas"),off=season(source,"?season=none")
const hash=x=>createHash("sha256").update(x).digest("hex")
function calls(draw,res=1){const img=canvas(800,496),list=[],ctx=img.ctx;ctx.setTransform(res,0,0,res,0,0);const fill=ctx.fillRect.bind(ctx);ctx.fillRect=(...a)=>{assert.ok(list.length<4000,"bounded recording");assert.ok(a.every(Number.isFinite)&&a[2]>0&&a[3]>0);assert.ok(a.every(n=>n*res===Math.round(n*res)),"resolution grid");list.push([...a,ctx.fillStyle,ctx.globalAlpha]);fill(...a)};ctx.fillStyle="#123456";ctx.globalAlpha=0.75;draw(ctx);assert.equal(ctx.fillStyle,"#123456");assert.equal(ctx.globalAlpha,0.75);return{list,hash:hash(img.buf)}}
test("Christmas renders read-only, RNG-free and repeatably in nineteen biomes, both resolutions and five palettes",()=>{
 for(let level=1;level<=19;level++) {
  const w=christmasWorld(level,api);api.paint(canvas(400,248).ctx,w)
  for(const res of[1,2])for(const theme of Object.keys(THEMES)){
   w.res=res;const stable=hash(JSON.stringify(w)),pal=P.build(themeOf(theme).theme,level);api.tint(pal)
   const back=canvas(400*res,248*res);D.drawTerrain(back.ctx,w,pal)
   const draw=()=>{const img=canvas(back.W,back.H);copyPixels(img,back,0,0);D.drawActors(img.ctx,w,pal,{});api.paint(img.ctx,w);return hash(img.buf)}
   const random=Math.random;Math.random=()=>{throw Error("render RNG")};try{assert.equal(draw(),draw())}finally{Math.random=random}
   assert.equal(hash(JSON.stringify(w)),stable)
  }
 }
})
test("cached snow and hatch tree are still, grid-aligned, terrain-bound and absent outside Christmas",()=>{
 for(const res of[1,2]){
  const w=christmasWorld(17,api);w.res=res
  const a=calls(ctx=>D.drawChristmasGround(ctx,w),res);assert.ok(a.list.length>10)
  w.ticks+=47;assert.equal(calls(ctx=>D.drawChristmasGround(ctx,w),res).hash,a.hash)
  w.season=null;assert.equal(calls(ctx=>D.drawChristmasGround(ctx,w),res).list.length,0)
  w.season={hats:"other"};assert.equal(calls(ctx=>D.drawChristmasGround(ctx,w),res).list.length,0)
  w.season={hats:"santa"};w.terrain.fill(w.k.EMPTY);assert.equal(calls(ctx=>D.drawChristmasGround(ctx,w),res).list.length,0)
 }
})
test("Santa caps follow every trait, facing, head bob and diving helmet while preserving faces and collars",()=>{
 for(const level of[1,10])for(const res of[1,2])for(const dir of[-1,1])for(const trait of Object.keys(D.TRAIT_LOOKS))for(const state of["walk","wait","climb","fall","swim"]){
  const w=S.generate(level,0,3);w.res=res;w.ticks=400;const ag=Object.assign(S.spawn(w),{x:10,y:10,dir,trait,state,anim:12,special:false,floater:state==="fall",fall:12});w.agents=[ag]
  const pal=P.build(themeOf("tokyo-night").theme,level),paint=()=>{const img=canvas(80*res,80*res);img.ctx.setTransform(res,0,0,res,0,0);D.drawAgent(img.ctx,w,pal,ag,{});return img}
  const a=paint();api.dress(w);const b=paint();const colours=new Set([pal.skin,pal.shirt,pal.eye,pal.port,pal.lens].filter(Boolean).map(c=>{const im=canvas(1,1,c);return im.buf.join(",")}));let checked=0
  for(let i=0;i<a.buf.length;i+=3)if(colours.has(a.buf.subarray(i,i+3).join(","))){assert.equal(b.buf.subarray(i,i+3).join(","),a.buf.subarray(i,i+3).join(","));checked++}
  assert.ok(checked>2)
 }
})
test("candy canopies have broad red/white bands and restore context at 1x and res 2",()=>{
 for(const res of[1,2])for(const reducedMotion of[false,true])for(const flex of[-1,0,1]){
  const w=S.generate(1,0,3);Object.assign(w,{res,ticks:400,reducedMotion});const pal=P.build(themeOf("tokyo-night").theme,1)
  const r=calls(ctx=>D.drawCandyUmbrella(ctx,w,pal,{id:3},150,100,flex,"#d42a3c"),res)
  assert.ok(r.list.some(c=>c[4]==="#d42a3c")&&r.list.some(c=>c[4]==="#f4f4ec"));assert.ok(r.list.length<90)
 }
})
test("snow and wrapping preserve the complete portal opening and visible arriving faces; reduced motion freezes snow",()=>{
 for(const res of[1,2]){
  const w=christmasWorld(1,api);w.res=res;const pal=P.build(themeOf("tokyo-night").theme,1),img=canvas(400*res,248*res);D.drawTerrain(img.ctx,w,pal);D.drawActors(img.ctx,w,pal,{});const e=w.exit
  const portal=()=>hash(crop(img,(e.x*4+3)*res,(e.y*4+2)*res,(e.w*4-6)*res,(e.h*4-5)*res).buf),before=portal();api.paint(img.ctx,w);assert.equal(portal(),before)
  w.reducedMotion=true;const a=calls(ctx=>api.paint(ctx,w),res);w.ticks+=7;assert.equal(calls(ctx=>api.paint(ctx,w),res).hash,a.hash)
 }
})
test("falling snow and gift paint leave complete living sprite envelopes unchanged in all nineteen biomes",()=>{
 for(let level=1;level<=19;level++)for(const res of[1,2]){
  const w=christmasWorld(level,api);w.res=res;const pal=P.build(themeOf("tokyo-night").theme,level),img=canvas(400*res,248*res)
  D.drawTerrain(img.ctx,w,pal);D.drawActors(img.ctx,w,pal,{})
  const boxes=w.agents.filter(a=>!a.gone&&a.state!=="dead"&&a.state!=="saved").map(a=>({x:Math.max(0,Math.round(a.x*4-(a.floater?10:5))),y:Math.max(0,Math.round((a.y+1)*4-(a.floater?29:23))),width:a.floater?20:10,height:a.floater?29:23}))
  const hashes=()=>boxes.map(b=>hash(crop(img,b.x*res,b.y*res,Math.max(1,Math.min(b.width,400-b.x))*res,Math.max(1,Math.min(b.height,248-b.y))*res).buf))
  const before=hashes();api.paint(img.ctx,w);assert.deepEqual(hashes(),before)
 }
})
test("Christmas dressing and painting preserve complete gameplay digests in all nineteen biomes",()=>{
 const random=Math.random,seeded=n=>()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296)
 const digest=w=>hash(JSON.stringify(w,(k,v)=>k.startsWith("season")?undefined:v))
 try{for(let level=1;level<=19;level++){
  const a=S.generate(level,0,level*7919+13),b=S.generate(level,0,level*7919+13),img=canvas(400,248);api.dress(a)
  for(let tick=0;tick<600;tick++){Math.random=seeded(level*997+tick);S.step(a);Math.random=seeded(level*997+tick);S.step(b);api.paint(img.ctx,a);if(tick%120===0)assert.equal(digest(a),digest(b),`${level}:${tick}`)}
 }}finally{Math.random=random}
})
test("the host dresses both live and replay worlds before painting cached seasonal terrain",()=>{
 const s=fs.readFileSync(new URL("../public/agents/web.js",import.meta.url),"utf8")
 assert.match(s,/AgentSeason\.dress\(sim\)[\s\S]{0,160}drawTerrain\(terrainCtx, sim/)
 assert.match(s,/function paintTerrain\(\)[\s\S]{0,150}AgentSeason\.dress\(world\)[\s\S]{0,70}drawTerrain\(terrainCtx, world/)
})

test("the bounded Christmas comparison command covers all biomes and keeps native full frames",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"christmas-art-test-"))
 try{const r=run("HEAD",dir);assert.equal(r.biomes,19);assert.equal(r.frames,76)
  for(const level of[1,10,19])for(const res of[1,2])for(const tag of["before","after"]){const b=fs.readFileSync(path.join(dir,`level-${level}-${tag}-res${res}.png`));assert.equal(b.readUInt32BE(16),400*res);assert.equal(b.readUInt32BE(20),248*res)}
  for(const file of["contact-sheet.png","exits-sheet.png","hatches-sheet.png","umbrellas-sheet.png"])assert.ok(fs.statSync(path.join(dir,file)).size>1000)
  assert.throws(()=>run("not-a-ref",dir),/Cannot read/)
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})

test("Christmas overlays leave report cards, blackout tells and the HUD clear",()=>{
 const w=christmasWorld(1,api);w.res=1;w.done=true
 assert.equal(calls(ctx=>api.paint(ctx,w)).list.length,0)
 w.done=false;w.outage={at:w.ticks-1,len:20};assert.equal(calls(ctx=>api.paint(ctx,w)).list.length,0)
 w.outage.at=w.ticks+1;assert.ok(calls(ctx=>api.paint(ctx,w)).list.length>0)
})
