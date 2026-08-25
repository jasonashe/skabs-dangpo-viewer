# སྐབས་དང་པོའི་སྤྱི་དོན། Viewer

A desktop reader for རྗེ་བཙུན་ཆོས་ཀྱི་རྒྱལ་མཚན།'s སྐབས་དང་པོའི་སྤྱི་དོན།, with
per-paragraph explanations, line-level translation lookup and inline
source-quote viewing. Built to [SPEC.md](SPEC.md).

Primary target macOS 12.3.1+; all layout, text handling and panel logic is
platform-neutral, so a Windows build swaps in native window chrome and nothing
else.

```sh
npm install
npm start          # run the app
npm test           # 47 headless checks over the whole reader
```

## What the window does

| | |
|---|---|
| **Text** | One continuous column, page numbers shown in the margin exactly as they fall in the PDF. Scroll position is remembered and restored. |
| **Contents** | The text's own dkar chag, 687 entries with PDF page numbers. Follows the reader down the text; **Hide** folds it into a labelled vertical bar. |
| **Search** | Exact-match over the source characters. Matches are marked, the view jumps to the first, ‹ › step through. |
| **Highlight** | Select, pick one of three colours, **Apply**. Saved with the document. |
| **Explanation** | Right-click a paragraph → *Look at explanation*. Opens on the right, folds the contents sidebar away and centres the paragraph. |
| **Translation** | Select, then ⌘T or right-click → *Find translation of selection*. The explanation opens already scrolled to the line covering the selection, with that line marked. |
| **Source** | Click a quotation in an explanation. The quoted text opens in a third panel, scrolled to the exact place in the source file with the quotation picked out, so what precedes and follows it is visible. |
| **Settings** | Light/dark, Tibetan and English face, text size, and all six shortcuts re-bindable by clicking and pressing the new combination. |

Panels follow §7 of the spec: the explanation and source panels keep a
comfortable fixed width while the text is visible and share the freed space
evenly when it is collapsed; nothing is squeezed below 340px, and when the
window is too narrow the contents sidebar folds first, then the text — each
into a labelled bar that reopens on a click.

## Layout

```
app/
  main.js              Electron main process — window, menu, IPC, state file
  preload.js           the one seam between renderer and host
  platform/            native window chrome, and nothing else
    darwin.js          macOS: hidden-inset title bar, traffic-light inset
    win32.js           Windows: title-bar overlay, caption buttons at the right
    linux.js           development only
  data/text.json       the extracted document (built, committed)
  renderer/            platform-neutral: the whole reader lives here
    index.html  styles.css  app.js
    bridge.js          host bridge; falls back to fetch + localStorage
    fonts/             Noto Serif Tibetan, bundled (SIL OFL 1.1)
    lib/               text · toc · panels · explanation · quote ·
                       settings · shortcuts · markdown · contextmenu · store
Explanations/          one .md per paragraph, named by paragraph id
  quotes/              per-commentary records, plus the index the viewer loads
Commentaries/          47 Tibetan source texts + commentary_names.json
info-for-cowork/       the analysis rubric, the paragraph division, and the
                       raw candidate-quote pool the analyses are built from
tools/                 extraction, re-segmentation, quote verification, checks
```

`app/renderer` never asks which platform it is on. `app/platform/*.js` is the
only code that does, and each file answers the same four questions: window
options, chrome insets, whether closing the last window quits, and whether
there is an application menu role.

## The text

`app/data/text.json` is built from `སྐབས་དང་པོའི་སྤྱི་དོན།.pdf`:

```sh
npm run build:data     # extract → structure → repair → re-segment
```

- **426 paragraphs**, 382,000 characters. The printed edition's indentation
  leaves a few enormous blocks — one runs to 13,000 characters — so the
  paragraphs are re-cut at the boundaries `info-for-cowork/paragraphs.tsv` uses,
  which is the division the analysis material is keyed to. `tools/resegment.py`
  does that and reports what it changed; runs of short display lines on the
  title page and in the printing dedication are merged back into single
  paragraphs. One paragraph is one analysis is one candidate pool, with no
  mapping layer anywhere.
- **Page numbers are PDF page numbers.** The treatise runs from PDF page 36
  (folio 1) to 323; pages 2–35 are the dkar chag, which the reader presents as
  its table of contents. Every paragraph records the PDF page it starts on and
  the offset of every page break inside it, so the margin numbers and the status
  bar match Preview exactly. The stamped folio is carried alongside.
- **853 editorial superscripts** from the dpe bsdur ma are lifted out of the
  reading text and drawn as non-selectable marks, so copy and search see source
  characters only. Clicking one opens the edition's own ལུང་མཆན note — 849 of
  them are parsed from PDF pages 324–351 and 844 of the 853 marks resolve to
  one.
- **Copy is served from the model, not the DOM.** A selection spanning wrapped
  lines, highlights, page marks and superscripts copies as the exact source
  substring. `npm test` asserts this against a 400+ character paragraph.

Extraction defects were found by aligning against the same work's e-text in
`Commentaries/`: two dropped inter-syllable tsheg (repaired), spaces lost after
a shad (restored by rule), and vowel signs emitted after a tsheg or shad
(reordered). The reading text is otherwise the printed edition character for
character, including its own variant readings.

## Explanations

One Markdown file per paragraph, named by paragraph id — `Explanations/p6.md`
explains `p6` — written to the rubric in `info-for-cowork/analysis_rubric.md`.
Two conventions on top of plain Markdown, both invisible to other Markdown
tools:

```markdown
<!--line 415-900-->            the blocks below explain characters 415–900
                               of the paragraph — this is what ⌘T scrolls to

[quoted words](quote:p6-q03)   a quotation; a plain click opens the source panel
```

Anchor offsets are measured, not guessed:

```sh
python3 tools/offsets.py p6              # clause table with offsets
python3 tools/explanations.py            # check anchors + links, rebuild index
```

Quotations are stored per commentary, mirroring how the analysis material in
`info-for-cowork/quotes` is organised, plus a packed index the viewer loads:

```
Explanations/quotes/
  <commentary-slug>/p6.json      the quotes this paragraph takes from that
                                 commentary — text, offset, line, and why
  index.json                     the flat view, one lookup per click
  _selected/p6.json              what the analyst chose; the source of truth
```

The store is generated, never hand-written. An analyst records a selection —
either a reference into the verified brief or a passage found by direct
search — and the tool re-locates every one in the actual commentary file,
assigns ids, and files it:

```sh
python3 tools/quotes.py find "རྟེན་དང་དབང་དུ་བྱ་བ་དང་།"   # where is this?
python3 tools/quotebank.py build p6                       # file the selection
python3 tools/quotebank.py check                          # audit the store
```

**A quote that cannot be found in the source it names is refused.** That check
is not ceremonial: of the 50,143 candidate quotations in `info-for-cowork`,
only 6,482 are actually present in the file they claim to come from.
`tools/candidates.py` does the filtering and hands the analyst a brief of what
survived — median nine verified quotes per paragraph, with exact offsets and
the surrounding lines of the source.

### Coverage

**1 of 426 paragraphs has an analysis** — `p6`, a worked example written to the
rubric and used as the reference for the rest.

[COWORK-RUNBOOK.md](COWORK-RUNBOOK.md) is the step-by-step procedure for
producing the other 425 with Claude Cowork: how the work divides into sessions,
the prompts to paste, the per-paragraph command sequence, the quality bar, and
what to do for the 50 paragraphs whose candidate pool is empty.

Paragraphs with an analysis are marked with a dot in the margin; the rest open
the panel with a note naming the file to add. Nothing in the app assumes a
paragraph has one.

## Checks

```sh
npm test                      # 47 checks: panel sizing rules, markdown,
                              # and the whole reader driven in Chromium
npm run check:explanations    # sections present and in order, anchors tile the
                              # paragraph without gaps or overlaps, quote links
                              # resolve; rebuilds Explanations/index.json
npm run check:quotes          # every stored quote still at the offset it claims
npm run smoke:electron        # boot the real app; assert layout metrics
```

`npm test` covers the spec's testable claims directly: PDF paging, exact-match
search, copy fidelity across a wrapped paragraph, highlights surviving a
reopen, resuming the scroll position, the explanation centring its paragraph
and folding the sidebar, the translation lookup landing on the covering line,
the quote panel opening scrolled and marked with the text still visible, the
collapse bars, and the panel-sizing rules of §7 as a pure function.

`npm run smoke:electron` boots the real Electron app and asserts that the
layout metrics match the browser render exactly — that is what proves the
bundled face is shaping the text. In a headless container `capturePage()` goes
through software compositing and its screenshot is degraded; the metrics are
the check, not the picture.

## Building

```sh
npm run dist:mac      # requires electron-builder and a Mac
npm run dist:win
```

`package.json` sets `minimumSystemVersion` to 12.3.1 for the mac target.

## Contents of this repository

- `SPEC.md` — the build specification.
- `app/` — the reader.
- `Explanations/` — the analyses and the quotation store.
- `COWORK-RUNBOOK.md` — how to produce the remaining analyses with Claude Cowork.
- `info-for-cowork/` — the analysis rubric, the paragraph division the analyses
  are keyed to, and the raw candidate-quote pool.
- `Commentaries/` — 47 Tibetan source texts, plus `commentary_names.json`
  giving each one's author, title and place in the tradition.
- `tools/` — extraction and checking scripts.
- `སྐབས་དང་པོའི་སྤྱི་དོན།.pdf` — the source PDF.
- `Skabs Viewer.dc.html`, `skabs-data.js`, `support.js` — the original design
  canvas prototype the window was designed in. Superseded by `app/`; kept for
  reference. `skabs-data.js` holds fourteen sample paragraphs from that
  prototype and is **not** the document the reader uses.

## Licence

The reader is MIT. Noto Serif Tibetan is under the SIL Open Font License 1.1
(`app/renderer/fonts/OFL-NotoSerifTibetan.txt`). The Tibetan texts are the
Sera Jey Monastic University dpe bsdur ma edition, provided for free
distribution.
