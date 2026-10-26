import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {renderer} from '../tools/gag-art.js'
import {updraftScene,updraftAdvance,updraftBox,updraftFrame,updraftStrips,UPDRAFT_CASES,UPDRAFT_OFFSETS} from '../tools/updraft-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),hash=x=>createHash('sha256').update(x).digest('hex')
const OLD=renderer(execFileSync('git',['show','9ef1b2d:public/agents/Draw.js'],{maxBuffer:4<<20}).toString())
function marks(fn){
 const ctx=canvas(400,248).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=0.35
 ctx.fillRect=(...r)=>{assert.ok(calls.length<2000);assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0);assert.ok(r.every(n=>Number.isInteger(n*2)));assert.ok(ctx.globalAlpha<=0.35+1e-9);calls.push([...r,ctx.fillStyle,ctx.globalAlpha])}
 fn(ctx);assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,0.35);return calls
}
function nativeAggregate(Draw){
 const sum=createHash('sha256')
 for(const level of[12,20,32,40,60,100,120]){
  const w=S.generate(level,0,3)
  for(const name of Object.keys(THEMES))for(const res of[undefined,1,2,3])for(const reduced of[false,true]){
   if(w.updraftLift&&res===2)continue
   Object.assign(w,{res,reducedMotion:reduced});const pal=P.build(themeOf(name).theme,level)
   for(const tick of[0,1,17,48,99,220]){w.ticks=tick;const img=canvas(400,248);Draw.drawUpdrafts(img.ctx,w,pal);sum.update(img.buf)}
  }
 }
 return sum.digest('hex')
}
test('native/default, share and every Data Center resolution keep the original updraft pixels',()=>assert.equal(nativeAggregate(D),nativeAggregate(OLD)))
test('natural umbrella lifts are found on three layouts with the real slowdown and bounded discovery',()=>{
 for(const info of UPDRAFT_CASES){const{w,a,anchor}=updraftScene(info.level,info.seed);assert.equal(w.biome,'The Cloud');assert.equal(a.state,'fall');assert.ok(a.floater&&a.drafted&&w.updraft[Math.floor(a.x)]);assert.equal(anchor.x,a.x)
  const y=a.y;updraftAdvance(w,1);assert.ok(a.y>y&&a.y-y<=S.FLOAT_SPEED*S.CLOUD_LIFT+1e-8)
 }
 assert.throws(()=>updraftScene(1),/No Cloud lift/);assert.throws(()=>updraftScene(20),/No natural updraft lift/)
})
test('the cached mask contains only real lift air and excludes every painted cumulus contour',()=>{
 for(const level of[20,40,60,80,100,120]){
  const w=S.generate(level,0,3);w.res=2;const scene=D.cloudDraftLayout(w);assert.equal(D.cloudDraftLayout(w),scene);assert.ok(scene.bands.length>=5&&scene.bands.length<=7)
  let air=0,excluded=0
  for(let i=0;i<scene.mask.length;i++)if(scene.mask[i]){air++;const x=(i%scene.width)/2,y=Math.floor(i/scene.width)/2;assert.ok(y>=w.k.SKY*4);assert.ok(w.updraft[Math.floor(x/4)]);assert.equal(w.terrain[Math.floor(y/4)*100+Math.floor(x/4)],0)}
  for(const b of D.cloudLayout(w).outline)for(let y=b.y;y<b.y+b.height;y+=.5)for(let x=b.x;x<b.x+b.width;x+=.5){if(x<0||y<0||x>=400||y>=248)continue;assert.equal(scene.mask[Math.round(y*2)*scene.width+Math.round(x*2)],0);if(w.updraft[Math.floor(x/4)])excluded++}
  assert.ok(air>1000&&excluded>0)
 }
})
test('terrain edits and replacement maps refresh the cache; ordinary ticks do not scan terrain again',()=>{
 const w=S.generate(60,0,3),terrain=w.terrain;let forbid=false
 w.terrain=new Proxy(terrain,{get(t,p){if(forbid)throw Error('live terrain scan');return Reflect.get(t,p,t)}});w.res=2
 const first=D.cloudDraftLayout(w);forbid=true;w.ticks=77;assert.equal(D.cloudDraftLayout(w),first);assert.ok(marks(c=>D.drawCloudDrafts(c,w)).length>0);forbid=false
 w.terrain=terrain;let fresh=D.cloudDraftLayout(w);assert.notEqual(fresh,first)
 const index=fresh.mask.indexOf(1),x=Math.floor(index%fresh.width/8),y=Math.floor(Math.floor(index/fresh.width)/8)
 S.setCell(w,x,y,w.k.STEEL);const edited=D.cloudDraftLayout(w);assert.notEqual(edited,fresh)
 for(let yy=y*8;yy<(y+1)*8;yy++)for(let xx=x*8;xx<(x+1)*8;xx++)assert.equal(edited.mask[yy*edited.width+xx],0)
 w.updraft=w.updraft.slice();fresh=D.cloudDraftLayout(w);assert.notEqual(fresh,edited)
 w.terrain.fill(w.k.STEEL);w.terrainVersion++;assert.equal(marks(c=>D.drawCloudDrafts(c,w)).length,0)
})
test('every curl fragment is half-pixel aligned, clipped to the mask and respects inherited fade',()=>{
 for(const level of[20,40,60,80,100,120]){
  const w=S.generate(level,0,3);w.res=2;const pal=P.build(themeOf('tokyo-night').theme,level),scene=D.cloudDraftLayout(w)
  for(const tick of[0,1,17,48,99,220]){w.ticks=tick;const calls=marks(c=>D.drawUpdrafts(c,w,pal));assert.ok(calls.length>0&&calls.length<500)
   for(const[x,y,width,height]of calls)for(let yy=y;yy<y+height;yy+=.5)for(let xx=x;xx<x+width;xx+=.5)assert.equal(scene.mask[yy*2*scene.width+xx*2],1)
  }
 }
 const scene={width:8,height:8,mask:new Uint8Array(64)},before=hash(scene.mask);D.cloudDraftMaskRect(scene,{x:-20,y:0,width:1,height:4},1);assert.equal(hash(scene.mask),before)
})
test('curls rise half an art pixel per tick and repeat cleanly; reduced motion holds the entire cue still',()=>{
 const w=S.generate(60,0,3);w.res=2;w.terrain.fill(0);w.terrainVersion++;w.updraft=new Uint8Array(100);w.updraft[50]=w.updraft[51]=1
 const draw=()=>marks(c=>D.drawCloudDrafts(c,w));w.ticks=100;const first=draw();w.ticks=101;const next=draw()
 for(const[x,y,width,height,colour,alpha]of next.filter(c=>c[1]>40&&c[1]<230))assert.ok(first.some(p=>p[0]===x&&p[1]===y+.5&&p[2]===width&&p[3]===height&&p[4]===colour&&p[5]===alpha))
 w.ticks=100+2*(w.k.ROWS-w.k.SKY)*4;assert.deepEqual(draw(),first)
 w.reducedMotion=true;const still=draw();for(const tick of[0,1,17,99,800]){w.ticks=tick;assert.deepEqual(draw(),still)}
 w.updraft=new Uint8Array(100);assert.equal(draw().length,0)
})
test('narrow one-cell edge lanes stay inside their true footprint',()=>{
 const w=S.generate(60,0,3);w.res=2;w.updraft=new Uint8Array(100);w.updraft[4]=1;w.terrain.fill(0);w.terrainVersion++
 for(const tick of[1,32,100]){w.ticks=tick;const calls=marks(c=>D.drawCloudDrafts(c,w));assert.ok(calls.length>0);assert.ok(calls.every(c=>c[0]>=16&&c[0]+c[2]<=20))}
})
test('early hazard tells, strike cores, agents and umbrellas retain their independent page paint',()=>{
 const{w,a}=updraftScene(100,3),pal=P.build(themeOf('tokyo-night').theme,100),h=w.hazards.find(h=>h.kind==='lightning')
 updraftAdvance(w,40);assert.ok(a.state==='fall'&&a.floater&&a.fall>2,'the canopy is actually open')
 for(const reduced of[false,true])for(const[phase,t]of[['charge',16],['charge',45],['fire',0],['fire',5]]){
  w.reducedMotion=reduced;Object.assign(h,{phase,t,fired:1})
  for(const [kind,draw] of[['hazard',(d,c)=>d.drawHazardKind(c,w,pal,h)],['agent',(d,c)=>d.drawAgent(c,w,pal,a,{})]]){
   const x=canvas(800,496),y=canvas(800,496);D.clearLayer(x.ctx,w);OLD.clearLayer(y.ctx,w);draw(D,x.ctx);draw(OLD,y.ctx)
   // The late cloud-belly forks are intentional hazard polish; the lethal
   // strike, early tell and all agent/umbrella pixels remain independent.
   if(kind==='hazard'&&phase==='charge'&&t===45)assert.notEqual(hash(x.buf),hash(y.buf),'late warning gains its new local forks')
   else assert.equal(hash(x.buf),hash(y.buf))
  }
 }
})
test('painting is deterministic, RNG-free and read-only across all themes and motion preferences',()=>{
 const random=Math.random
 try{for(const info of UPDRAFT_CASES){const{w}=updraftScene(info.level,info.seed)
  for(const reduced of[false,true])for(const name of Object.keys(THEMES)){w.reducedMotion=reduced;const before=hash(JSON.stringify(w)),pal=P.build(themeOf(name).theme,w.level);Math.random=()=>{throw Error('render RNG')};const draw=()=>marks(c=>D.drawUpdrafts(c,w,pal));assert.deepEqual(draw(),draw());assert.equal(hash(JSON.stringify(w)),before);Math.random=random}
 }}finally{Math.random=random}
})
test('rendered/plain live colonies have identical complete digests, lift behaviour and lightning outcomes',()=>{
 const random=Math.random
 try{for(const{level,seed}of UPDRAFT_CASES){Math.random=()=>.25;const a=S.generate(level,0,seed),b=S.generate(level,0,seed);a.res=b.res=2;const ctx=canvas(800,496).ctx,pal=P.build(themeOf('tokyo-night').theme,level)
  for(let n=0;n<800&&!a.done;n++){S.step(a);S.step(b);if(n%11===0)D.drawUpdrafts(ctx,a,pal);if(n%25===0)assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))}assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)))
 }}finally{Math.random=random}
})
test('cached direct crops match full frames through carving, native/page changes and palette changes',()=>{
 const{w,anchor}=updraftScene(),cache={};updraftAdvance(w,12)
 for(const res of[1,2])for(const theme of['tokyo-night','gruvbox'])for(const edit of[false,true]){
  w.res=res;if(edit)S.setCell(w,Math.floor(anchor.x),Math.floor(anchor.y)+2,w.k.EMPTY)
  const box=updraftBox(w,anchor);assert.ok(Object.values(box).every(Number.isInteger));const img=canvas(400*res,248*res,themeOf(theme).background),pal=P.build(themeOf(theme).theme,w.level)
  D.drawTerrain(img.ctx,w,pal);D.drawActors(img.ctx,w,pal,{intro:false,feed:false})
  assert.equal(hash(updraftFrame(D,w,anchor,cache,theme).buf),hash(crop(img,box.x*res,box.y*res,box.width*res,box.height*res).buf))
 }
})
test('review reruns refresh both stamped sheets, retain natural lift frames and exact native strips',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'updraft-art-'))
 try{const options={base:'9ef1b2d',cases:[UPDRAFT_CASES[0]]},a=updraftStrips(dir,options),file=path.join(dir,a.contactSheet),expected=hash(fs.readFileSync(file))
  assert.equal(a.contactSHA256,expected);assert.equal(hash(fs.readFileSync(path.join(dir,'contact-sheet.png'))),expected)
  fs.copyFileSync(path.join(dir,'60-3-frames.png'),file);fs.copyFileSync(file,path.join(dir,'contact-sheet.png'))
  const b=updraftStrips(dir,options);assert.equal(hash(fs.readFileSync(file)),expected);assert.equal(hash(fs.readFileSync(path.join(dir,'contact-sheet.png'))),expected)
  assert.equal(b.drawSHA256,hash(fs.readFileSync(new URL('../public/agents/Draw.js',import.meta.url))));assert.match(fs.readFileSync(path.join(dir,'index.html'),'utf8'),new RegExp(b.contactSheet))
  assert.deepEqual(a.records[0].offsets,UPDRAFT_OFFSETS);assert.ok(a.records[0].frames[0].inDraft&&a.records[0].frames[0].floater);assert.equal(a.records[0].frames[0].state,'fall')
  assert.equal(hash(fs.readFileSync(path.join(dir,'60-3-before-res1.png'))),hash(fs.readFileSync(path.join(dir,'60-3-after-res1.png'))))
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
