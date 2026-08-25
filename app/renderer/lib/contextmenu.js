// A small context menu drawn by the reader rather than by the host, so the
// same code serves macOS and Windows.

export class ContextMenu {
  constructor(el) {
    this.el = el;
    this.items = [];
    document.addEventListener('mousedown', (e) => {
      if (!this.el.hidden && !this.el.contains(e.target)) this.hide();
    }, true);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });
    window.addEventListener('blur', () => this.hide());
    window.addEventListener('resize', () => this.hide());
    this.el.addEventListener('click', (e) => {
      const btn = e.target.closest('.menu-item');
      if (!btn || btn.disabled) return;
      const item = this.items[Number(btn.dataset.i)];
      this.hide();
      if (item && item.run) item.run();
    });
  }

  show(x, y, items) {
    this.items = items;
    this.el.innerHTML = items.map((item, i) => (
      item.separator
        ? '<div class="menu-sep"></div>'
        : `<button class="menu-item" data-i="${i}"${item.disabled ? ' disabled' : ''}>`
          + `<span>${escapeHtml(item.label)}</span>`
          + `<span class="menu-key">${escapeHtml(item.hint || '')}</span></button>`
    )).join('');
    this.el.hidden = false;
    const box = this.el.getBoundingClientRect();
    const left = Math.min(x, window.innerWidth - box.width - 8);
    const top = Math.min(y, window.innerHeight - box.height - 8);
    this.el.style.left = `${Math.max(6, left)}px`;
    this.el.style.top = `${Math.max(6, top)}px`;
  }

  hide() {
    this.el.hidden = true;
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
