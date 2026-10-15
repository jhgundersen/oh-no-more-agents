import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {load,canvas,crop,themeOf,THEMES} from '../tools/render.js'
import {occupiedFerry,ferryUntil,ferryAdvance,ferryBox,ferryFrame,ferryStrips} from '../tools/ferry-art.js'
const S=load('Sim.js'),D=load('Draw.js'),P=load('Palette.js'),hash=b=>createHash('sha256').update(b).digest('hex')
const pal=P.build(themeOf('tokyo-night').theme,39)
function marks(fn,{balanced=false}={}){
 const ctx=canvas(400,248).ctx,calls=[];ctx.fillStyle='#123456';ctx.globalAlpha=0.35
 ctx.fillRect=(...r)=>{
  assert.ok(calls.length<4000,'bounded paint');assert.ok(r.every(Number.isFinite)&&r[2]>0&&r[3]>0)
  assert.ok(r.every(n=>Number.isInteger(n*2)),'half-pixel grid');assert.ok(ctx.globalAlpha<=0.35+1e-9,'inherited opacity')
  calls.push([...r,ctx.fillStyle,ctx.globalAlpha])
 }
 fn(ctx);assert.equal(ctx.globalAlpha,0.35);if(balanced)assert.equal(ctx.fillStyle,'#123456');return calls
}
function nativeAggregate(){
 const h=createHash('sha256')
 for(const level of[19,39,59,79])for(const theme of Object.keys(THEMES))for(const res of[undefined,1,3])for(const phase of['wait','run','drop','back']){
  const w=S.generate(level,0,3),tr=w.trains.find(t=>t.boat);if(!tr)continue;w.res=res;w.ticks=240
  Object.assign(tr,{phase,t:2,x:(tr.ax+tr.bx)/2,v:0.35,riders:[1,2,3]})
  const img=canvas(400,248);D.drawHarbourFerry(img.ctx,w,P.build(themeOf(theme).theme,level),tr);h.update(img.buf)
 }
 return h.digest('hex')
}
test('native and share-card ferries keep the pre-steamer pixels across directions, phases and palettes',()=>{
 assert.equal(nativeAggregate(),'0291f580868002d2c3301897b4a06ddba8bf53a83bd7d78c1d970b074a844ea8')
})
test('reduced-motion ferry stays still through idle ticks and keeps real lamps and passenger silhouettes',()=>{
 const{w,ferry}=occupiedFerry();w.reducedMotion=true
 for(const phase of['wait','run','drop','back']){
  Object.assign(ferry,{phase,t:0,v:0.45})
  const first=marks(ctx=>D.drawHarbourFerry(ctx,w,pal,ferry),{balanced:true})
  for(const t of[1,7,12,34]){w.ticks+=17;ferry.t=t;assert.deepEqual(marks(ctx=>D.drawHarbourFerry(ctx,w,pal,ferry),{balanced:true}),first)}
  assert.ok(first.some(c=>c[4]===D.FERRY_GREEN));assert.ok(!first.some(c=>c[4]===D.FERRY_STEAM))
 }
})
test('steam and flag move gently with bounded tick poses, and preserve opacity',()=>{
 const{w,ferry}=occupiedFerry(),g=D.harbourFerryDrawing(w,ferry),poses=new Set()
 for(const tick of[0,6,12,18,27,41]){
  w.ticks=tick
  const flag=marks(ctx=>D.drawPageFerryFlag(ctx,w,ferry,g)),steam=marks(ctx=>D.drawPageFerrySteam(ctx,w,ferry,g))
  poses.add(hash(JSON.stringify(flag)));assert.ok(steam.length<=6)
  for(const c of steam)assert.ok(c[2]<=2.5&&c[3]<=2&&c[5]<=0.105)
 }
 assert.equal(poses.size,3)
 w.reducedMotion=true;assert.deepEqual(marks(ctx=>D.drawPageFerryFlag(ctx,w,ferry,g)),marks(ctx=>{w.ticks+=19;D.drawPageFerryFlag(ctx,w,ferry,g)}))
})
test('real journeys remain RNG-free and read-only in every palette, with bounded assembled paint',()=>{
 const random=Math.random
 try{for(const level of[39,59]){
  const{w,ferry}=occupiedFerry(level),phases=new Set()
  for(let frame=0;frame<8;frame++){
   ferryAdvance(w,ferry,frame);phases.add(ferry.phase)
   for(const theme of Object.keys(THEMES)){
    const before=hash(JSON.stringify(w)),colors=P.build(themeOf(theme).theme,level);Math.random=()=>{throw Error('render RNG')}
    const a=marks(ctx=>D.drawHarbourFerry(ctx,w,colors,ferry),{balanced:true})
    assert.deepEqual(marks(ctx=>D.drawHarbourFerry(ctx,w,colors,ferry),{balanced:true}),a)
    assert.ok(a.length<=512,"bounded cell-sliced ferry: "+a.length);assert.equal(hash(JSON.stringify(w)),before);Math.random=random
   }
  }
  assert.ok(phases.has('run')&&phases.has('drop')&&phases.has('back'))
 }}finally{Math.random=random}
 assert.throws(()=>occupiedFerry(1),/No occupied ferry/)
 const w=S.generate(39,0,3);assert.equal(ferryUntil(w,()=>true,0),0);assert.throws(()=>ferryUntil(w,()=>false,0),/stage exceeded 0/)
})
test('reflections and wakes stay within actual water and skip solid cells and stopped boats',()=>{
 const{w,ferry}=occupiedFerry(),g=D.harbourFerryDrawing(w,ferry),p=w.pits[ferry.pit];g.x=(p.x0+p.x1+1)*2;w.terrain.fill(w.k.EMPTY)
 for(const dir of[-1,1])for(const phase of['wait','run','drop','back'])for(const v of[0,0.4]){
  Object.assign(ferry,{dir,phase,v})
  const wake=marks(ctx=>D.drawPageFerryWake(ctx,w,pal,ferry,g))
  assert.equal(wake.length>0,v>0&&['run','back'].includes(phase))
  const light=marks(ctx=>D.drawPageFerryLights(ctx,w,ferry,g)),water=light.filter(c=>c[5]<0.35)
  assert.equal(water.length,3)
  for(const[x,y,width,height]of[...water,...wake])assert.ok(x>=p.x0*4&&x+width<=(p.x1+1)*4&&y>=p.surfaceY*4&&y+height<=248)
 }
 for(const[x,y,width]of[[p.x0*4-2,p.surfaceY*4,5],[(p.x1+1)*4+1,p.surfaceY*4,3],[10,0,3],[10,248,3]])
  marks(ctx=>D.ferryWaterMark(ctx,w,p,x,y,width))
 w.terrain.fill(w.k.ROCK);assert.equal(marks(ctx=>D.drawHarbourFerry(ctx,w,pal,ferry),{balanced:true}).length,0)
})
test('all new ferry ink respects the foreground quay, board edge and existing passenger windows',()=>{
 const{w,ferry}=occupiedFerry();w.terrain.fill(w.k.EMPTY)
 const g=D.harbourFerryDrawing(w,ferry);w.terrain[Math.floor((g.y-12)/4)*100+Math.floor(g.x/4)]=w.k.ROCK
 for(const[x,y,width,height]of marks(ctx=>D.drawHarbourFerry(ctx,w,pal,ferry),{balanced:true}))for(let yy=y;yy<y+height;yy+=0.5)for(let xx=x;xx<x+width;xx+=0.5)
  assert.ok(D.mechanismAir(w,xx,yy),'no boat paint through foreground stone')
 w.terrain.fill(w.k.EMPTY)
 const pictures=[]
 for(const count of[0,1,3,6,12,18]){
  ferry.riders=Array.from({length:count},(_,i)=>i);const img=canvas(800,496);img.ctx.setTransform(2,0,0,2,0,0);D.drawHarbourFerry(img.ctx,w,pal,ferry);pictures.push(hash(img.buf))
 }
 assert.equal(new Set(pictures).size,6,'every rider increment changes the assembled windows')
})
test('cached direct crops match full-frame crops and invalidate on terrain, resolution and palette',()=>{
 const{w,ferry}=occupiedFerry(),cache={},box=ferryBox(w,ferry),small=ferryFrame(D,w,ferry,cache),full=canvas(800,496)
 D.drawTerrain(full.ctx,w,pal);D.drawActors(full.ctx,w,pal,{intro:false,feed:false})
 assert.equal(hash(small.buf),hash(crop(full,box.x*2,box.y*2,224,128).buf))
 for(const change of[()=>w.terrainVersion++,()=>w.res=1,()=>w.res=2]){const old=cache.terrain;change();ferryFrame(D,w,ferry,cache);assert.notEqual(cache.terrain,old)}
 const old=cache.terrain;ferryFrame(D,w,ferry,cache,'nord');assert.notEqual(cache.terrain,old)
})
test('review tool emits genuine occupied crossings, arrival, return, native and page frame sheets',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'ferry-art-'))
 try{
  const r=ferryStrips(out,{base:'HEAD',levels:[39,59]});assert.equal(r.records.length,2)
  for(const record of r.records){assert.equal(record.frames.length,8);assert.equal(record.frames[0].phase,'run');assert.ok(record.frames[3].v<S.TRAIN_SPEED*0.85&&record.frames[3].v>0);assert.ok(Math.abs(record.frames[3].x-record.bx)<10);assert.equal(record.frames[4].phase,'drop');assert.equal(record.frames[6].phase,'back')}
  for(const level of[39,59])for(const res of[1,2])for(const tag of['before','after']){const png=fs.readFileSync(path.join(out,`${level}-${tag}-res${res}.png`));assert.equal(png.readUInt32BE(16),112*res*8);assert.equal(png.readUInt32BE(20),64*res)}
  assert.ok(fs.statSync(path.join(out,'contact-sheet.png')).size>1000);assert.match(fs.readFileSync(path.join(out,'index.html'),'utf8'),/prefers-reduced-motion/)
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
