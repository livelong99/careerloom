// Screenshot pipeline bench: `npx electron scripts/copilot-shot-bench.cjs` (no window, no network, no real app data).
// Encode/resize/size/token numbers use SYNTHETIC code-editor-like frames (JPEG size depends on content, so sizes are indicative).
// Capture ms is measured only when Screen Recording is already granted to the host process; otherwise reported as n/a.
const { app, nativeImage, desktopCapturer, systemPreferences, screen } = require('electron')

const SIZES = [['1080p 1x', 1920, 1080], ['1440p 1x', 2560, 1440], ['retina 2x (MBP 14" default)', 3024, 1964]]
const fit = (w, h, max) => { const l = Math.max(w, h); return l <= max ? [w, h] : [Math.round(w * max / l), Math.round(h * max / l)] }
const tokens = {
  anthropic: (w, h) => { let [a, b] = fit(w, h, 1568); while (Math.ceil(a / 28) * Math.ceil(b / 28) > 1568) { a = Math.floor(a * .97); b = Math.floor(b * .97) } return Math.ceil(a / 28) * Math.ceil(b / 28) },
  openai: (w, h) => { let [a, b] = fit(w, h, 2048); const s = Math.min(a, b); if (s > 768) { a = Math.round(a * 768 / s); b = Math.round(b * 768 / s) } return 85 + 170 * Math.ceil(a / 512) * Math.ceil(b / 512) },
  gemini: (w, h) => { if (w <= 384 && h <= 384) return 258; const c = Math.min(768, Math.max(256, Math.floor(Math.min(w, h) / 1.5))); return 258 * Math.ceil(w / c) * Math.ceil(h / c) },
}
function synthetic(w, h) { // dark background, rows of coloured "tokens" like a code editor
  const buf = Buffer.alloc(w * h * 4); let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
  for (let i = 0; i < w * h; i++) { buf[i * 4] = 30; buf[i * 4 + 1] = 27; buf[i * 4 + 2] = 24; buf[i * 4 + 3] = 255 }
  const line = Math.round(h / 60)
  for (let y = line; y < h - line; y += line * 1.6) {
    let x = Math.round(w * 0.05) + Math.floor(rnd() * 4) * line * 2
    while (x < w * 0.9) {
      const tw = Math.round((2 + rnd() * 9) * line * .6), c = [[220, 180, 90], [120, 190, 240], [200, 120, 200], [170, 220, 140]][Math.floor(rnd() * 4)]
      for (let yy = Math.round(y); yy < y + line * .7 && yy < h; yy++) for (let xx = x; xx < x + tw && xx < w; xx++) { const o = (yy * w + xx) * 4; buf[o] = c[2]; buf[o + 1] = c[1]; buf[o + 2] = c[0] }
      x += tw + line * .6
    }
  }
  return nativeImage.createFromBitmap(buf, { width: w, height: h })
}
const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)]
const time = fn => { const t = process.hrtime.bigint(); const r = fn(); return [r, Number(process.hrtime.bigint() - t) / 1e6] }

app.whenReady().then(async () => {
  const rows = []
  for (const [name, w, h] of SIZES) {
    const img = synthetic(w, h); const [tw, th] = fit(w, h, 1280); const enc = []; const rs = []; let out
    for (let i = 0; i < 7; i++) { const [small, r] = time(() => img.resize({ width: tw, height: th, quality: 'good' })); const [j, e] = time(() => small.toJPEG(70)); rs.push(r); enc.push(e); out = j }
    const full = img.toJPEG(90)
    rows.push({ name, src: `${w}x${h}`, sent: `${tw}x${th}`, resizeMs: med(rs), encodeMs: med(enc), kb: out.length / 1024, fullKb: full.length / 1024,
      tokSent: { a: tokens.anthropic(tw, th), o: tokens.openai(tw, th), g: tokens.gemini(tw, th) }, tokFull: { a: tokens.anthropic(w, h), o: tokens.openai(w, h), g: tokens.gemini(w, h) } })
  }
  const perm = systemPreferences.getMediaAccessStatus('screen'); let capture = 'n/a (Screen Recording ' + perm + ')'
  if (perm === 'granted') {
    const d = screen.getPrimaryDisplay(); const ms = []
    for (let i = 0; i < 5; i++) { const t = Date.now(); const s = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: Math.round(1280 * d.size.height / d.size.width) } }); ms.push(Date.now() - t); if (!s[0]) break }
    capture = `p50 ${med(ms)} ms at 1280-wide thumbnail on ${d.size.width}x${d.size.height}@${d.scaleFactor}x`
  }
  console.log(JSON.stringify({ electron: process.versions.electron, capture, rows }, null, 1))
  app.quit()
})
