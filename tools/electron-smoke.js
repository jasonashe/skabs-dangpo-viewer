'use strict';
// Boot the real Electron app and check that it comes up with the document
// loaded, the bundled face in use, and the same layout metrics the renderer
// produces under a plain browser.
//
//   xvfb-run -a npx electron tools/electron-smoke.js     (headless Linux)
//   npx electron tools/electron-smoke.js                 (with a display)
//
// Note for headless containers: the layout numbers below are the real check.
// capturePage() under Xvfb software compositing produces a degraded raster
// that does not reflect what the app draws on a real display, so the
// screenshot it writes is a convenience, not evidence.

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = process.env.SHOT_DIR || path.join(__dirname, '..', 'tmp-shots');

app.commandLine.appendSwitch('no-sandbox');

require('../app/main.js');

const PROBE = `JSON.stringify((() => {
  const run = document.querySelector('[data-id=p3] .t');
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;'
    + 'font-family:var(--tib-stack);font-size:40px';
  probe.textContent = 'བསྟན་བཅོས་མངོན་པར་རྟོགས་པའི་རྒྱན';
  document.body.appendChild(probe);
  const probeWidth = Math.round(probe.getBoundingClientRect().width);
  probe.remove();
  return {
    paragraphs: document.querySelectorAll('.para').length,
    tocEntries: document.querySelectorAll('.toc-entry').length,
    explanations: window.__reader.pane.explained.size,
    status: document.getElementById('statusPage').textContent,
    tibetanFontLoaded: document.fonts.check('16px "Noto Serif Tibetan"'),
    runWidth: Math.round(run.getBoundingClientRect().width),
    paragraphHeight: document.querySelector('[data-id=p3]').offsetHeight,
    probeWidth,
  };
})())`;

// Measured from the same renderer under Chromium; they only hold if the
// bundled Tibetan face is the one actually shaping the text.
const EXPECTED = { runWidth: 753, paragraphHeight: 732, probeWidth: 514 };

app.whenReady().then(async () => {
  const started = Date.now();
  let win = null;
  while (!win && Date.now() - started < 20000) {
    win = BrowserWindow.getAllWindows()[0];
    if (!win) await new Promise((r) => setTimeout(r, 200));
  }
  if (!win) {
    process.stderr.write('FAIL no window appeared\n');
    app.exit(1);
    return;
  }

  await win.webContents.executeJavaScript(
    'new Promise(r => { const t = setInterval(() => {'
    + ' if (window.__reader && window.__reader.ready) { clearInterval(t);'
    + ' window.__reader.ready.then(r); } }, 100); })');
  await win.webContents.executeJavaScript('document.fonts.ready');

  const info = JSON.parse(await win.webContents.executeJavaScript(PROBE));
  let failures = 0;
  const check = (label, cond, detail) => {
    process.stdout.write(`  ${cond ? 'ok  ' : 'FAIL'} ${label}`
      + `${detail ? ` — ${detail}` : ''}\n`);
    if (!cond) failures += 1;
  };

  check('every paragraph is rendered', info.paragraphs === 426,
    String(info.paragraphs));
  check('the table of contents is built', info.tocEntries > 600,
    String(info.tocEntries));
  check('explanation files are found', info.explanations > 0,
    String(info.explanations));
  check('paging is the PDF paging', /^Page 36 of 355/.test(info.status),
    info.status);
  check('the bundled Tibetan face loads', info.tibetanFontLoaded);
  for (const [key, want] of Object.entries(EXPECTED)) {
    check(`${key} matches the browser render`, info[key] === want,
      `${info[key]} vs ${want}`);
  }

  try {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'electron.png'),
      (await win.webContents.capturePage()).toPNG());
  } catch { /* a screenshot is a nicety, not part of the check */ }

  process.stdout.write(failures ? `\n${failures} failed\n` : '\nelectron ok\n');
  app.exit(failures ? 1 : 0);
});
