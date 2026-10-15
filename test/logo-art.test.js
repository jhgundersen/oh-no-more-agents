import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {createHash} from 'node:crypto'
import {loadCore} from '../tools/load-core.js'
import {canvas,THEMES} from '../tools/render.js'
import {captureLogo} from '../tools/logo-art.js'
const D=loadCore('Draw.js'),hash=x=>createHash('sha256').update(x).digest('hex')
function picture(colours,phase=0,onlyUmbrella=false){
 const img=canvas(340,64),ctx=img.ctx,fill=ctx.fillRect.bind(ctx),calls=[]
 ctx.fillStyle='#123456';ctx.globalAlpha=.8
 ctx.fillRect=(...r)=>{assert.ok(calls.length<2000,'bounded recording');assert.ok(r.every(Number.isInteger)&&r[2]>0&&r[3]>0);assert.ok(r[0]>=0&&r[1]>=0&&r[0]+r[2]<=340&&r[1]+r[3]<=64);calls.push([...r,ctx.fillStyle]);fill(...r)}
 if(!onlyUmbrella)D.drawPageLogoBase(ctx,colours)
 D.drawLogoUmbrella(ctx,colours,phase)
 assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,.8)
 return{img,calls,digest:hash(img.buf)}
}
test('header shares the share-card pixel font and remains bounded, pure and theme aware',()=>{
 assert.equal(D.PAGE_LOGO_WIDTH,340);assert.equal(D.PAGE_LOGO_HEIGHT,64)
 const hashes=new Set(),random=Math.random
 try{Math.random=()=>{throw Error('logo RNG')}
  for(const colours of Object.values(THEMES)){
   const before=JSON.stringify(colours),a=picture(colours),b=picture(colours)
   assert.equal(a.digest,b.digest);assert.equal(JSON.stringify(colours),before);hashes.add(a.digest)
   assert.ok(a.calls.some(r=>r[4]===colours.accent));assert.ok(a.calls.some(r=>r[4]===colours.foreground))
   assert.ok(a.calls.some(r=>r[0]>=315&&r[1]<18),'dreamer EXIT thought fits at the end')
   assert.ok(a.calls.some(r=>r[0]<45&&r[1]>50),'hanging colleague is below the O')
  }
 }finally{Math.random=random}
 assert.equal(hashes.size,Object.keys(THEMES).length)
})
test('idle poses alter only the small canopy and shaft, at a bounded paint cost',()=>{
 const frames=[0,1,2,3].map(phase=>picture(THEMES['tokyo-night'],phase)),hashes=new Set(frames.map(f=>f.digest))
 assert.equal(hashes.size,3)
 for(const frame of frames){
  const moves=picture(THEMES['tokyo-night'],frames.indexOf(frame),true)
  assert.ok(moves.calls.length<=32,'at most 32 live rectangles once a second')
  assert.ok(moves.calls.every(r=>r[0]>=42&&r[0]+r[2]<=64&&r[1]>=37&&r[1]+r[3]<=53))
  for(let y=0;y<64;y++)for(let x=0;x<340;x++){
   if(x>=42&&x<=64&&y>=37&&y<=53)continue
   const i=(y*340+x)*3;assert.ok(frame.img.buf[i]===frames[0].img.buf[i]&&frame.img.buf[i+1]===frames[0].img.buf[i+1]&&frame.img.buf[i+2]===frames[0].img.buf[i+2],'lettering and both agents stay fixed')
  }
 }
})
test('real header preserves its accessible heading, fits 390px at both DPRs, and honours live motion preferences',{timeout:45000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'logo-ui-'))
 try{
  const r=await captureLogo(out)
  assert.deepEqual(r.errors,[]);assert.equal(r.accessibleHeading,true);assert.equal(r.themeCount,9)
  for(const v of r.records){assert.equal(v.heading,'Oh No! More Agents');assert.equal(v.pageWidth,v.viewport);assert.ok(v.rect.x>=0&&v.rect.x+v.rect.width<=v.viewport);assert.equal(v.canvas.width,v.rect.width*v.dpr);assert.equal(v.canvas.height,v.rect.height*v.dpr);assert.equal(v.canvas.hidden,false)}
  assert.equal(r.motion.reducedStable,true);assert.ok(r.motion.animatedFrames>=2);assert.ok(r.motion.idlePaints>=3&&r.motion.idlePaints<=5);assert.equal(r.motion.offscreenStable,true);assert.equal(r.motion.resumed,true);assert.equal(r.motion.stopped,true)
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
