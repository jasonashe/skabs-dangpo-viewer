// The table of contents.  Entries carry the PDF page they land on, the current
// section follows the reader down the text, and the list scrolls itself just
// enough to keep that section in view.

export class Toc {
  constructor(listEl, entries, paragraphs) {
    this.el = listEl;
    this.entries = entries.filter((e) => e.label);
    this.order = new Map(paragraphs.map((p, i) => [p.id, i]));
    this.current = null;
    this.onPick = () => {};
    this._render();
    this.el.addEventListener('click', (e) => {
      const row = e.target.closest('.toc-entry');
      if (!row) return;
      const entry = this.entries[Number(row.dataset.i)];
      if (entry) this.onPick(entry);
    });
  }

  _render() {
    this.el.innerHTML = this.entries.map((e, i) => (
      `<div class="toc-entry level-${e.level}" data-i="${i}" role="button" tabindex="0">`
      + `<span class="toc-label">${escapeHtml(e.label)}</span>`
      + `<span class="toc-page">${e.page ? e.page : ''}</span>`
      + '</div>'
    )).join('');
    this.rows = [...this.el.querySelectorAll('.toc-entry')];
  }

  /** Follow the text: highlight the last entry at or before this paragraph. */
  follow(paraId) {
    const pos = this.order.get(paraId);
    if (pos === undefined) return;
    let best = -1;
    for (let i = 0; i < this.entries.length; i += 1) {
      const target = this.entries[i].paraId;
      if (target === undefined || target === null) continue;
      const at = this.order.get(target);
      if (at !== undefined && at <= pos) best = i;
    }
    if (best === this.current) return;
    if (this.current >= 0 && this.rows[this.current]) {
      this.rows[this.current].classList.remove('current');
    }
    this.current = best;
    const row = this.rows[best];
    if (!row) return;
    row.classList.add('current');
    this.keepInView(row);
  }

  keepInView(row) {
    const box = this.el.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    const margin = 40;
    if (r.top < box.top + margin) {
      this.el.scrollTop -= (box.top + margin) - r.top;
    } else if (r.bottom > box.bottom - margin) {
      this.el.scrollTop += r.bottom - (box.bottom - margin);
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
