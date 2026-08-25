import { host } from '../bridge.js';
import { scrollIntoPosition } from './dom.js';

// The quote panel: the quoted source opened at the place the quotation comes
// from, with the quotation itself picked out, so the reader can see what runs
// before and after it.

export class QuotePanel {
  constructor({ panel, body, meta, sub, closeBtn }) {
    this.panel = panel;
    this.body = body;
    this.meta = meta;
    this.sub = sub;
    this.onClose = () => {};
    this.current = null;
    closeBtn.addEventListener('click', () => this.close());
  }

  get isOpen() {
    return !this.panel.hidden;
  }

  async open(quoteId) {
    this.current = quoteId;
    const quote = await host.readQuote(quoteId);
    if (this.current !== quoteId) return false;
    if (!quote) {
      this.sub.textContent = quoteId;
      this.meta.innerHTML = '';
      this.body.innerHTML = '<p class="empty-note">No source record was found '
        + `for <code>${escapeHtml(quoteId)}</code>.</p>`;
      return false;
    }
    return this.show(quote);
  }

  /** Show a record directly — used for the edition's own citation notes too. */
  async show(quote) {
    const src = quote.source || {};
    this.sub.textContent = src.title || src.file || '';
    this.meta.innerHTML = metaHtml(quote);

    if (!src.file) {
      this.body.innerHTML = quote.text
        ? `<mark>${escapeHtml(quote.text)}</mark>`
        : '<p class="empty-note">This citation records a reference only; the '
          + 'source text is not among the files shipped with the reader.</p>';
      return true;
    }

    const offset = (quote.location && quote.location.offset) || 0;
    const win = await host.readSource({ file: src.file, offset });
    if (!win) {
      this.body.innerHTML = '<p class="empty-note">The source file '
        + `<code>${escapeHtml(src.file)}</code> could not be read.</p>`;
      return false;
    }

    const local = locate(win, quote, offset);
    const before = win.text.slice(0, local.start);
    const hit = win.text.slice(local.start, local.end);
    const after = win.text.slice(local.end);
    this.body.innerHTML =
      (win.start > 0 ? '<div class="quote-truncated">… earlier in the text …</div>' : '')
      + escapeHtml(before)
      + (hit ? `<mark id="quoteHit">${escapeHtml(hit)}</mark>` : '')
      + escapeHtml(after)
      + (win.end < win.total ? '<div class="quote-truncated">… continues …</div>' : '');

    const mark = this.body.querySelector('#quoteHit');
    if (mark) scrollIntoPosition(this.body, mark, 0.36);
    else this.body.scrollTop = 0;
    return true;
  }

  close() {
    this.current = null;
    this.onClose();
  }
}

/**
 * Where the quotation sits inside the window we fetched.  The recorded offset
 * is trusted first; if the characters there have drifted, the quotation is
 * searched for nearby, so a lightly edited source still lands in the right
 * place instead of silently highlighting the wrong words.
 */
function locate(win, quote, offset) {
  const length = (quote.location && quote.location.length)
    || (quote.text ? quote.text.length : 0);
  const guess = offset - win.start;
  const text = quote.text || '';
  if (text && win.text.substr(guess, text.length) === text) {
    return { start: guess, end: guess + text.length };
  }
  if (text) {
    const at = win.text.indexOf(text);
    if (at >= 0) return { start: at, end: at + text.length };
    // fall back to the opening run of the quotation
    const head = text.slice(0, Math.min(24, text.length));
    const near = win.text.indexOf(head);
    if (near >= 0) return { start: near, end: near + text.length };
  }
  const start = Math.max(0, Math.min(guess, win.text.length));
  return { start, end: Math.min(win.text.length, start + (length || 0)) };
}

function metaHtml(quote) {
  const src = quote.source || {};
  const bits = [];
  if (src.title) {
    bits.push(`<span class="qm-title">${escapeHtml(src.title)}</span>`);
  }
  if (src.author) bits.push(escapeHtml(src.author));
  const loc = quote.location || {};
  const where = [];
  if (loc.line) where.push(`line ${loc.line}`);
  if (typeof loc.offset === 'number') where.push(`char ${loc.offset}`);
  if (where.length) {
    bits.push(`<span class="qm-loc">${where.join(' · ')}</span>`);
  }
  if (quote.citation) bits.push(`<span class="tib">${escapeHtml(quote.citation)}</span>`);
  return bits.join(' · ');
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
