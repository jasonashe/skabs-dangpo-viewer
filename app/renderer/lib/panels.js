// Panel sizing.  computeLayout is pure so the rules in §7 of the spec can be
// checked without a window: explanation and quote keep a comfortable fixed
// width while the root text is visible, share the freed space evenly when it
// is collapsed, and nothing is ever squeezed below a readable minimum — under
// pressure the table of contents folds away first, then the root text.

export const MIN_READABLE = 340;
export const TOC_WIDTH = 268;
export const BAR_WIDTH = 30;
export const SIDE_WIDTH = 430;

/**
 * @param intent  { tocOpen, textOpen, explanationOpen, quoteOpen }  what the
 *                reader asked for
 * @param avail   width available to the whole panel row, in px
 * @returns       { toc, text, explanation, quote } px widths (0 = not present)
 *                plus the effective open/collapsed flags
 */
export function computeLayout(intent, avail) {
  let tocOpen = !!intent.tocOpen;
  let textOpen = !!intent.textOpen;
  const explanationOpen = !!intent.explanationOpen;
  const quoteOpen = !!intent.quoteOpen;
  const sides = (explanationOpen ? 1 : 0) + (quoteOpen ? 1 : 0);

  const floor = () => (tocOpen ? TOC_WIDTH : BAR_WIDTH)
    + (textOpen ? MIN_READABLE : BAR_WIDTH)
    + sides * MIN_READABLE;

  // collapse the table of contents first, then the root text
  if (floor() > avail && tocOpen) tocOpen = false;
  if (floor() > avail && textOpen && sides > 0) textOpen = false;

  const tocW = tocOpen ? TOC_WIDTH : BAR_WIDTH;
  let rest = avail - tocW;
  let textW = textOpen ? 0 : BAR_WIDTH;
  rest -= textOpen ? 0 : BAR_WIDTH;

  let sideW = 0;
  if (sides > 0) {
    if (textOpen) {
      // fixed comfortable width, but never at the cost of the reading column
      const room = rest - MIN_READABLE;
      sideW = Math.min(SIDE_WIDTH, Math.max(MIN_READABLE, room / sides));
      if (sideW * sides > rest - MIN_READABLE) {
        sideW = Math.max(MIN_READABLE, (rest - MIN_READABLE) / sides);
      }
    } else {
      // root text collapsed: grow to fill everything freed, evenly
      sideW = Math.max(MIN_READABLE, rest / sides);
    }
  }
  if (textOpen) textW = Math.max(MIN_READABLE, rest - sideW * sides);

  return {
    toc: tocW,
    text: textW,
    explanation: explanationOpen ? sideW : 0,
    quote: quoteOpen ? sideW : 0,
    tocOpen,
    textOpen,
    explanationOpen,
    quoteOpen,
    /** true when the reader asked for something the window could not hold */
    forcedTocCollapse: !!intent.tocOpen && !tocOpen,
    forcedTextCollapse: !!intent.textOpen && !textOpen,
  };
}

export class PanelHost {
  constructor(elements) {
    this.el = elements;             // { row, toc, tocBar, text, textBar, explanation, quote }
    this.intent = { tocOpen: true, textOpen: true, explanationOpen: false,
                    quoteOpen: false };
    this.last = null;
    this.onChange = () => {};
    window.addEventListener('resize', () => this.apply());
  }

  setIntent(patch) {
    this.intent = { ...this.intent, ...patch };
    return this.apply();
  }

  apply() {
    const avail = this.el.row.clientWidth || window.innerWidth;
    const l = computeLayout(this.intent, avail);
    const { toc, tocBar, text, textBar, explanation, quote } = this.el;

    show(toc, l.tocOpen, l.toc);
    show(tocBar, !l.tocOpen, BAR_WIDTH);
    show(text, l.textOpen, l.text);
    show(textBar, !l.textOpen, BAR_WIDTH);
    show(explanation, l.explanationOpen, l.explanation);
    show(quote, l.quoteOpen, l.quote);

    this.last = l;
    this.onChange(l);
    return l;
  }
}

function show(el, visible, width) {
  if (!el) return;
  el.hidden = !visible;
  if (visible) {
    el.style.width = `${Math.round(width)}px`;
    el.style.flex = `0 0 ${Math.round(width)}px`;
  }
}
