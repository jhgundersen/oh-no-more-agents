import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { execSync } from "node:child_process"
import { serve, browser } from "../tools/phone.js"

let chromium = true
try { execSync("command -v chromium", { stdio: "ignore" }) } catch { chromium = false }
const sleep = ms => new Promise(r => setTimeout(r, ms))

test("patch notes: keyboard focus enters, wraps both ways, blocks the page, and returns on every close", { skip: !chromium && "no chromium", timeout: 30000 }, async () => {
  const server = await serve(), b = await browser()
  const ev = async expression => {
    const r = await b.cmd("Runtime.evaluate", { expression, returnByValue: true })
    assert.equal(r.exceptionDetails, undefined, "page expression did not throw")
    return r.result.value
  }
  const until = async (expression, expected) => {
    for (let i = 0; i < 40; i++) { if (await ev(expression) === expected) return; await sleep(50) }
    assert.equal(await ev(expression), expected, expression)
  }
  const key = async (key, code, vk, modifiers = 0) => {
    await b.cmd("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: vk, modifiers, text: key === "Enter" ? "\r" : key === " " ? " " : undefined })
    await b.cmd("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers })
  }
  const visible = `getComputedStyle(document.getElementById("news")).display !== "none"`
  const open = async () => {
    await ev(`document.getElementById("news-open").focus()`)
    await key("Enter", "Enter", 13)
    await until(`document.activeElement.id`, "news-close")
    assert.equal(await ev(visible), true)
  }
  const closed = async () => {
    await until(visible, false)
    await until(`document.activeElement.id`, "news-open")
  }
  try {
    await b.cmd("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
    await b.cmd("Page.navigate", { url: `http://127.0.0.1:${server.address().port}/?level=3&seed=42` })
    await until(`!!(window.AgentWorld && AgentWorld())`, true)
    await open()
    assert.equal(await ev(`document.activeElement.tagName`), "BUTTON", "the close control is a real button")
    for (const shift of [0, 8]) for (let i = 0; i < 3; i++) {
      await key("Tab", "Tab", 9, shift)
      assert.equal(await ev(`document.activeElement.id`), "news-close", "Tab and Shift+Tab stay in the modal")
    }
    await ev(`document.getElementById("c-next").focus()`)
    assert.equal(await ev(`document.activeElement.id`), "news-close", "native modality makes background controls inert")
    const level = await ev(`AgentWorld().level`)
    await key("n", "KeyN", 78)
    assert.equal(await ev(`AgentWorld().level`), level, "game shortcuts cannot act behind the notes")
    await ev(`document.querySelector(".news-card li").click()`)
    assert.equal(await ev(visible), true, "reading the notes does not dismiss them")
    await key("Escape", "Escape", 27)
    await closed()
    for (const [k, code, vk] of [["Enter", "Enter", 13], [" ", "Space", 32]]) {
      await open(); await key(k, code, vk); await closed()
      assert.equal(await ev(`document.getElementById("overlay").style.display`), "none", "closing does not pause the game")
    }
    await open()
    await b.cmd("Input.dispatchMouseEvent", { type: "mousePressed", x: 4, y: 4, button: "left", clickCount: 1 })
    await b.cmd("Input.dispatchMouseEvent", { type: "mouseReleased", x: 4, y: 4, button: "left", clickCount: 1 })
    await closed()
    if (process.env.REVIEW_FIX_SHOTS) {
      fs.mkdirSync(process.env.REVIEW_FIX_SHOTS, { recursive: true })
      await open()
      for (const [name, width, height, mobile] of [["desktop", 1280, 900, false], ["phone", 390, 844, true]]) {
        await b.cmd("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile })
        const shot = await b.cmd("Page.captureScreenshot", { format: "png" })
        fs.writeFileSync(path.join(process.env.REVIEW_FIX_SHOTS, name + ".png"), Buffer.from(shot.data, "base64"))
      }
    }
    assert.deepEqual(b.errors, [])
  } finally { await b.close(); server.close() }
})
