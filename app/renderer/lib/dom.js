// Measuring helpers.  offsetTop is relative to whichever ancestor happens to
// be positioned, which changes as soon as a decoration inside a paragraph is
// given position:relative — so every scroll calculation goes through here and
// measures against the scrolling box itself.

/** Distance from the top of a scroller's content to the top of a descendant. */
export function offsetWithin(scroller, el) {
  const a = el.getBoundingClientRect();
  const b = scroller.getBoundingClientRect();
  return a.top - b.top + scroller.scrollTop;
}

/** Scroll a descendant to sit `ratio` of the way down the scrolling box. */
export function scrollIntoPosition(scroller, el, ratio = 0.08) {
  if (!el) return;
  const top = offsetWithin(scroller, el) - scroller.clientHeight * ratio;
  scroller.scrollTop = Math.max(0, top);
}
