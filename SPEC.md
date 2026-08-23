# སྐབས་དང་པོའི་སྤྱི་དོན། Viewer — build spec

A desktop reader for སྐབས་དང་པོའི་སྤྱི་དོན། with per-paragraph explanations, line-level
translation lookup, and inline source-quote viewing. Target macOS 12.3.1+, written so
it ports to Windows with only window-chrome changes.

## 1. Source text

- The text is supplied as a PDF. Extract its contents and store them as structured
  paragraphs; each paragraph keeps the **page number it appears on in the PDF**, and the
  viewer's page numbering must match the PDF exactly.
- Each paragraph has a stable id used to link it to its explanation file.

## 2. Main window

- Looks and behaves like Apple's Preview: title bar with document name and page count,
  a single toolbar row, a thin status bar at the bottom.
- Opening the app goes **straight to the text** — no start screen, no library.
- One continuous single-column page of text that scrolls vertically.
- Scroll position is persisted; relaunching resumes exactly where the last session ended.
- Text selection and copy: copying a selection that spans line breaks must **not** insert
  a space at the break. Copied strings match the source characters exactly, so pasting
  and searching both give exact matches.
- Search: exact-match search over the source text; matches are marked in the text and the
  view jumps to the first hit.
- Highlighting: select text, choose one of three highlight colours, apply. Highlights are
  saved with the document and restore on reopen.

## 3. Table of contents (left)

- Sidebar listing the text's table of contents with page numbers.
- Auto-scrolls to keep the current section in view as the reader scrolls the text.
- Clicking an entry jumps the text to that paragraph.
- Hiding it **collapses it into a vertical expandable bar** (not removed) so it can be
  reopened.

## 4. Explanation panel (right)

- Right-clicking a paragraph shows a context menu with "Look at explanation".
- The explanation opens in a panel on the **right** side of the window.
- When it opens, the table-of-contents sidebar is hidden and the paragraph in question is
  **vertically centered** in the text panel, leaving room for the explanation.
- Explanation files are Markdown; the panel renders Markdown formatting.
- One explanation file per paragraph, linked by paragraph id.
- The panel has an **X button** to close it.

## 5. Translation lookup

- Select text in the root text, then right-click → "Find translation of selection", or
  press ⌘T.
- Explanation files contain a line-by-line explanation of the paragraph. The panel opens
  already **scrolled to the line covering the selection**, with that line highlighted in
  the explanation.

## 6. Quote panel (far right)

- Explanations contain quotations. Each quotation has an accompanying `.json` file
  recording its source and its **location in that source file**.
- **A plain click** on a quotation opens a further panel to the right of the explanation
  panel: a viewer of the quoted text, scrolled to the quote's location with the quote
  highlighted, so the reader can see what precedes and follows it.
- Opening a quote does **not** hide the root-text panel. All three panels can be open
  together.
- The quote panel has an **X button** to close it.

## 7. Panel sizing rules

- Explanation and quote panels: fixed comfortable width while the root text is visible.
- When the root-text panel is collapsed, the explanation and quote panels **grow to fill
  all the freed space**, sharing it evenly.
- No panel may be crushed below a readable minimum (~340px). If the window is too narrow
  for the open set of panels, collapse the table of contents first, then the root-text
  panel — each into its labelled expandable vertical bar.

## 8. Collapse vs. close

- Explanation panel, quote panel → **close** (X button).
- Root-text panel, table of contents → **collapse** into a labelled vertical bar that can
  be clicked to expand again.

## 9. Settings

- Light / dark appearance.
- Tibetan font choice; English font choice.
- Text size.
- Re-bindable keyboard shortcuts (open explanation, find translation, highlight, toggle
  dark mode, search, settings) — click a shortcut, press the new key combination.

## 10. Platform

- Primary build: macOS 12.3.1 and later.
- Architecture keeps all layout, text handling, and panel logic platform-neutral so a
  Windows build needs only native window chrome swapped in.
