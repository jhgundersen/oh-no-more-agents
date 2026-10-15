import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {loadCore} from '../tools/load-core.js'
import {canvas} from '../tools/render.js'
import {captureStock} from '../tools/toolbar-icons.js'
const S=loadCore('Sim.js'),D=loadCore('Draw.js')
const hash=b=>createHash('sha256').update(b).digest('hex')

test('every stock skill has a distinct complete glyph in the shared UI palette',()=>{
 assert.deepEqual(Object.keys(D.SKILL_ICON_PIXELS),S.SKILL_ORDER)
 const shapes=new Set()
 for(const name of S.SKILL_ORDER){
  const rows=D.SKILL_ICON_PIXELS[name];assert.equal(rows.length,14)
  let ink=0
  for(const row of rows){assert.equal(row.length,14);for(const c of row){assert.ok(c==='.'||D.UI_ICON_INK[c],name+' '+c);if(c!=='.')ink++}}
  assert.ok(ink>=30&&ink<=180,name);shapes.add(rows.join(''))
 }
 assert.equal(shapes.size,8)
})
test('inventory art is bounded, deterministic and RNG-free, preserves its context, and scales by exact pixels',()=>{
 const random=Math.random,images=new Set()
 try{Math.random=()=>{throw Error('inventory RNG')}
  for(const name of S.SKILL_ORDER){
   const a=canvas(16,16),ctx=a.ctx,fill=ctx.fillRect.bind(ctx);let calls=0
   ctx.fillStyle='#123456';ctx.globalAlpha=1
   ctx.fillRect=(...r)=>{assert.ok(++calls<800);assert.ok(r.every(Number.isInteger));assert.ok(r[0]>=0&&r[1]>=0&&r[2]>0&&r[3]>0&&r[0]+r[2]<=16&&r[1]+r[3]<=16);fill(...r)}
   D.drawSkillIcon(ctx,name);assert.equal(ctx.fillStyle,'#123456');assert.equal(ctx.globalAlpha,1);assert.ok(calls>50)
   images.add(hash(a.buf));const b=canvas(16,16);D.drawSkillIcon(b.ctx,name);assert.equal(hash(a.buf),hash(b.buf))
   const large=canvas(32,32);large.ctx.scale(2,2);D.drawSkillIcon(large.ctx,name)
   for(let y=0;y<16;y++)for(let x=0;x<16;x++)for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++)
    for(let c=0;c<3;c++)assert.equal(large.buf[((y*2+yy)*32+x*2+xx)*3+c],a.buf[(y*16+x)*3+c],name)
  }
  assert.equal(images.size,8)
  const blank=canvas(16,16),before=hash(blank.buf);D.drawSkillIcon(blank.ctx,'unknown');assert.equal(hash(blank.buf),before)
 }finally{Math.random=random}
})
test('live stock icons stay passive and cached, preserve names/counts, fit native/DPR2/phone layouts, and follow spend cues',{timeout:45000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'toolbar-icons-'))
 try{
  const report=await captureStock(out,{checks:true});assert.deepEqual(report.errors,[]);assert.equal(report.records.length,6)
  for(const r of report.records){
   assert.equal(r.pageWidth,r.width,r.name);assert.equal(r.tiles.length,8)
   for(const tile of r.tiles){
    assert.equal(tile.label,S.SKILL_LABELS[tile.name]);assert.equal(tile.count,String(tile.want));assert.equal(tile.tag,'DIV');assert.equal(tile.tab,-1)
    const i=tile.icon,b=tile.box,n=tile.countBox
    assert.ok(i);assert.equal(i.hidden,'true');assert.equal(i.widthPixels,16);assert.equal(i.heightPixels,16);assert.equal(i.width,16);assert.equal(i.height,16);assert.equal(i.rendering,'pixelated')
    for(const box of[i,n]){assert.ok(box.x>=b.x-.5&&box.x+box.width<=b.x+b.width+.5);assert.ok(box.y>=b.y&&box.y+box.height<=b.y+b.height)}
    assert.ok(i.x+i.width<=n.x,'icon never obscures the count')
   }
   if(r.width===390||r.name==='landscape')assert.ok(r.stage.y+r.stage.height<=r.height+1,'game fits '+r.name)
  }
  assert.equal(report.cache.paints,0);assert.equal(report.cache.pure,true);assert.equal(report.cache.stable,true);assert.equal(report.cache.reused,true)
  assert.deepEqual(report.cache.fresh,{recent:true,spent:false,count:'0',opacity:'1'})
  assert.deepEqual(report.cache.exhausted,{recent:false,spent:true,count:'0',opacity:'0.3'})
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
