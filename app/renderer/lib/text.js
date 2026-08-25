// The root-text pane: rendering, selection, search, highlighting and paging.
//
// Every run of characters is emitted as a <span class="t" data-off="N">, so a
// DOM position can always be turned back into an offset in the source string.
// Editorial superscripts and page marks are user-select:none, and copying is
// served from the model rather than from the DOM, so a copied string is exactly
// the source characters — no space is ever introduced at a wrapped line.

import { offsetWithin, scrollIntoPosition } from './dom.js';

// Where in the pane the reader's eye sits: anything above this line counts as
// "the page you are on".  Every scroll-to helper lands its target above it.
const READING_LINE = 0.15;
const LAND_AT = 0.07;

export const HIGHLIGHT_COLORS = {
  a: 'Yellow',
  b: 'Green',
  c: 'Blue',
};

export class TextPane {
  constructor(root, doc) {
    this.root = root;                 // the scrolling element
    this.doc = doc;                   // { meta, paragraphs, toc, ... }
    this.paras = doc.paragraphs;
    this.byId = new Map(this.paras.map((p) => [p.id, p]));
    this.index = new Map(this.paras.map((p, i) => [p.id, i]));
    this.column = root.querySelector('.column');
    this.highlights = [];
    this.searchHits = [];
    this.currentHit = -1;
    this.explained = new Set();
    this.nodes = new Map();
    this.onPageChange = () => {};
    this.onParaChange = () => {};
    this._lastPage = null;
    this._lastPara = null;
    this._bind();
  }

  // ------------------------------------------------------------- rendering
  render() {
    const html = this.paras.map((p) => this.paragraphHtml(p)).join('');
    this.column.innerHTML = html;
    this.nodes.clear();
    for (const el of this.column.querySelectorAll('.para')) {
      this.nodes.set(el.dataset.id, el);
    }
  }

  decorationsFor(para) {
    const out = [];
    for (const h of this.highlights) {
      if (h.paraId === para.id) {
        out.push({ start: h.start, end: h.end, cls: `hl hl-${h.color}`,
                   id: h.id });
      }
    }
    for (let i = 0; i < this.searchHits.length; i += 1) {
      const hit = this.searchHits[i];
      if (hit.paraId !== para.id) continue;
      out.push({
        start: hit.start,
        end: hit.end,
        cls: i === this.currentHit ? 'hit hit-current' : 'hit',
      });
    }
    return out;
  }

  paragraphHtml(para) {
    const text = para.text;
    const len = text.length;
    const decorations = this.decorationsFor(para);
    const marksAt = new Map();
    for (const m of para.marks) {
      if (!marksAt.has(m.offset)) marksAt.set(m.offset, []);
      marksAt.get(m.offset).push(m);
    }
    const pageAt = new Map();
    for (const ps of para.pageStarts) {
      if (ps.offset > 0) pageAt.set(ps.offset, ps);
    }

    const bounds = new Set([0, len]);
    for (const d of decorations) {
      if (d.start > 0 && d.start < len) bounds.add(d.start);
      if (d.end > 0 && d.end < len) bounds.add(d.end);
    }
    for (const off of marksAt.keys()) if (off > 0 && off < len) bounds.add(off);
    for (const off of pageAt.keys()) if (off < len) bounds.add(off);
    const points = [...bounds].sort((a, b) => a - b);

    const out = [];
    const startPage = para.pageStarts[0] || { page: para.page, folio: para.folio };
    out.push(
      `<div class="para${this.explained.has(para.id) ? ' has-explanation' : ''}"`
      + ` data-id="${para.id}" data-page="${para.page}">`
      + `<span class="gutter" aria-hidden="true">${startPage.page}</span>`
      + '<span class="body">');

    for (let i = 0; i < points.length - 1 || (len === 0 && i === 0); i += 1) {
      const s = points[i];
      const e = points[i + 1] === undefined ? len : points[i + 1];
      if (pageAt.has(s)) out.push(this.pageMarkHtml(pageAt.get(s)));
      if (marksAt.has(s)) {
        for (const m of marksAt.get(s)) out.push(this.markHtml(para, m));
      }
      if (e <= s) continue;
      const cls = ['t'];
      for (const d of decorations) {
        if (d.start <= s && d.end >= e) cls.push(d.cls);
      }
      out.push(`<span class="${cls.join(' ')}" data-off="${s}">`
               + escapeText(text.slice(s, e)) + '</span>');
    }
    if (marksAt.has(len)) {
      for (const m of marksAt.get(len)) out.push(this.markHtml(para, m));
    }
    out.push('</span></div>');
    return out.join('');
  }

  markHtml(para, mark) {
    const folio = folioAt(para, mark.offset);
    const note = (this.doc.apparatus[String(folio)] || {})[String(mark.n)] || '';
    const title = note ? ` title="${escapeAttr(note)}"` : '';
    return `<sup class="mark" data-folio="${folio}" data-n="${mark.n}"${title}>`
      + `${mark.n}</sup>`;
  }

  pageMarkHtml(ps) {
    return `<span class="pagemark" data-page="${ps.page}" aria-hidden="true">`
      + `<span class="pagemark-label">${ps.page}</span></span>`;
  }

  repaint(paraId) {
    const para = this.byId.get(paraId);
    const el = this.nodes.get(paraId);
    if (!para || !el) return;
    const tmp = document.createElement('div');
    tmp.innerHTML = this.paragraphHtml(para);
    // replaceWith moves the node out of tmp, so take the reference first
    const next = tmp.firstElementChild;
    el.replaceWith(next);
    this.nodes.set(paraId, next);
  }

  repaintAll(ids) {
    for (const id of new Set(ids)) this.repaint(id);
  }

  // ------------------------------------------------------------- selection
  /** Turn the live selection into { paraId, start, end, text } or null. */
  selection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const a = this.locate(range.startContainer, range.startOffset);
    const b = this.locate(range.endContainer, range.endOffset);
    if (!a || !b) return null;
    if (a.paraId !== b.paraId) {
      return { paraId: a.paraId, start: a.offset,
               end: this.byId.get(a.paraId).text.length,
               spans: this.spanRange(a, b), multi: true,
               text: this.textForRange(a, b) };
    }
    const start = Math.min(a.offset, b.offset);
    const end = Math.max(a.offset, b.offset);
    if (end <= start) return null;
    return { paraId: a.paraId, start, end,
             text: this.byId.get(a.paraId).text.slice(start, end) };
  }

  locate(node, offset) {
    let el = node.nodeType === 3 ? node.parentElement : node;
    let extra = node.nodeType === 3 ? offset : 0;
    if (node.nodeType !== 3 && node.childNodes[offset]) {
      el = node.childNodes[offset].nodeType === 3
        ? node.childNodes[offset].parentElement
        : node.childNodes[offset];
    }
    const seg = el && el.closest ? el.closest('.t') : null;
    const para = el && el.closest ? el.closest('.para') : null;
    if (!para) return null;
    if (!seg) {
      // landed on a mark or the padding between runs: fall back to the
      // nearest run inside this paragraph
      const runs = para.querySelectorAll('.t');
      if (!runs.length) return null;
      const last = runs[runs.length - 1];
      return { paraId: para.dataset.id,
               offset: Number(last.dataset.off) + last.textContent.length };
    }
    return { paraId: para.dataset.id, offset: Number(seg.dataset.off) + extra };
  }

  spanRange(a, b) {
    const ia = this.index.get(a.paraId);
    const ib = this.index.get(b.paraId);
    return [Math.min(ia, ib), Math.max(ia, ib)];
  }

  /** Exact source characters for a selection, wrapped lines included. */
  textForRange(a, b) {
    let [ia, ib] = this.spanRange(a, b);
    let startOff = a.offset;
    let endOff = b.offset;
    if (this.index.get(a.paraId) > this.index.get(b.paraId)) {
      [startOff, endOff] = [b.offset, a.offset];
    }
    if (ia === ib) {
      const t = this.paras[ia].text;
      return t.slice(Math.min(startOff, endOff), Math.max(startOff, endOff));
    }
    const parts = [];
    for (let i = ia; i <= ib; i += 1) {
      const t = this.paras[i].text;
      if (i === ia) parts.push(t.slice(startOff));
      else if (i === ib) parts.push(t.slice(0, endOff));
      else parts.push(t);
    }
    return parts.join('\n\n');
  }

  // ---------------------------------------------------------------- search
  /** Exact-match search over the source text. Returns the number of hits. */
  search(query) {
    const dirty = new Set(this.searchHits.map((h) => h.paraId));
    this.searchHits = [];
    this.currentHit = -1;
    const q = String(query || '');
    if (q) {
      for (const para of this.paras) {
        let from = 0;
        for (;;) {
          const at = para.text.indexOf(q, from);
          if (at < 0) break;
          this.searchHits.push({ paraId: para.id, start: at, end: at + q.length });
          dirty.add(para.id);
          from = at + Math.max(1, q.length);
        }
      }
    }
    this.repaintAll(dirty);
    if (this.searchHits.length) this.goToHit(0);
    return this.searchHits.length;
  }

  goToHit(i) {
    if (!this.searchHits.length) return;
    const next = ((i % this.searchHits.length) + this.searchHits.length)
      % this.searchHits.length;
    const dirty = [];
    if (this.currentHit >= 0 && this.searchHits[this.currentHit]) {
      dirty.push(this.searchHits[this.currentHit].paraId);
    }
    this.currentHit = next;
    dirty.push(this.searchHits[next].paraId);
    this.repaintAll(dirty);
    const el = this.nodes.get(this.searchHits[next].paraId);
    const mark = el && el.querySelector('.hit-current');
    this.scrollToElement(mark || el, 0.32);
  }

  clearSearch() {
    this.search('');
  }

  // ------------------------------------------------------------ highlights
  setHighlights(list) {
    const dirty = new Set([...this.highlights, ...list].map((h) => h.paraId));
    this.highlights = list.slice();
    this.repaintAll(dirty);
  }

  // -------------------------------------------------------------- movement
  scrollToElement(el, ratio = LAND_AT) {
    scrollIntoPosition(this.root, el, ratio);
  }

  scrollToParagraph(paraId, ratio = LAND_AT) {
    this.scrollToElement(this.nodes.get(paraId), ratio);
  }

  /** Put a paragraph in the vertical middle of the pane. */
  centerParagraph(paraId) {
    const el = this.nodes.get(paraId);
    if (!el) return;
    const height = Math.min(el.offsetHeight, this.root.clientHeight);
    const top = offsetWithin(this.root, el)
      - (this.root.clientHeight - height) / 2;
    this.root.scrollTop = Math.max(0, top);
  }

  scrollToPage(page) {
    for (const para of this.paras) {
      const ps = para.pageStarts.find((x) => x.page === page);
      if (!ps) continue;
      const el = this.nodes.get(para.id);
      if (!el) return;
      if (ps.offset === 0) return this.scrollToElement(el, LAND_AT);
      const mark = [...el.querySelectorAll('.pagemark')]
        .find((n) => Number(n.dataset.page) === page);
      return this.scrollToElement(mark || el, LAND_AT);
    }
  }

  /** The paragraph at the reading line, and the PDF page it belongs to. */
  currentPosition() {
    const line = this.root.scrollTop + this.root.clientHeight * READING_LINE;
    let found = this.paras[0];
    for (const para of this.paras) {
      const el = this.nodes.get(para.id);
      if (!el) continue;
      if (offsetWithin(this.root, el) <= line) found = para;
      else break;
    }
    const el = this.nodes.get(found.id);
    let page = found.pageStarts[0] ? found.pageStarts[0].page : found.page;
    if (el) {
      for (const mark of el.querySelectorAll('.pagemark')) {
        if (offsetWithin(this.root, mark) <= line) page = Number(mark.dataset.page);
      }
    }
    return { paraId: found.id, page };
  }

  /** Where the reader was, in a form that survives a font-size change. */
  anchor() {
    const { paraId } = this.currentPosition();
    const el = this.nodes.get(paraId);
    if (!el) return { anchorParaId: null, anchorOffsetRatio: 0 };
    const within = this.root.scrollTop - offsetWithin(this.root, el);
    return {
      anchorParaId: paraId,
      anchorOffsetRatio: el.offsetHeight ? within / el.offsetHeight : 0,
    };
  }

  restoreAnchor(paraId, ratio) {
    const el = this.nodes.get(paraId);
    if (!el) return false;
    this.root.scrollTop = Math.max(
      0, offsetWithin(this.root, el) + el.offsetHeight * (ratio || 0));
    return true;
  }

  // ------------------------------------------------------------------ misc
  setExplained(ids) {
    this.explained = new Set(ids);
    for (const [id, el] of this.nodes) {
      el.classList.toggle('has-explanation', this.explained.has(id));
    }
  }

  paragraphAt(node) {
    const el = node && node.closest ? node.closest('.para') : null;
    return el ? this.byId.get(el.dataset.id) : null;
  }

  _bind() {
    this.root.addEventListener('scroll', () => {
      const pos = this.currentPosition();
      if (pos.page !== this._lastPage) {
        this._lastPage = pos.page;
        this.onPageChange(pos.page);
      }
      if (pos.paraId !== this._lastPara) {
        this._lastPara = pos.paraId;
        this.onParaChange(pos.paraId);
      }
    }, { passive: true });

    // Copy straight from the model: whatever the DOM had to do to draw
    // highlights, marks and page numbers, the clipboard gets source characters.
    this.root.addEventListener('copy', (e) => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const a = this.locate(range.startContainer, range.startOffset);
      const b = this.locate(range.endContainer, range.endOffset);
      if (!a || !b) return;
      const text = this.textForRange(a, b);
      if (!text) return;
      e.clipboardData.setData('text/plain', text);
      e.preventDefault();
    });
  }
}

function folioAt(para, offset) {
  let folio = para.folio;
  for (const ps of para.pageStarts) {
    if (ps.offset <= offset) folio = ps.folio;
  }
  return folio;
}

function escapeText(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return escapeText(s).replace(/"/g, '&quot;');
}
