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
  quotes/              one .json per quotation: source file and location
Commentaries/          47 Tibetan source texts + commentary_names.json
tools/                 extraction, quote location, checks
```

`app/renderer` never asks which platform it is on. `app/platform/*.js` is the
only code that does, and each file answers the same four questions: window
options, chrome insets, whether closing the last window quits, and whether
there is an application menu role.

## The text

`app/data/text.json` is built from `སྐབས་དང་པོའི་སྤྱི་དོན།.pdf`:

```sh
npm run build:data     # extract → structure → repair
```

- **333 paragraphs**, 382,000 characters, segmented by the printed edition's own
  indentation.
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

One Markdown file per paragraph, named by paragraph id — `Explanations/p9.md`
explains `p9`. Two conventions on top of plain Markdown, both invisible to other
Markdown tools:

```markdown
<!--line 415-900-->            the blocks below explain characters 415–900
                               of the paragraph — this is what ⌘T scrolls to

[quoted words](quote:q0901)    a quotation; a plain click opens the source panel
```

Anchor offsets are measured, not guessed:

```sh
python3 tools/offsets.py p9              # clause table with offsets
python3 tools/explanations.py            # check anchors + links, rebuild index
```

A quotation record names its source file and where in it the quotation sits:

```json
{
  "id": "q0901",
  "text": "རྟེན་དང་དབང་དུ་བྱ་བ་དང་། ། ལས་ནི་སྒོམ་པ་དང་བཅས་དང་། …",
  "source": { "file": "ཕྱོགས་ཀྱི་གླང་པོ་_ཤེར་ཕྱིན་བསྡུས་པའི་ཚིག་ལེའུར་བྱས་པ།.txt",
              "title": "ཤེར་ཕྱིན་བསྡུས་པའི་ཚིག་ལེའུར་བྱས་པ།",
              "author": "ཕྱོགས་ཀྱི་གླང་པོ་" },
  "location": { "offset": 317, "length": 109, "line": 3, "match": "opening-run" }
}
```

Records are generated by searching the actual source, so a shipped record is
verified against the text it claims to come from:

```sh
python3 tools/quotes.py find "རྟེན་དང་དབང་དུ་བྱ་བ་དང་།"      # where is this?
python3 tools/quotes.py build Explanations/quotes/_manifest.json
```

`match` is `exact` when the source carries the quotation character for
character once spacing and shad style are folded away, and `opening-run` when
the witness differs later in the line — a real variant, and one worth seeing
in the panel. The reader also re-finds the quotation inside the fetched window
if the recorded offset has drifted.

### Coverage

**8 of 333 paragraphs have explanations** — `p5`–`p12`, PDF pages 36–43: the
salutation and lineage, the four preliminaries, the enumeration of the mother
sūtras and its two refutations, the author's own position, the trail-blazing
traditions, the authorship of the *Gnod 'joms*, and the three gates and eleven
rounds. Eight quotation records back them, located in Āryavimuktisena,
Haribhadra, Panchen Sonam Drakpa, Dignāga, Vasubandhu, Tsongkhapa, Jamyang
Zhepa and Maitreya's root text.

Paragraphs marked with a dot in the margin have an explanation; the rest open
the panel with a note saying which file to add. Writing the remaining 325 is
scholarly work, not build work — the format, the tooling and the checks are
here for it, and nothing in the app assumes a paragraph has a file.

## Checks

```sh
npm test                      # 47 checks: panel sizing rules, markdown,
                              # and the whole reader driven in Chromium
npm run check:explanations    # anchors in range and forward, quote links resolve
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
- `Explanations/` — explanation files and quotation records.
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
