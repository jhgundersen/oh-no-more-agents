import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {load,canvas,themeOf,THEMES} from '../tools/render.js'
import {releaseFixture,hatchFrame,hatchStrips,HATCH_AGES} from '../tools/hatch-art.js'
const D=load('Draw.js'),P=load('Palette.js')
const hash=b=>createHash('sha256').update(b).digest('hex')
const phases=[-1,0,1,3,5,7,9,11,12,31,40,49]
function aggregate(res,reduced=false){
 const h=createHash('sha256')
 for(let level=1;level<=20;level++){
  const w=releaseFixture(level,0,res);w.reducedMotion=reduced
  for(const age of phases)for(const last of[false,true]){
   w.ticks=w.lastReleaseAt+age;w.released=last?w.toRelease:2;h.update(hatchFrame(D,w).buf)
  }
 }
 return h.digest('hex')
}
test('native hatch is pixel-identical in all 20 biomes; reduced motion retains the original page hatch',()=>{
 assert.equal(aggregate(1),'b419887744496ce9e447b604976da10d42ef03cc0082398df7a607ab8aaefda2')
 assert.equal(aggregate(2,true),'d02f4ee8da6e526aaba5864315eb5e9526d57b8d72b583b6b8a5c4c9a4ada34a')
})
test('one brief impulse follows every real release including the last, with no idle, future or finished effect',()=>{
 const w=releaseFixture(),release=w.lastReleaseAt
 for(const age of[-1,0,1,3,5,7,9,11,12,30]){
  w.ticks=release+age;assert.equal(D.hatchKick(w),age>=0&&age<12?age:-1)
 }
 w.ticks=release+3;w.released=w.toRelease;assert.equal(D.hatchKick(w),3,'last colleague gets the same welcome')
 for(const over of[{res:undefined},{res:1},{res:3},{reducedMotion:true},{done:true},{lastReleaseAt:-1}])assert.equal(D.hatchKick({...w,...over}),-1)
 const poses=new Set(HATCH_AGES.map(age=>hash(hatchFrame(D,releaseFixture(8,age)).buf)))
 assert.ok(poses.size>=6,'intermediate recoil and breath poses')
})
test('vent paint is finite, bounded, half-pixel aligned and clear of the falling agent and adjacent biography',()=>{
 const w=releaseFixture(),pal=P.build(themeOf('tokyo-night').theme,8),img=canvas(96,64)
 let max=0
 for(const submerged of[false,true])for(let age=0;age<12;age++){
  w.submerged=submerged;const calls=[],ctx=img.ctx,fill=ctx.fillRect.bind(ctx)
  ctx.fillRect=(...r)=>{assert.ok(calls.length<16);assert.ok(r.every(Number.isFinite));assert.ok(r.every(n=>Number.isInteger(n*2)));assert.ok(r[2]>0&&r[3]>0);calls.push(r)}
  ctx.globalAlpha=0.35;ctx.fillStyle='#123456';D.drawHatchBreath(ctx,w,pal,40,22,age)
  assert.equal(ctx.globalAlpha,0.35);assert.equal(ctx.fillStyle,'#123456')
  assert.equal(calls.length,submerged?8:10)
  for(const[x,y,width,height]of calls){assert.ok(x>=19&&x+width<=61);assert.ok(x+width<=26||x>=54,'outside falling body');assert.ok(y>=17.5&&y+height<=25)}
  max=Math.max(max,calls.length);ctx.fillRect=fill
 }
 assert.equal(max,10)
})
test('repeated hatch drawing reads existing state only, across biomes and palettes without changing simulation state',()=>{
 const random=Math.random
 try{for(let level=1;level<=20;level++)for(const theme of Object.keys(THEMES)){
  const w=releaseFixture(level,3),before=hash(JSON.stringify(w));Math.random=()=>{throw Error('Hatch must not draw RNG')}
  const first=hash(hatchFrame(D,w,theme).buf);assert.equal(hash(hatchFrame(D,w,theme).buf),first);assert.equal(hash(JSON.stringify(w)),before)
  Math.random=random
 }}finally{Math.random=random}
})
test('comparison pipeline renders both native and page strips without a browser or per-frame wait',()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'hatch-art-'))
 try{
  const r=hatchStrips(out);assert.deepEqual(r.ages,HATCH_AGES);assert.equal(r.levels.length,2)
  for(const level of[8,10])for(const res of[1,2])for(const tag of['before','after'])assert.ok(fs.statSync(path.join(out,`${level}-${tag}-res${res}.png`)).size>100)
  assert.ok(fs.statSync(path.join(out,'contact-sheet.png')).size>1000)
  const html=fs.readFileSync(path.join(out,'index.html'),'utf8');assert.match(html,/prefers-reduced-motion/);assert.match(html,/Trench bubbles/)
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
