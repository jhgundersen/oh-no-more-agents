import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {load,canvas} from '../tools/render.js'
import {sheetLabel} from '../tools/art-label.js'
const D=load('Draw.js'),hash=b=>createHash('sha256').update(b).digest('hex')
test('review labels use supported uppercase ROM glyphs at a legible default size',()=>{
 const a=canvas(500,24),b=canvas(500,24),c=canvas(500,24)
 a.ctx.fillStyle=b.ctx.fillStyle=c.ctx.fillStyle='#e6e9ee'
 assert.equal(sheetLabel(a.ctx,D,'Factory — ambient / before ×2',250,4),'FACTORY - AMBIENT / BEFORE X2')
 D.drawTransitionText(b.ctx,'FACTORY - AMBIENT / BEFORE X2',250,4,2)
 D.drawTransitionText(c.ctx,'Factory - ambient / before x2',250,4,2)
 assert.equal(hash(a.buf),hash(b.buf));assert.notEqual(hash(a.buf),hash(c.buf))
 assert.equal(a.ctx.fillStyle,'#e6e9ee')
})
test('unknown sheet glyphs fail before painting instead of silently becoming question marks',()=>{
 const ctx=canvas(80,20).ctx;let paints=0;ctx.fillRect=()=>paints++
 assert.throws(()=>sheetLabel(ctx,D,'Library ☃',40,2),/Unsupported sheet glyph/);assert.equal(paints,0)
 assert.equal(sheetLabel(ctx,D,'before 1x',40,2,1),'BEFORE 1X');assert.ok(paints>0)
})
