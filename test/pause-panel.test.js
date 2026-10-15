import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {serve,browser} from '../tools/phone.js'
import {capturePanels,panelEvaluate as ev,panelWait,panelView,panelContact} from '../tools/page-panels.js'
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),hash=x=>createHash('sha256').update(x).digest('hex')
async function key(b,key,code,vk){for(const type of['keyDown','keyUp'])await b.cmd('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode:vk,text:type==='keyDown'?(key==='Enter'?'\r':key===' '?' ':undefined):undefined})}
test('pause panel fits phone, desktop, landscape, DPR2, fullscreen and reduced motion, with device-specific copy',{timeout:60000},async()=>{
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'pause-panels-'))
 try{const r=await capturePanels(out);assert.deepEqual(r.errors,[])
  for(const v of r.records){assert.equal(v.pageWidth,v.width);assert.equal(v.button.tag,'BUTTON');assert.equal(v.button.text,v.touch?'Tap to resume':'Space or click to resume');assert.equal(v.tick,400);assert.ok(v.card.width<=v.board.width-30);assert.ok(v.card.y>=v.board.y&&v.card.y+v.card.height<=v.board.y+v.board.height);assert.ok(v.button.height>=44);assert.deepEqual(v.contrast,[],v.name);for(const[f,h]of Object.entries(v.images))assert.equal(hash(fs.readFileSync(path.join(out,f))),h)}
 }finally{fs.rmSync(out,{recursive:true,force:true})}
})
test('pause holds every world byte; resume by keyboard, button and board acts once, restores focus, and does not cover held reports',{timeout:45000},async()=>{
 const server=await serve(),b=await browser(),base='http://127.0.0.1:'+server.address().port+'/'
 try{await panelView(b,base)
  const before=await ev(b,'JSON.stringify(AgentWorld())');await sleep(150);assert.equal(await ev(b,'JSON.stringify(AgentWorld())'),before)
  const {CONTRAST}=await import('../tools/contrast.js'),themes=await ev(b,"[...document.querySelectorAll('#themes button')].map(b=>b.dataset.theme)")
  for(const theme of themes){await ev(b,`document.querySelector('[data-theme="${theme}"]').click()`);assert.deepEqual((await ev(b,CONTRAST)).filter(r=>r.ratio<4.5),[],theme);assert.match(await ev(b,"document.getElementById('pauseArt').dataset.paint"),new RegExp('^'+theme+':'))}
  assert.equal(await ev(b,"document.getElementById('overlay').getAttribute('aria-labelledby')"),'overlay-title')
  await ev(b,"document.getElementById('overlay-line').focus()");await key(b,'Enter','Enter',13);assert.equal(await ev(b,"document.getElementById('overlay').style.display"),'none');assert.equal(await ev(b,'document.activeElement.id'),'c-pause')
  await ev(b,"document.getElementById('c-pause').click()");await ev(b,"document.getElementById('overlay-line').focus()");await key(b,' ','Space',32);assert.equal(await ev(b,"document.getElementById('overlay').style.display"),'none')
  await ev(b,"document.getElementById('c-pause').click();document.getElementById('overlay-line').click()");assert.equal(await ev(b,"document.getElementById('overlay').style.display"),'none')
  await ev(b,"document.getElementById('c-pause').click();document.getElementById('overlay').click()");assert.equal(await ev(b,"document.getElementById('overlay').style.display"),'none')
  await ev(b,"document.getElementById('c-pause').click();const w=AgentWorld();for(let i=0;i<5000&&!w.done;i++)step(w);document.getElementById('who').click()");assert.equal(await ev(b,'AgentWorld().done'),true);assert.equal(await ev(b,"document.getElementById('overlay').style.display"),'none')
  assert.deepEqual(b.errors,[])
 }finally{await b.close();await new Promise(r=>server.close(r))}
})


test('panel contact sheets verify scenes and refresh canonical/source-stamped copies',{timeout:45000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'panel-contact-'))
 try{const views=path.join(dir,'views'),out=path.join(dir,'review');await capturePanels(views,{cases:[{}]});const a=await panelContact(out,views,views);fs.writeFileSync(path.join(out,'contact-sheet.png'),'stale');const b=await panelContact(out,views,views);assert.equal(a.contactSHA256,b.contactSHA256);assert.equal(hash(fs.readFileSync(path.join(out,'contact-sheet.png'))),b.contactSHA256);assert.match(fs.readFileSync(path.join(out,'index.html'),'utf8'),new RegExp(b.contactSheet))}
 finally{fs.rmSync(dir,{recursive:true,force:true})}
})
