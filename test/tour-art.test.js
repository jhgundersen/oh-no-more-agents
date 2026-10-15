import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {loadCore} from '../tools/load-core.js'
import {canvas,themeOf,THEMES} from '../tools/render.js'
import {captureUi} from '../tools/tour-art.js'
const S=loadCore('Sim.js'),D=loadCore('Draw.js'),P=loadCore('Palette.js')
const hash=b=>createHash('sha256').update(b).digest('hex')
function recorded(width,height,paint){
 const img=canvas(width,height),c=img.ctx,fill=c.fillRect.bind(c),calls=[]
 c.fillStyle='#123456';c.globalAlpha=.7
 c.fillRect=(...r)=>{assert.ok(calls.length<1500,'bounded recording');assert.ok(r.every(Number.isInteger)&&r[2]>0&&r[3]>0);assert.ok(r[0]>=0&&r[1]>=0&&r[0]+r[2]<=width&&r[1]+r[3]<=height);calls.push([...r,c.fillStyle]);fill(...r)}
 paint(c);assert.equal(c.fillStyle,'#123456');assert.equal(c.globalAlpha,.7)
 return{img,calls,digest:hash(img.buf)}
}
test('tour icons cover all twenty biomes with distinct complete pixel silhouettes',()=>{
 assert.equal(D.TOUR_ICON_PIXELS.length,S.BIOMES.length)
 const code=new Set(Object.keys(D.UI_ICON_INK)),shapes=new Set()
 for(const rows of D.TOUR_ICON_PIXELS){
  assert.equal(rows.length,12);let count=0
  for(const row of rows){assert.equal(row.length,20);for(const p of row){assert.ok(p==='.'||code.has(p));if(p!=='.')count++}}
  assert.ok(count>=25&&count<=230);shapes.add(rows.join(''))
 }
 assert.equal(shapes.size,20)
 const source=fs.readFileSync(new URL('../public/agents/Draw.js',import.meta.url),'utf8')
 for(const name of S.BIOMES)assert.ok(source.includes('// '+name+'\n  [')||name==='The Cloud'&&source.includes('// The Cloud\n  ['),name)
})
test('tour icons stay crisp, bounded, deterministic and RNG-free in every page theme',()=>{
 const random=Math.random
 try{Math.random=()=>{throw Error('UI RNG')}
  for(const name of Object.keys(THEMES)){
   const digests=new Set()
   for(let i=0;i<20;i++){
    const pal=P.build(themeOf(name).theme,i+1),before=JSON.stringify(pal),paint=c=>D.drawTourIcon(c,pal,i)
    const a=recorded(24,16,paint),b=recorded(24,16,paint)
    assert.equal(a.digest,b.digest);assert.equal(JSON.stringify(pal),before);digests.add(a.digest)
    assert.ok(a.calls.some(r=>r[4]===D.UI_ICON_INK.k),'shared outline')
    assert.ok(a.calls.some(r=>r[0]===0&&r[1]===0&&r[2]===24&&r[3]===16),'opaque plate')
   }
   assert.equal(digests.size,20)
   for(const i of[-1,20])assert.equal(recorded(24,16,c=>D.drawTourIcon(c,P.build(themeOf(name).theme,1),i)).calls.length,2)
  }
 }finally{Math.random=random}
})
test('daily calendar badge has a complete 16px footprint and reusable context state',()=>{
 assert.equal(D.DAILY_BADGE_PIXELS.length,14)
 for(const row of D.DAILY_BADGE_PIXELS){assert.equal(row.length,14);for(const p of row)assert.ok(p==='.'||D.UI_ICON_INK[p])}
 const r=recorded(16,16,c=>D.drawDailyBadge(c,0,0))
 assert.ok(r.calls.some(c=>c[4]===D.UI_ICON_INK.g));assert.ok(r.calls.some(c=>c[4]===D.UI_ICON_INK.y))
 assert.ok(r.calls.length>50)
})
test('live tour art fits desktop and phone, preserves navigation semantics, and exports a real-size/3x sheet',{timeout:45000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'tour-ui-'))
 try{
  const report=await captureUi(out)
  assert.deepEqual(report.errors,[])
  for(const r of report.records){
   assert.equal(r.icons.length,20);assert.equal(r.pageWidth,r.viewport,'no horizontal page overflow')
   for(const icon of r.icons){assert.equal(icon.canvas.width,r.mobile?36:24);assert.equal(icon.canvas.height,r.mobile?24:16);if(r.mobile){assert.ok(icon.button.width>=44);assert.ok(icon.button.height>=44)}}
   assert.ok(r.badge);assert.match(r.dailyText,/colony of the day/)
   assert.ok(r.daily.x>=0&&r.daily.x+r.daily.width<=r.viewport)
  }
  const sheet=fs.readFileSync(path.join(out,'ui-sheet.png'));assert.equal(sheet.subarray(1,4).toString(),'PNG');assert.ok(sheet.length<1000000)
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
