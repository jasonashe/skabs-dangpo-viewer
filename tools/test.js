'use strict';
// Headless checks for the reader.  The renderer is platform-neutral, so the
// whole of it can be driven in Chromium: the same code runs under Electron.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// The sandbox ships a Chromium that may not match Playwright's pinned build,
// so find whatever is actually on disk rather than trusting the default.
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  let names = [];
  try {
    names = fs.readdirSync(base);
  } catch {
    return undefined;
  }
  const candidates = names
    .filter((n) => n.startsWith('chromium'))
    .flatMap((n) => [
      path.join(base, n, 'chrome-linux', 'chrome'),
      path.join(base, n, 'chrome-linux', 'headless_shell'),
    ]);
  return candidates.find((p) => fs.existsSync(p));
}

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || (8140 + (process.pid % 800)));
const URL_ = `http://127.0.0.1:${PORT}/app/renderer/index.html`;

let failures = 0;
let checks = 0;

function ok(label, cond, detail) {
  checks += 1;
  if (cond) {
    process.stdout.write(`  ok   ${label}\n`);
  } else {
    failures += 1;
    process.stdout.write(`  FAIL ${label}${detail ? ` — ${detail}` : ''}\n`);
  }
}

function eq(label, actual, expected) {
  ok(label, Object.is(actual, expected), `got ${JSON.stringify(actual)}, `
    + `want ${JSON.stringify(expected)}`);
}

// --------------------------------------------------------- layout rules (§7)
async function layoutRules() {
  process.stdout.write('panel sizing\n');
  const { computeLayout, MIN_READABLE, SIDE_WIDTH, TOC_WIDTH, BAR_WIDTH } =
    await import(path.join(ROOT, 'app/renderer/lib/panels.js'));

  let l = computeLayout({ tocOpen: true, textOpen: true }, 1420);
  eq('toc keeps its width', l.toc, TOC_WIDTH);
  eq('text takes the rest', l.text, 1420 - TOC_WIDTH);

  l = computeLayout({ tocOpen: false, textOpen: true, explanationOpen: true },
    1420);
  eq('explanation is a fixed comfortable width', l.explanation, SIDE_WIDTH);
  ok('root text keeps a readable column', l.text >= MIN_READABLE);

  l = computeLayout({ tocOpen: false, textOpen: true, explanationOpen: true,
    quoteOpen: true }, 1420);
  eq('both side panels stay fixed', l.explanation, SIDE_WIDTH);
  eq('and equal', l.explanation, l.quote);

  l = computeLayout({ tocOpen: false, textOpen: false, explanationOpen: true,
    quoteOpen: true }, 1420);
  const free = 1420 - BAR_WIDTH - BAR_WIDTH;
  eq('collapsed root text is shared evenly', l.explanation, l.quote);
  eq('and fills the freed space', l.explanation * 2, free);
  ok('grown beyond the fixed width', l.explanation > SIDE_WIDTH);

  l = computeLayout({ tocOpen: true, textOpen: true, explanationOpen: true },
    900);
  ok('toc collapses first under pressure', !l.tocOpen && l.textOpen);
  ok('nothing below the readable minimum',
    l.text >= MIN_READABLE && l.explanation >= MIN_READABLE);

  l = computeLayout({ tocOpen: true, textOpen: true, explanationOpen: true,
    quoteOpen: true }, 820);
  ok('then the root text collapses', !l.tocOpen && !l.textOpen);
  ok('side panels stay readable',
    l.explanation >= MIN_READABLE && l.quote >= MIN_READABLE);
}

// ----------------------------------------------------------- markdown rules
async function markdownRules() {
  process.stdout.write('markdown\n');
  const { render } = await import(path.join(ROOT, 'app/renderer/lib/markdown.js'));
  const html = render([
    '<!--line 0-40-->',
    '> **ཞེས་གསུངས།**',
    '> Thus it is said.',
    '',
    'A [quotation](quote:q0001) inline.',
  ].join('\n'));
  ok('line anchors become sections',
    /<section class="exp-line" data-start="0" data-end="40">/.test(html), html);
  ok('quote links become click targets',
    /<span class="quote-ref" data-quote="q0001"/.test(html), html);
  ok('blockquotes render', /<blockquote>/.test(html), html);
  ok('html is escaped', !render('<img src=x onerror=1>').includes('<img'),
    render('<img src=x onerror=1>'));
}

// ------------------------------------------------------------- the app live
async function appChecks() {
  process.stdout.write('reader\n');
  const server = spawn(process.execPath, [path.join(ROOT, 'tools/serve.js')], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((r) => server.stdout.once('data', r));

  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage({ viewport: { width: 1420, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });

  try {
    await page.goto(URL_, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__reader && window.__reader.ready,
      null, { timeout: 20000 });
    await page.evaluate(() => window.__reader.ready);

    const info = await page.evaluate(() => ({
      paras: document.querySelectorAll('.para').length,
      docParas: window.__reader.doc.paragraphs.length,
      pages: window.__reader.doc.meta.pdfPages,
      toc: document.querySelectorAll('.toc-entry').length,
      sub: document.getElementById('docSub').textContent,
      status: document.getElementById('statusPage').textContent,
    }));
    eq('every paragraph is rendered', info.paras, info.docParas);
    ok('the table of contents is populated', info.toc > 100, String(info.toc));
    ok('the title bar names the file and page count',
      info.sub.includes(String(info.pages)), info.sub);
    // the treatise itself begins on PDF page 36; pages 1-35 are the cover and
    // the dkar chag, which the reader presents as its table of contents
    ok('the status bar reports the PDF page, not a reflowed one',
      /^Page 36 of 355/.test(info.status), info.status);

    // ---- paging matches the PDF
    const paging = await page.evaluate(() => {
      const r = window.__reader;
      r.pane.scrollToPage(120);
      return { after: r.pane.currentPosition().page };
    });
    eq('jumping to a PDF page lands on it', paging.after, 120);

    // ---- exact-match search
    const search = await page.evaluate(() => {
      const r = window.__reader;
      const probe = r.doc.paragraphs[40].text.slice(20, 46);
      const hits = r.runSearch(probe);
      return {
        hits,
        probe,
        marked: document.querySelectorAll('.hit').length,
        current: document.querySelectorAll('.hit-current').length,
      };
    });
    ok('search finds the probe', search.hits >= 1, String(search.hits));
    ok('matches are marked in the text', search.marked >= 1);
    eq('the first hit is the current one', search.current, 1);

    await page.evaluate(() => window.__reader.runSearch(''));

    // ---- copy carries the source characters, with no space at a line break
    const copy = await page.evaluate(async () => {
      const r = window.__reader;
      const para = r.doc.paragraphs.find((p) => p.text.length > 400);
      r.pane.scrollToParagraph(para.id);
      const el = r.pane.nodes.get(para.id);
      const runs = [...el.querySelectorAll('.t')];
      const range = document.createRange();
      const first = runs[0].firstChild;
      const last = runs[runs.length - 1].firstChild;
      range.setStart(first, 0);
      range.setEnd(last, last.length);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      let copied = null;
      const handler = (e) => {
        copied = e.clipboardData.getData('text/plain');
      };
      document.addEventListener('copy', handler, true);
      // fire the app's own handler, then read what it wrote
      const evt = new ClipboardEvent('copy', {
        bubbles: true, cancelable: true, clipboardData: new DataTransfer(),
      });
      r.pane.root.dispatchEvent(evt);
      copied = evt.clipboardData.getData('text/plain');
      document.removeEventListener('copy', handler, true);
      sel.removeAllRanges();
      return { copied, source: para.text, id: para.id };
    });
    eq('a copied paragraph is exactly the source string',
      copy.copied, copy.source);
    ok('no space was introduced at a wrapped line',
      !/\s{2,}/.test(copy.copied || ''),
      JSON.stringify((copy.copied || '').slice(0, 60)));

    // ---- highlights survive a reload
    const applied = await page.evaluate(() => {
      const r = window.__reader;
      const para = r.doc.paragraphs[12];
      r.pane.scrollToParagraph(para.id);
      const el = r.pane.nodes.get(para.id);
      const run = el.querySelector('.t');
      const range = document.createRange();
      range.setStart(run.firstChild, 0);
      range.setEnd(run.firstChild, Math.min(24, run.firstChild.length));
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      const okApply = r.applyHighlight('b');
      return { okApply, count: r.store.get().highlights.length,
               painted: document.querySelectorAll('.hl-b').length };
    });
    ok('a highlight is applied', applied.okApply && applied.count === 1);
    ok('and painted', applied.painted >= 1);

    await page.evaluate(() => window.__reader.store.flush());
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__reader && window.__reader.ready);
    await page.evaluate(() => window.__reader.ready);
    const restored = await page.evaluate(() => ({
      count: window.__reader.store.get().highlights.length,
      painted: document.querySelectorAll('.hl-b').length,
      scrollTop: document.getElementById('scroller').scrollTop,
    }));
    eq('highlights come back on reopen', restored.count, 1);
    ok('and are painted again', restored.painted >= 1);
    ok('the reader resumes where it left off', restored.scrollTop > 0,
      String(restored.scrollTop));

    // ---- explanation panel
    const explained = await page.evaluate(async () => {
      const r = window.__reader;
      // The paragraph must have scroll room above it to be centred at all:
      // the first paragraph in the document sits against the top of the
      // scroller and can never reach the middle. Take the explained
      // paragraph furthest down the text, which always has room.
      const order = r.doc.paragraphs.map((p) => p.id);
      const withFile = order.filter((id) => r.pane.explained.has(id)).pop();
      await r.openExplanation(withFile || r.doc.paragraphs[5].id);
      await new Promise((res) => requestAnimationFrame(() => res()));
      const pane = document.getElementById('explanation');
      const el = r.pane.nodes.get(withFile || r.doc.paragraphs[5].id);
      const scroller = document.getElementById('scroller');
      const box = el.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      return {
        open: !pane.hidden,
        tocHidden: document.getElementById('toc').hidden,
        hasBody: document.getElementById('explanationBody').textContent.length > 40,
        centred: Math.abs((box.top + Math.min(box.height, view.height) / 2)
          - (view.top + view.height / 2)) < 90,
        id: withFile,
      };
    });
    ok('the explanation panel opens', explained.open);
    ok('the contents sidebar steps aside', explained.tocHidden);
    ok('the paragraph is vertically centred', explained.centred);
    ok('the explanation renders', explained.hasBody);

    // ---- translation lookup lands on the right line
    const lookup = await page.evaluate(async () => {
      const r = window.__reader;
      const id = r.pane.explained.values().next().value;
      if (!id) return { skipped: true };
      const para = r.pane.byId.get(id);
      const start = Math.floor(para.text.length * 0.6);
      await r.openExplanation(id, { start, end: start + 12 });
      const current = document.querySelector('.exp-line.current');
      return {
        skipped: false,
        found: !!current,
        covers: current
          ? Number(current.dataset.start) <= start
            && Number(current.dataset.end) >= start
          : false,
      };
    });
    if (lookup.skipped) {
      ok('translation lookup (no explanation files yet)', true);
    } else {
      ok('the explanation opens on the line covering the selection',
        lookup.found && lookup.covers, JSON.stringify(lookup));
    }

    // ---- quote panel
    const quoted = await page.evaluate(async () => {
      const r = window.__reader;
      const ref = document.querySelector('.quote-ref');
      if (!ref) return { skipped: true };
      ref.click();
      await new Promise((res) => setTimeout(res, 350));
      const panel = document.getElementById('quote');
      return {
        skipped: false,
        open: !panel.hidden,
        textStillOpen: !document.getElementById('textPane').hidden,
        marked: !!document.querySelector('#quoteBody mark'),
        // the quotation must be on screen; a quote near the top of its source
        // is already in view without scrolling, which is just as good
        inView: (() => {
          const body = document.getElementById('quoteBody');
          const mark = body.querySelector('mark');
          if (!mark) return false;
          const a = mark.getBoundingClientRect();
          const b = body.getBoundingClientRect();
          return a.bottom > b.top && a.top < b.bottom;
        })(),
      };
    });
    if (quoted.skipped) {
      ok('quote panel (no quotations in view)', true);
    } else {
      ok('a click on a quotation opens the source', quoted.open);
      ok('the root text stays open', quoted.textStillOpen);
      ok('the quotation is picked out', quoted.marked);
      ok('the source opens with the quotation in view', quoted.inView);
    }

    // ---- collapse rules
    const collapse = await page.evaluate(() => {
      const r = window.__reader;
      r.actions.toggleText();
      const bar = document.getElementById('textBar');
      const exp = document.getElementById('explanation');
      const out = {
        barShown: !bar.hidden,
        barLabel: bar.textContent.trim(),
        grew: exp.getBoundingClientRect().width,
      };
      r.actions.toggleText();
      return out;
    });
    ok('collapsing the root text leaves a labelled bar',
      collapse.barShown && /Root text/.test(collapse.barLabel),
      JSON.stringify(collapse));
    ok('and the side panels grow', collapse.grew > 430, String(collapse.grew));

    // ---- appearance and settings
    const appearance = await page.evaluate(() => {
      const r = window.__reader;
      r.actions.dark();
      const dark = document.documentElement.dataset.appearance;
      r.actions.settings();
      const sheet = !document.getElementById('settingsSheet').hidden;
      const keys = document.querySelectorAll('.key-btn').length;
      r.actions.settings();
      r.actions.dark();
      return { dark, sheet, keys };
    });
    eq('dark appearance toggles', appearance.dark, 'dark');
    ok('the settings sheet opens', appearance.sheet);
    eq('all six shortcuts are re-bindable', appearance.keys, 6);

    ok('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  } finally {
    await browser.close();
    server.kill();
  }
}

(async () => {
  await layoutRules();
  await markdownRules();
  await appChecks();
  process.stdout.write(`\n${checks - failures}/${checks} checks passed\n`);
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  process.stderr.write(String(err && err.stack || err) + '\n');
  process.exit(1);
});
