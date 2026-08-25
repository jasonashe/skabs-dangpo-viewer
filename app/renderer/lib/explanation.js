import { render } from './markdown.js';
import { scrollIntoPosition } from './dom.js';
import { host } from '../bridge.js';

// The explanation panel.  Explanation files are Markdown, one per paragraph,
// named after the paragraph id.  Blocks may be tagged with the span of the
// paragraph they explain (<!--line 120-388-->), which is what the translation
// lookup scrolls to.

export class ExplanationPanel {
  constructor({ panel, body, sub, closeBtn }) {
    this.panel = panel;
    this.body = body;
    this.sub = sub;
    this.paraId = null;
    this.cache = new Map();
    this.known = null;              // set of paragraph ids that have a file
    this.onQuote = () => {};
    this.onClose = () => {};

    closeBtn.addEventListener('click', () => this.close());
    this.body.addEventListener('click', (e) => {
      const ref = e.target.closest('.quote-ref');
      if (!ref) return;
      for (const el of this.body.querySelectorAll('.quote-ref.active')) {
        el.classList.remove('active');
      }
      ref.classList.add('active');
      this.onQuote(ref.dataset.quote);
    });
    this.body.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const ref = e.target.closest('.quote-ref');
      if (!ref) return;
      e.preventDefault();
      this.onQuote(ref.dataset.quote);
    });
  }

  get isOpen() {
    return !this.panel.hidden;
  }

  async load(paraId) {
    if (this.cache.has(paraId)) return this.cache.get(paraId);
    if (this.known && !this.known.has(paraId)) {
      this.cache.set(paraId, null);
      return null;
    }
    let md = null;
    try {
      md = await host.readExplanation(paraId);
    } catch { md = null; }
    this.cache.set(paraId, md);
    return md;
  }

  async open(paraId, { label } = {}) {
    this.paraId = paraId;
    this.sub.textContent = label || paraId;
    const md = await this.load(paraId);
    if (this.paraId !== paraId) return false;      // superseded while loading
    if (md == null) {
      this.body.innerHTML = '<p class="empty-note">There is no explanation file '
        + `for this paragraph yet.<br>Add <code>Explanations/${escapeHtml(paraId)}`
        + '.md</code> and it will appear here.</p>';
    } else {
      this.body.innerHTML = render(md);
    }
    this.body.scrollTop = 0;
    return md != null;
  }

  /**
   * Scroll to the block covering a span of the paragraph and mark it.
   * Falls back to the block with the largest overlap.
   */
  focusSpan(start, end) {
    const lines = [...this.body.querySelectorAll('.exp-line')];
    if (!lines.length) return null;
    for (const el of lines) el.classList.remove('current');
    let best = null;
    let bestScore = 0;
    for (const el of lines) {
      const s = Number(el.dataset.start);
      const e = Number(el.dataset.end);
      const overlap = Math.min(end, e) - Math.max(start, s);
      if (overlap > bestScore) {
        bestScore = overlap;
        best = el;
      }
      if (best === null && s <= start && e >= start) best = el;
    }
    if (!best) {
      // nothing covers it: take the nearest block that starts before it
      for (const el of lines) {
        if (Number(el.dataset.start) <= start) best = el;
      }
    }
    if (!best) best = lines[0];
    best.classList.add('current');
    scrollIntoPosition(this.body, best, 0.28);
    return best;
  }

  close() {
    this.paraId = null;
    this.onClose();
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
