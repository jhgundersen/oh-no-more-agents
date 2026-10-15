import test from "node:test"
import assert from "node:assert/strict"
import {createHash} from "node:crypto"
import {loadCore} from "../tools/load-core.js"
import {canvas,themeOf,THEMES} from "../tools/render.js"
const S=loadCore("Sim.js"),D=loadCore("Draw.js"),P=loadCore("Palette.js")
const levels=[20,40,60,80,100],hash=x=>createHash("sha256").update(x).digest("hex")
const layers=[D.drawCloudDistance,D.drawCloudPageBanks,D.drawCloudWeather]
function sample(level=20,name="tokyo-night") {
 const w=S.generate(level,0,3);w.res=2;w.ticks=400
 return {w,pal:P.build(themeOf(name).theme,level)}
}
function picture(fn) {
 const img=canvas(800,496),ctx=img.ctx,calls=[],fill=ctx.fillRect.bind(ctx),save=ctx.save.bind(ctx),restore=ctx.restore.bind(ctx)
 let depth=0
 ctx.setTransform(2,0,0,2,0,0);ctx.fillStyle="#123456";ctx.globalAlpha=0.8
 ctx.save=()=>{depth++;save()};ctx.restore=()=>{depth--;restore()}
 ctx.fillRect=(...r)=>{
  assert.ok(calls.length<40000,"bounded paint recording")
  assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0,"finite positive rectangles")
  assert.ok(r.every(n=>Number.isInteger(n*2)),"half-pixel grid")
  calls.push([...r,ctx.fillStyle,ctx.globalAlpha]);fill(...r)
 }
 fn(ctx)
 assert.equal(depth,0,"balanced context")
 assert.equal(ctx.fillStyle,"#123456");assert.equal(ctx.globalAlpha,0.8)
 return{...img,calls,digest:hash(img.buf)}
}
function readonly(value,cache=new WeakMap()) {
 if(!value||typeof value!=="object")return value
 if(cache.has(value))return cache.get(value)
 const p=new Proxy(value,{get(t,k){return readonly(Reflect.get(t,k),cache)},set(){throw Error("world write")},defineProperty(){throw Error("world define")},deleteProperty(){throw Error("world delete")}})
 cache.set(value,p);return p
}
test("Cloud additions are exclusive to res 2 and its twentieth biome",()=>{
 for(let level=1;level<=20;level++)for(const res of[undefined,1,2,3]){
  const {w,pal}=sample(level);w.res=res
  const page=level===20&&res===2;assert.equal(D.cloudPage(w),page)
  for(const draw of[D.drawCloudPageBanks,D.drawCloudWeather]){
   const frame=picture(ctx=>draw(ctx,w,pal));if(!page)assert.equal(frame.calls.length,0)
  }
  const exit=picture(ctx=>assert.equal(D.drawCloudExitPage(ctx,w,pal,40,100,16,20),page))
  assert.equal(exit.calls.length>0,page)
 }
})
test("cloud layers are pure, RNG-free, grid aligned and deterministic in five palettes",()=>{
 const random=Math.random
 try{for(const level of levels)for(const name of Object.keys(THEMES)){
  const {w,pal}=sample(level,name),before=hash(JSON.stringify(w)),frozen=readonly(w)
  Math.random=()=>{throw Error("render RNG")}
  for(const draw of layers){
   const a=picture(ctx=>draw(ctx,frozen,pal)),b=picture(ctx=>draw(ctx,frozen,pal))
   assert.equal(a.digest,b.digest)
   for(const r of a.calls)assert.ok(r[0]>=0&&r[1]>=w.k.SKY*4-3&&r[0]+r[2]<=400&&r[1]+r[3]<=248,"board envelope")
  }
  assert.equal(hash(JSON.stringify(w)),before);Math.random=random
 }}finally{Math.random=random}
})
test("bank geometry is cached by terrain version and respects steel, built bricks and every carved opening",()=>{
 for(const level of levels){
  const {w,pal}=sample(level),scene=D.cloudLayout(w)
  assert.equal(D.cloudLayout(w),scene);assert.ok(scene.tops.length>0&&scene.puffs.length>0&&scene.edges.length>0)
  assert.ok(scene.distant.length>=16&&scene.flashes.length===3)
  const before=picture(ctx=>D.drawCloudPageBanks(ctx,w,pal)).digest;w.ticks+=333
  assert.equal(picture(ctx=>D.drawCloudPageBanks(ctx,w,pal)).digest,before,"static terrain ignores the clock")
  for(const p of scene.puffs)for(const r of p.rects){
   assert.ok(D.cloudEarth(w,Math.floor(r.x/4),Math.floor(r.y/4)))
   assert.ok(r.width<=4&&r.height<=1,"pre-clipped material fragment")
  }
  for(const m of[w.k.EMPTY,w.k.STEEL,w.k.BRICK]){
   w.terrain.fill(m);w.terrainVersion++
   const next=D.cloudLayout(w);assert.notEqual(next,scene)
   assert.equal(next.tops.length,0);assert.equal(next.rows.length,0);assert.equal(picture(ctx=>D.drawCloudPageBanks(ctx,w,pal)).calls.length,0)
  }
 }
})
test("silver lining sits at the real feet line; cloud bodies are softer/dimmer and neighbouring lobes vary",()=>{
 const {w,pal}=sample(),scene=D.cloudLayout(w),frame=picture(ctx=>D.drawCloudPageBanks(ctx,w,pal))
 for(const t of scene.tops){
  assert.ok(w.terrain[Math.floor(t.y/4)*100+Math.floor(t.x/4)])
  assert.equal(w.terrain[(Math.floor(t.y/4)-1)*100+Math.floor(t.x/4)],w.k.EMPTY)
  assert.ok(frame.calls.some(c=>c[0]===t.x&&c[1]===t.y&&c[2]===4&&c[3]===1&&c[4]===D.CLOUD_SILVER),"unbroken foot line")
 }
 const faces=scene.puffs.filter(p=>p.surface)
 assert.ok(new Set(faces.map(p=>p.width)).size>6)
 const luma=c=>{const v=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));return v[0]*.2126+v[1]*.7152+v[2]*.0722}
 assert.ok(Math.max(...D.CLOUD_FAR.map(luma))<Math.min(...D.CLOUD_BODY.slice(0,4).map(luma)))
 assert.ok(luma(D.CLOUD_SUN)>luma(D.CLOUD_BODY[0]))
})
test("distant rack slats peek through static vapour without becoming another foreground fixture",()=>{
 const p={x:80,y:80,width:80,height:28,layer:1,seed:1}
 const a=picture(ctx=>{ctx.save();D.drawCloudHiddenRacks(ctx,p);ctx.restore()})
 assert.equal(a.calls.filter(c=>c[4]==="#303247").length,2)
 assert.equal(a.calls.filter(c=>c[2]===5&&c[3]===1.5).length,10)
 assert.equal(a.calls.filter(c=>c[2]===0.5&&c[3]===0.5).length,10)
 assert.ok(a.calls.some(c=>c[4]===D.CLOUD_FAR[1]&&c[5]===0.45),"fog veils the slots")
})
test("flicker and rain contacts use cached air/material masks with no per-frame terrain scan",()=>{
 const {w,pal}=sample(),scene=D.cloudLayout(w),T=w.terrain
 for(const flash of scene.flashes)for(const r of flash.rects){
  assert.equal(T[Math.floor(r.y/4)*100+Math.floor(r.x/4)],w.k.EMPTY)
  assert.ok(r.width<=4&&r.height<=4)
 }
 w.terrain=new Proxy(T,{get(){throw Error("live terrain scan")}})
 try{
  const images=new Set()
  for(let ticks=0;ticks<450;ticks+=3){w.ticks=ticks;const r=picture(ctx=>D.drawCloudWeather(ctx,w,pal));assert.ok(r.calls.length<400);images.add(r.digest)}
  assert.ok(images.size>12,"short internal flashes and separate splash phases")
  w.reducedMotion=true
  for(const ticks of[1,79,300]){w.ticks=ticks;assert.equal(picture(ctx=>D.drawCloudWeather(ctx,w,pal)).calls.length,0)}
 }finally{w.terrain=T}
})
test("lightning light follows the real strike column and late wind-up, with a steady reduced-motion tell",()=>{
 const {w,pal}=sample(),g={x0:100,y0:100,wide:12,cx:106,y1:128,winding:true,progress:0.2},h={phase:"charge",t:10}
 const early=picture(ctx=>D.drawCloudCharge(ctx,w,pal,h,g))
 const late=picture(ctx=>D.drawCloudCharge(ctx,w,pal,h,{...g,progress:0.95}))
 assert.notEqual(early.digest,late.digest)
 assert.equal(early.calls.filter(c=>c[3]>3).length,0)
 assert.equal(late.calls.filter(c=>c[3]===25).length,2)
 assert.ok(late.calls.some(c=>c[0]===100&&c[1]===127.5&&c[2]===12))
 w.reducedMotion=true;const a=picture(ctx=>D.drawCloudCharge(ctx,w,pal,h,g)).digest
 w.ticks+=18;assert.equal(picture(ctx=>D.drawCloudCharge(ctx,w,pal,h,g)).digest,a)
 for(const winding of[false,undefined])assert.equal(picture(ctx=>D.drawCloudCharge(ctx,w,pal,h,{...g,winding})).calls.length,0)
 w.res=1;assert.equal(picture(ctx=>D.drawCloudCharge(ctx,w,pal,h,g)).calls.length,0)
})
test("the ON-PREM plaque is complete, with an opaque masonry frame, warm window and light at the sill",()=>{
 const {w,pal}=sample(),r=picture(ctx=>D.drawCloudExitPage(ctx,w,pal,40,100,16,20))
 assert.ok(r.calls.filter(c=>c[4]==="#997e80"||c[4]==="#b49891").length>=16)
 assert.ok(r.calls.some(c=>c[4]==="#d3bb80"&&c[2]===7&&c[3]===3))
 const letters=r.calls.filter(c=>c[4]==="#282a37")
 assert.ok(letters.length>30)
 assert.ok(letters.every(c=>c[0]>=34&&c[0]+c[2]<=63&&c[1]>=90&&c[1]+c[3]<=96),"complete legible plaque")
})
test("cloud weather and warning light stay behind opaque faces, suits and umbrella rims",()=>{
 const {w,pal}=sample();w.feed=[];w.blasts=[];w.outage=null;w.milestone=null;w.agents=[]
 const c=w.corridors[1]
 for(let i=0;i<3;i++){
  const a=S.spawn(w);Object.assign(a,{x:35+i*8,y:c.floorY-1,dir:i%2?-1:1,state:i===1?"fall":"walk",floater:i===1,fall:8,anim:8,trait:"steady",special:false,shotFor:0});w.agents.push(a)
 }
 const one=canvas(800,496),all=canvas(800,496);one.ctx.setTransform(2,0,0,2,0,0)
 D.drawActorColony(one.ctx,w,pal,{});D.drawActors(all.ctx,w,pal,{})
 const rgb=c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)),colors=[pal.skin,pal.shirt,pal.eye,pal.umbrellaRim].map(rgb)
 let checked=0
 for(let i=0;i<one.buf.length;i+=3)if(colors.some(c=>c.every((v,j)=>one.buf[i+j]===v))){
  assert.ok(one.buf[i]===all.buf[i]&&one.buf[i+1]===all.buf[i+1]&&one.buf[i+2]===all.buf[i+2],"opaque colony pixel")
  checked++
 }
 assert.ok(checked>200)
})
test("rendered Cloud play preserves complete simulation digests through 600 ticks",()=>{
 const random=Math.random,seeded=n=>()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/4294967296)
 try{for(const level of levels){
  const a=S.generate(level,0,3),b=S.generate(level,0,3);a.res=b.res=2
  const img=canvas(800,496),pal=P.build(themeOf("tokyo-night").theme,level)
  for(let tick=0;tick<600;tick++){
   Math.random=seeded(level*997+tick);S.step(a);Math.random=seeded(level*997+tick);S.step(b)
   if(tick%50===0){D.drawTerrain(img.ctx,a,pal);D.drawActors(img.ctx,a,pal,{});assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)),`${level}:${tick}`)}
  }
 }}finally{Math.random=random}
})

test("placeholder cave scatter becomes supported condensation, with no floating wisps after carving",()=>{
 const {w,pal}=sample(),d=w.decor.find(d=>["spire","clump","tuft","hang"].includes(d.kind))
 assert.ok(d)
 const draw=()=>picture(ctx=>D.drawCloudDecorItem(ctx,w,pal,d,d.x*4,d.y*4))
 assert.ok(draw().calls.length>0)
 const copy={...d,kind:"cog"};assert.equal(picture(ctx=>D.drawCloudDecorItem(ctx,w,pal,copy,d.x*4,d.y*4)).calls.length,0)
 for(const res of[undefined,1,3]){w.res=res;assert.equal(draw().calls.length,0)}
 w.res=2
 const support=d.kind==="hang"?d.y-1:d.y+1
 w.terrain[support*100+d.x]=w.k.EMPTY;w.terrainVersion++
 assert.equal(draw().calls.length,0)
})

test("rounded bank contours stay in adjoining air and never paint steel, brick or detached shapes",()=>{
 for(const level of levels){
  const {w}=sample(level),before=hash(JSON.stringify(w)),scene=D.cloudLayout(w)
  let above=0,below=0,sides=0
  for(const r of scene.outline){
   const x=Math.floor(r.x/4),y=Math.floor(r.y/4),material=w.terrain[y*100+x]
   assert.ok(r.width<=4&&r.height<=4,"cell-clipped contour")
   if(material!==w.k.EMPTY){assert.ok(D.cloudEarth(w,x,y));continue}
   const top=D.cloudEarth(w,x,y+1),bottom=D.cloudEarth(w,x,y-1)
   const side=D.cloudEarth(w,x-1,y)||D.cloudEarth(w,x+1,y)
   assert.ok(top||bottom||side,"every air lobe touches its real bank")
   if(top)above++;if(bottom)below++;if(side)sides++
  }
  assert.ok(above>10&&below>10&&sides>10,"crowns, hanging lobes and bulging sides")
  assert.equal(hash(JSON.stringify(w)),before,"contour never adds terrain")
 }
})
test("a tall narrow cloud has rising rounded volumes while a wide slab keeps its broad body",()=>{
 const {w,pal}=sample();w.terrain.fill(w.k.EMPTY)
 for(let y=20;y<38;y++)for(let x=45;x<50;x++)w.terrain[y*100+x]=w.k.DIRT
 w.terrainVersion++
 const scene=D.cloudLayout(w),towers=scene.puffs.filter(p=>p.tower)
 assert.ok(towers.length>=3,"overlapping height-local volumes")
 assert.ok(new Set(towers.map(p=>p.y)).size>=3)
 const frame=picture(ctx=>D.drawCloudPageBanks(ctx,w,pal))
 assert.ok(frame.calls.some(r=>r[0]<180&&r[1]>=80&&r[1]<152),"left silhouette protrudes into air")
 assert.ok(frame.calls.some(r=>r[0]>=200&&r[1]>=80&&r[1]<152),"right silhouette protrudes into air")
 assert.ok(scene.outline.some(r=>r.y<80)&&scene.outline.some(r=>r.y>=152),"rounded crown and underside")
 // A wide base joins the lower half, leaving different depth groups across
 // one continuous slab. Those groups must not become separate bright pillars.
 for(let y=28;y<38;y++)for(let x=30;x<70;x++)w.terrain[y*100+x]=w.k.DIRT
 w.terrainVersion++
 const joined=D.cloudLayout(w).puffs.filter(p=>p.tower)
 assert.ok(joined.length>0&&joined.every(p=>p.y<28*4),"only the exposed upper tower gets rising lobes")
})
