import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {serve,browser} from '../tools/phone.js'
import {capturePanels,panelView,panelEvaluate as ev,panelContact} from '../tools/page-panels.js'
import {CONTRAST} from '../tools/contrast.js'

test('pixel controls and prose stay legible across phone, zoom-sized, desktop and fullscreen layouts',{timeout:60000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'page-type-'))
 try{const result=await capturePanels(out,{cases:[{paused:false},{paused:false,mobile:true},{paused:false,mobile:true,dpr:2},{paused:false,mobile:true,width:320},{paused:false,mobile:true,width:844,height:390},{paused:false,width:640,height:500,dpr:2},{paused:false,full:true,width:1280,height:720}]})
  for(const r of result.records){assert.equal(r.pageWidth,r.width);assert.deepEqual(r.type.cut,[]);assert.deepEqual(r.contrast,[]);assert.ok(r.type.control.size>=18);assert.match(r.type.control.family,/VT323/);assert.equal(r.type.footer.size,13);assert.match(r.type.footer.family,/monospace/);assert.ok(r.type.faces.some(f=>f.family==='VT323'&&f.status==='loaded'));assert.match(r.type.theme.family,/Orbitron/);assert.equal(r.type.theme.size,9);assert.equal(r.type.themeNames.filter(t=>t.pressed==='true').length,1)
   if(r.mobile)assert.ok(r.type.targets.every(h=>h>=44));if(r.width===844)assert.ok(r.type.stage.y+r.type.stage.height<=r.height);if(r.full)assert.equal(r.board.width,800)
  }
  const review=await panelContact(path.join(out,'review'),out,out,{page:true,names:['01-desktop','02-phone']});assert.equal(review.page,true);assert.equal(review.cases.length,2)
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
test('theme buttons keep their font, colours, focus and pressed state; every theme passes text contrast',{timeout:30000},async()=>{
 const server=await serve(),b=await browser()
 try{await panelView(b,'http://127.0.0.1:'+server.address().port+'/',{paused:false});const themes=await ev(b,"[...document.querySelectorAll('#themes button')].map(b=>b.dataset.theme)")
  for(const name of themes){await ev(b,`document.querySelector('[data-theme="${name}"]').click()`);assert.deepEqual((await ev(b,CONTRAST)).filter(r=>r.ratio<4.5),[],name);assert.equal(await ev(b,"document.querySelectorAll('#themes button[aria-pressed=true]').length"),1);assert.equal(await ev(b,"getComputedStyle(document.querySelector('#themes button')).fontSize"),'9px')}
  await b.cmd('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await b.cmd('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await ev(b,"document.querySelector('#themes button').focus()");assert.equal(await ev(b,"getComputedStyle(document.activeElement).outlineWidth"),'2px')
  assert.deepEqual(b.errors,[])
 }finally{await b.close();await new Promise(r=>server.close(r))}
})
test('an unavailable UI font keeps readable, wrapping controls and reachable footer links',{timeout:30000},async()=>{
 const server=await serve(),b=await browser()
 try{await b.cmd('Network.enable');await b.cmd('Network.setBlockedURLs',{urls:['*vt323-ui-1.woff2*']});const row=await panelView(b,'http://127.0.0.1:'+server.address().port+'/',{mobile:true,paused:false});assert.equal(row.pageWidth,390);assert.deepEqual(row.type.cut,[]);assert.ok(row.type.control.size>=18);assert.deepEqual(row.contrast,[]);assert.ok(row.type.faces.some(f=>f.family==='VT323'&&f.status==='error'))
  await ev(b,"document.querySelector('body > .sub:last-of-type a').focus()");assert.equal(await ev(b,'document.activeElement.tagName'),'A');assert.ok(await ev(b,'document.activeElement.getBoundingClientRect().bottom<=innerHeight'));assert.deepEqual(b.errors,[])
 }finally{await b.close();await new Promise(r=>server.close(r))}
})
