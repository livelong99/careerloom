// QA only: real mouse click (Radix tabs/switches react to pointer events, el.click() is not enough).
export async function realClick(page, text, sel = 'button,[role=tab],[role=radio],[role=switch],[role=combobox],label,a') {
  const pt = await page.evaluate(`(() => {
    const want = ${JSON.stringify(text)}.toLowerCase()
    const el = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.offsetParent !== null).find(e => ((e.getAttribute('aria-label') || '') + ' ' + e.textContent).trim().toLowerCase().includes(want))
    if (!el) return null
    el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  if (!pt) return false
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...pt, button: 'left', clickCount: 1 })
  return true
}
