import { host } from './bridge.js';
import * as store from './lib/store.js';
import { TextPane } from './lib/text.js';
import { Toc } from './lib/toc.js';
import { PanelHost } from './lib/panels.js';
import { ExplanationPanel } from './lib/explanation.js';
import { QuotePanel } from './lib/quote.js';
import { Settings } from './lib/settings.js';
import { ContextMenu } from './lib/contextmenu.js';
import { findAction, formatBinding, ACTION_LABELS } from './lib/shortcuts.js';

const $ = (id) => document.getElementById(id);

const el = {
  titlebar: $('titlebar'),
  inset: $('titlebarInset'),
  insetEnd: $('titlebarInsetEnd'),
  docTitle: $('docTitle'),
  docSub: $('docSub'),
  panels: $('panels'),
  toc: $('toc'),
  tocBar: $('tocBar'),
  tocList: $('tocList'),
  tocHide: $('tocHide'),
  textPane: $('textPane'),
  textBar: $('textBar'),
  scroller: $('scroller'),
  column: $('column'),
  explanation: $('explanation'),
  explanationBody: $('explanationBody'),
  explanationSub: $('explanationSub'),
  explanationClose: $('explanationClose'),
  quote: $('quote'),
  quoteBody: $('quoteBody'),
  quoteMeta: $('quoteMeta'),
  quoteSub: $('quoteSub'),
  quoteClose: $('quoteClose'),
  btnToc: $('btnToc'),
  btnText: $('btnText'),
  btnDark: $('btnDark'),
  btnSettings: $('btnSettings'),
  btnApply: $('btnApplyHighlight'),
  btnClear: $('btnClearHighlight'),
  searchInput: $('searchInput'),
  searchCount: $('searchCount'),
  searchPrev: $('searchPrev'),
  searchNext: $('searchNext'),
  statusPage: $('statusPage'),
  statusSection: $('statusSection'),
  statusRight: $('statusRight'),
  contextMenu: $('contextMenu'),
  settingsSheet: $('settingsSheet'),
  settingsBody: $('settingsBody'),
  settingsClose: $('settingsClose'),
};

let doc = null;
let pane = null;
let toc = null;
let panels = null;
let explanation = null;
let quote = null;
let settings = null;
let menu = null;
let tocBeforeExplanation = true;
let lastSelection = null;

// --------------------------------------------------------------- appearance
function applyAppearance() {
  const s = store.get();
  document.documentElement.dataset.appearance = s.appearance;
  document.documentElement.style.setProperty('--tib', `"${s.tibetanFont}"`);
  document.documentElement.style.setProperty('--eng', `"${s.englishFont}"`);
  document.documentElement.style.setProperty('--text-size', `${s.textSize}px`);
  el.btnDark.textContent = s.appearance === 'dark' ? 'Light' : 'Dark';
  host.setTitleBarTheme(s.appearance === 'dark');
}

// ------------------------------------------------------------------- panels
function syncPanelButtons(layout) {
  el.btnToc.setAttribute('aria-pressed', String(layout.tocOpen));
  el.btnText.setAttribute('aria-pressed', String(layout.textOpen));
}

function setToc(open) {
  store.set({ tocOpen: open });
  panels.setIntent({ tocOpen: open });
}

function setText(open) {
  store.set({ textOpen: open });
  panels.setIntent({ textOpen: open });
}

// ------------------------------------------------------------------ status
function updateStatus(page) {
  const meta = doc.meta;
  const folio = folioForPage(page);
  const parts = [`Page ${page} of ${meta.pdfPages}`];
  if (folio != null) parts.push(`folio ${folio}`);
  el.statusPage.textContent = parts.join(' · ');
  el.statusSection.textContent = doc.runningHeads[String(page)] || '';
  const n = store.get().highlights.length;
  el.statusRight.textContent = n
    ? `${n} highlight${n === 1 ? '' : 's'}`
    : '';
}

function folioForPage(page) {
  for (const p of doc.paragraphs) {
    for (const ps of p.pageStarts) if (ps.page === page) return ps.folio;
  }
  const off = doc.meta.folioOffset;
  return page > off ? page - off : null;
}

// ------------------------------------------------------------------ search
function runSearch(query) {
  const n = pane.search(query);
  el.searchCount.textContent = query
    ? (n ? `1/${n}` : 'none')
    : '';
  return n;
}

function stepSearch(delta) {
  if (!pane.searchHits.length) return;
  pane.goToHit(pane.currentHit + delta);
  el.searchCount.textContent = `${pane.currentHit + 1}/${pane.searchHits.length}`;
}

// -------------------------------------------------------------- highlights
function applyHighlight(color) {
  const sel = lastSelection || pane.selection();
  if (!sel || sel.multi) return false;
  const c = color || store.get().highlightColor;
  const list = store.get().highlights.filter(
    (h) => !(h.paraId === sel.paraId && h.color === c
             && h.start <= sel.end && h.end >= sel.start));
  let start = sel.start;
  let end = sel.end;
  for (const h of store.get().highlights) {
    if (h.paraId === sel.paraId && h.color === c
        && h.start <= sel.end && h.end >= sel.start) {
      start = Math.min(start, h.start);
      end = Math.max(end, h.end);
    }
  }
  list.push({ id: `h${Date.now().toString(36)}${list.length}`,
              paraId: sel.paraId, start, end, color: c });
  store.set({ highlights: list, highlightColor: c });
  pane.setHighlights(list);
  window.getSelection().removeAllRanges();
  lastSelection = null;
  updateStatus(pane.currentPosition().page);
  return true;
}

function clearHighlight() {
  const sel = lastSelection || pane.selection();
  if (!sel) return false;
  const list = store.get().highlights.filter(
    (h) => !(h.paraId === sel.paraId && h.start < sel.end && h.end > sel.start));
  if (list.length === store.get().highlights.length) return false;
  store.set({ highlights: list });
  pane.setHighlights(list);
  updateStatus(pane.currentPosition().page);
  return true;
}

// ------------------------------------------------------- explanation flows
async function openExplanation(paraId, span) {
  const para = pane.byId.get(paraId);
  if (!para) return;
  if (!explanation.isOpen) tocBeforeExplanation = store.get().tocOpen;
  // §4: the contents sidebar steps aside to leave room for the explanation
  panels.setIntent({ tocOpen: false, explanationOpen: true });
  store.set({ tocOpen: false });
  markTarget(paraId);
  await explanation.open(paraId, { label: `${paraId} · page ${para.page}` });
  if (span) explanation.focusSpan(span.start, span.end);
  // centring must happen after the layout settles, or the column is still wide
  requestAnimationFrame(() => pane.centerParagraph(paraId));
}

function closeExplanation() {
  panels.setIntent({ explanationOpen: false, tocOpen: tocBeforeExplanation });
  store.set({ tocOpen: tocBeforeExplanation });
  markTarget(null);
}

function markTarget(paraId) {
  for (const node of pane.column.querySelectorAll('.para.is-target')) {
    node.classList.remove('is-target');
  }
  const node = paraId && pane.nodes.get(paraId);
  if (node) node.classList.add('is-target');
}

async function findTranslation() {
  const sel = lastSelection || pane.selection();
  if (!sel) {
    flashSearchHint('Select some text in the root text first.');
    return;
  }
  await openExplanation(sel.paraId, { start: sel.start, end: sel.end });
}

function flashSearchHint(text) {
  el.statusRight.textContent = text;
  setTimeout(() => updateStatus(pane.currentPosition().page), 2600);
}

// ------------------------------------------------------------- quote flows
async function openQuote(quoteId) {
  panels.setIntent({ quoteOpen: true });
  await quote.open(quoteId);
}

async function openApparatusNote(folio, n) {
  const note = (doc.apparatus[String(folio)] || {})[String(n)];
  if (!note) return;
  panels.setIntent({ quoteOpen: true });
  await quote.show({
    id: `note-${folio}-${n}`,
    text: note,
    citation: `ལུང་མཆན། ${folio}·${n}`,
    source: { title: 'ལུང་མཆན་དང་བསྡུར་མཆན།',
              author: 'སེར་བྱེས་མཁས་སྙན་གྲྭ་ཚང་། (dpe bsdur ma apparatus)' },
  });
}

// ------------------------------------------------------------------ actions
const actions = {
  explanation: () => {
    const sel = lastSelection || pane.selection();
    const paraId = sel ? sel.paraId : pane.currentPosition().paraId;
    openExplanation(paraId);
  },
  translation: () => findTranslation(),
  highlight: () => applyHighlight(),
  dark: () => {
    store.set({ appearance: store.get().appearance === 'dark' ? 'light' : 'dark' });
    applyAppearance();
  },
  search: () => {
    el.searchInput.focus();
    el.searchInput.select();
  },
  settings: () => settings.toggle(),
  toggleToc: () => setToc(!store.get().tocOpen),
  toggleText: () => setText(!store.get().textOpen),
  textBigger: () => {
    store.set({ textSize: Math.min(40, store.get().textSize + 1) });
    applyAppearance();
  },
  textSmaller: () => {
    store.set({ textSize: Math.max(14, store.get().textSize - 1) });
    applyAppearance();
  },
};

// -------------------------------------------------------------------- boot
async function main() {
  await store.load();
  applyAppearance();

  const insets = await host.chromeInsets();
  el.inset.style.width = `${insets.titleBarLeft || 12}px`;
  el.insetEnd.style.width = `${insets.titleBarRight || insets.titleBarLeft || 12}px`;
  document.documentElement.dataset.platform = insets.platform || 'browser';

  doc = await host.readData('text.json');
  el.docTitle.textContent = doc.meta.title;
  el.docSub.textContent = `${doc.meta.file} — ${doc.meta.pdfPages} pages`;

  pane = new TextPane(el.scroller, doc);
  pane.highlights = store.get().highlights;
  pane.render();

  let explained = [];
  try {
    explained = await host.listExplanations();
  } catch { /* no explanations yet */ }
  pane.setExplained(explained);

  toc = new Toc(el.tocList, doc.toc, doc.paragraphs);
  toc.onPick = (entry) => {
    if (entry.paraId) pane.scrollToParagraph(entry.paraId);
    else if (entry.page) pane.scrollToPage(entry.page);
  };

  panels = new PanelHost({
    row: el.panels, toc: el.toc, tocBar: el.tocBar, text: el.textPane,
    textBar: el.textBar, explanation: el.explanation, quote: el.quote,
  });
  panels.onChange = (layout) => syncPanelButtons(layout);
  panels.setIntent({
    tocOpen: store.get().tocOpen,
    textOpen: store.get().textOpen,
    explanationOpen: false,
    quoteOpen: false,
  });

  explanation = new ExplanationPanel({
    panel: el.explanation, body: el.explanationBody, sub: el.explanationSub,
    closeBtn: el.explanationClose,
  });
  explanation.known = new Set(explained);
  explanation.onQuote = (id) => openQuote(id);
  explanation.onClose = () => closeExplanation();

  quote = new QuotePanel({
    panel: el.quote, body: el.quoteBody, meta: el.quoteMeta, sub: el.quoteSub,
    closeBtn: el.quoteClose,
  });
  quote.onClose = () => panels.setIntent({ quoteOpen: false });

  settings = new Settings({
    backdrop: el.settingsSheet, body: el.settingsBody, closeBtn: el.settingsClose,
  }, store);
  settings.onChange = (key) => {
    applyAppearance();
    if (key === 'shortcuts') host.setShortcuts(store.get().shortcuts);
    if (key === 'textSize') {
      const a = store.get();
      if (a.anchorParaId) pane.restoreAnchor(a.anchorParaId, a.anchorOffsetRatio);
    }
  };

  menu = new ContextMenu(el.contextMenu);

  wireToolbar();
  wireText();
  wireKeys();
  host.setShortcuts(store.get().shortcuts);
  host.onMenu((action) => actions[action] && actions[action]());

  restorePosition();

  pane.onPageChange = (page) => {
    updateStatus(page);
    store.set({ ...pane.anchor(), scrollTop: el.scroller.scrollTop });
  };
  pane.onParaChange = (paraId) => {
    toc.follow(paraId);
    store.set({ ...pane.anchor(), scrollTop: el.scroller.scrollTop });
  };
  el.scroller.addEventListener('scroll', () => {
    store.set({ scrollTop: el.scroller.scrollTop, ...pane.anchor() });
  }, { passive: true });

  const pos = pane.currentPosition();
  updateStatus(pos.page);
  toc.follow(pos.paraId);
}

function restorePosition() {
  const s = store.get();
  // the anchor survives a change of type size; scrollTop is the fallback
  if (s.anchorParaId && pane.restoreAnchor(s.anchorParaId, s.anchorOffsetRatio)) {
    return;
  }
  el.scroller.scrollTop = s.scrollTop || 0;
}

// ------------------------------------------------------------------ wiring
function wireToolbar() {
  el.btnToc.addEventListener('click', () => setToc(!store.get().tocOpen));
  el.btnText.addEventListener('click', () => setText(!store.get().textOpen));
  el.tocHide.addEventListener('click', () => setToc(false));
  el.tocBar.addEventListener('click', () => setToc(true));
  el.textBar.addEventListener('click', () => setText(true));
  for (const bar of [el.tocBar, el.textBar]) {
    bar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        bar.click();
      }
    });
  }

  el.btnDark.addEventListener('click', actions.dark);
  el.btnSettings.addEventListener('click', actions.settings);

  for (const sw of document.querySelectorAll('.swatch')) {
    sw.addEventListener('click', () => {
      store.set({ highlightColor: sw.dataset.color });
      syncSwatches();
    });
  }
  syncSwatches();
  el.btnApply.addEventListener('click', () => applyHighlight());
  el.btnClear.addEventListener('click', () => clearHighlight());

  let timer = null;
  el.searchInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => runSearch(el.searchInput.value), 140);
  });
  el.searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (pane.searchHits.length) stepSearch(e.shiftKey ? -1 : 1);
      else runSearch(el.searchInput.value);
    } else if (e.key === 'Escape') {
      el.searchInput.value = '';
      runSearch('');
      el.searchInput.blur();
    }
  });
  el.searchPrev.addEventListener('click', () => stepSearch(-1));
  el.searchNext.addEventListener('click', () => stepSearch(1));
}

function syncSwatches() {
  const c = store.get().highlightColor;
  for (const sw of document.querySelectorAll('.swatch')) {
    sw.setAttribute('aria-pressed', String(sw.dataset.color === c));
  }
}

function wireText() {
  // remember the selection before a click or a menu steals it
  document.addEventListener('selectionchange', () => {
    const sel = pane.selection();
    if (sel) lastSelection = sel;
  });

  el.scroller.addEventListener('click', (e) => {
    const mark = e.target.closest('sup.mark');
    if (mark) {
      openApparatusNote(mark.dataset.folio, mark.dataset.n);
    }
  });

  el.scroller.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const para = pane.paragraphAt(e.target);
    if (!para) return;
    const sel = pane.selection() || lastSelection;
    const inPara = sel && sel.paraId === para.id;
    const keys = store.get().shortcuts;
    menu.show(e.clientX, e.clientY, [
      {
        label: 'Look at explanation',
        hint: formatBinding(keys.explanation),
        run: () => openExplanation(para.id),
      },
      {
        label: 'Find translation of selection',
        hint: formatBinding(keys.translation),
        disabled: !inPara,
        run: () => findTranslation(),
      },
      { separator: true },
      {
        label: 'Highlight in yellow',
        disabled: !inPara,
        run: () => applyHighlight('a'),
      },
      {
        label: 'Highlight in green',
        disabled: !inPara,
        run: () => applyHighlight('b'),
      },
      {
        label: 'Highlight in blue',
        disabled: !inPara,
        run: () => applyHighlight('c'),
      },
      {
        label: 'Remove highlight',
        disabled: !inPara,
        run: () => clearHighlight(),
      },
      { separator: true },
      {
        label: 'Copy',
        hint: formatBinding({ key: 'C', meta: true }),
        disabled: !sel,
        run: () => document.execCommand('copy'),
      },
    ]);
  });
}

function wireKeys() {
  document.addEventListener('keydown', (e) => {
    if (settings.isOpen && settings.recording) return;
    const target = e.target;
    const typing = target && (target.tagName === 'INPUT'
      || target.tagName === 'TEXTAREA');

    if (e.key === 'Escape') {
      if (settings.isOpen) return;                 // the sheet handles its own
      if (quote.isOpen) { quote.close(); return; }
      if (explanation.isOpen) { explanation.close(); return; }
    }
    if (typing && !(e.metaKey || e.ctrlKey)) return;

    const action = findAction(e, store.get().shortcuts);
    if (action && actions[action]) {
      e.preventDefault();
      actions[action]();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'g') {
      e.preventDefault();
      stepSearch(e.shiftKey ? -1 : 1);
    }
  });
}

// expose a handful of internals so the headless smoke test can drive the app
window.__reader = {
  get doc() { return doc; },
  get pane() { return pane; },
  get panels() { return panels; },
  get store() { return store; },
  actions,
  openExplanation,
  openQuote,
  runSearch,
  applyHighlight,
  clearHighlight,
  labels: ACTION_LABELS,
};

window.__reader.ready = main().catch((err) => {
  document.body.innerHTML = `<pre style="padding:24px;font:12px monospace">${
    String(err && err.stack || err)}</pre>`;
  throw err;
});
