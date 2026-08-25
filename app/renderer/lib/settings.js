import { ACTION_LABELS, bindingFromEvent, formatBinding } from './shortcuts.js';

// The first is bundled with the app; the rest are used if the system has them.
export const TIBETAN_FONTS = [
  'Noto Serif Tibetan', 'Kokonor', 'Jomolhari', 'Microsoft Himalaya',
  'DDC Uchen', 'Tibetan Machine Uni', 'Monlam Uni OuChan2',
  'Yagpo Tibetan Uni', 'Songti SC',
];

export const ENGLISH_FONTS = [
  'Iowan Old Style', 'Palatino', 'Charter', 'Georgia', 'Baskerville',
  'Times New Roman', 'Hoefler Text', 'Helvetica Neue', 'system-ui',
];

// Light/dark, the two type faces, text size and the six re-bindable shortcuts.
export class Settings {
  constructor({ backdrop, body, closeBtn }, store) {
    this.backdrop = backdrop;
    this.body = body;
    this.store = store;
    this.recording = null;
    this.onChange = () => {};

    closeBtn.addEventListener('click', () => this.close());
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) this.close();
    });
    document.addEventListener('keydown', (e) => this._key(e), true);
  }

  get isOpen() {
    return !this.backdrop.hidden;
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  open() {
    this.render();
    this.backdrop.hidden = false;
  }

  close() {
    this.recording = null;
    this.backdrop.hidden = true;
  }

  render() {
    const s = this.store.get();
    this.body.innerHTML = `
      <div class="field">
        <div><div class="field-label">Appearance</div>
          <span class="field-hint">Light or dark throughout the window.</span></div>
        <div class="field-control">
          <select data-setting="appearance">
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </div>

      <div class="field">
        <div><div class="field-label">Tibetan font</div>
          <span class="sample">བཀྲ་ཤིས་བདེ་ལེགས།</span></div>
        <div class="field-control">
          <select data-setting="tibetanFont">
            ${TIBETAN_FONTS.map((f) => `<option>${f}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="field">
        <div><div class="field-label">English font</div>
          <span class="sample-en">Perfection of Wisdom</span></div>
        <div class="field-control">
          <select data-setting="englishFont">
            ${ENGLISH_FONTS.map((f) => `<option>${f}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="field">
        <div><div class="field-label">Text size</div>
          <span class="field-hint"><span id="sizeValue">${s.textSize}</span> px</span></div>
        <div class="field-control">
          <input type="range" min="14" max="40" step="1"
                 data-setting="textSize" value="${s.textSize}">
        </div>
      </div>

      <div class="section-title">Keyboard shortcuts</div>
      <div class="field-hint" style="padding-bottom:6px">
        Click a shortcut, then press the new key combination. Esc cancels.
      </div>
      ${Object.entries(ACTION_LABELS).map(([id, label]) => `
        <div class="field">
          <div class="field-label">${label}</div>
          <div class="field-control">
            <button class="key-btn" data-action="${id}">${
              formatBinding(s.shortcuts[id])}</button>
          </div>
        </div>`).join('')}
    `;

    this.body.querySelector('[data-setting="appearance"]').value = s.appearance;
    this.body.querySelector('[data-setting="tibetanFont"]').value = s.tibetanFont;
    this.body.querySelector('[data-setting="englishFont"]').value = s.englishFont;

    for (const el of this.body.querySelectorAll('[data-setting]')) {
      const key = el.dataset.setting;
      const evt = el.type === 'range' ? 'input' : 'change';
      el.addEventListener(evt, () => {
        const value = el.type === 'range' ? Number(el.value) : el.value;
        if (key === 'textSize') {
          this.body.querySelector('#sizeValue').textContent = value;
        }
        this.store.set({ [key]: value });
        this.onChange(key, value);
      });
    }

    for (const btn of this.body.querySelectorAll('.key-btn')) {
      btn.addEventListener('click', () => this._record(btn));
    }
  }

  _record(btn) {
    if (this.recording) this.recording.classList.remove('recording');
    this.recording = btn;
    btn.classList.add('recording');
    btn.textContent = 'Press keys…';
  }

  _key(e) {
    if (!this.isOpen) return;
    if (!this.recording) {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const btn = this.recording;
    const action = btn.dataset.action;
    if (e.key === 'Escape') {
      btn.classList.remove('recording');
      btn.textContent = formatBinding(this.store.get().shortcuts[action]);
      this.recording = null;
      return;
    }
    const binding = bindingFromEvent(e);
    if (!binding) return;                       // a bare modifier: keep waiting
    const shortcuts = { ...this.store.get().shortcuts };
    for (const [other, b] of Object.entries(shortcuts)) {
      if (other !== action && sameBinding(b, binding)) shortcuts[other] = { key: '' };
    }
    shortcuts[action] = binding;
    this.store.set({ shortcuts });
    btn.classList.remove('recording');
    this.recording = null;
    this.render();
    this.onChange('shortcuts', shortcuts);
  }
}

function sameBinding(a, b) {
  if (!a || !b || !a.key || !b.key) return false;
  return a.key.toUpperCase() === b.key.toUpperCase() && !!a.meta === !!b.meta
    && !!a.ctrl === !!b.ctrl && !!a.alt === !!b.alt && !!a.shift === !!b.shift;
}
