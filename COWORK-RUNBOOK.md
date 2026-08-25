# Writing the 426 analyses with Claude Cowork

A step-by-step runbook for producing one full analysis document per paragraph of
སྐབས་དང་པོའི་སྤྱི་དོན།, with its quotations verified against the commentaries
they come from, in a form the viewer reads directly.

Everything here is already wired up. The prompts below are meant to be pasted
verbatim.

---

## 1 · What you are producing

For each of the **426 paragraphs**, two things:

| | |
|---|---|
| `Explanations/p12.md` | the analysis, in the six sections of `info-for-cowork/analysis_rubric.md`, with `<!--line a-b-->` anchors so the viewer's translation lookup can find each unit |
| `Explanations/quotes/_selected/p12.json` | which quotations the analysis uses and why |

The selection file is turned into the quote store by a tool. You never write
the store by hand:

```
Explanations/quotes/
  <commentary-slug>/p12.json     one file per commentary per paragraph,
                                 the same shape info-for-cowork/quotes uses
  index.json                     the flat view the viewer loads
  _selected/p12.json             what the analyst chose
```

`Explanations/p6.md` is a finished worked example. Read it before starting.

When a session's paragraphs are done, they are also delivered to Google Drive —
see §8. The repository stays the working copy the viewer reads; Drive is where
the finished analyses are read, shared and commented on.

---

## 2 · Before the first session

Run once, from the repository root:

```sh
npm install
python3 tools/explanations.py          # should say "1 of 426 paragraphs analysed"
python3 tools/quotebank.py check       # should say "3 stored quotes, 0 wrong"
```

If both pass, the pipeline is intact.

### Why the candidate quotes cannot be used as they stand

`info-for-cowork/quotes` holds **50,143 candidate quotations** produced by an
earlier automated scan. Checking every one against the file it names gives:

| | |
|---|---|
| candidates in the pool | 50,143 |
| **actually present in the source they name** | **6,482** |
| not found there at all | 39,382 |
| too short to place, or duplicates | 4,279 |

**Four out of five candidates are not in the text they claim to come from.**
The ones the scan itself marked `verified_exact` or `verified_fuzzy` all check
out; the ones marked `UNVERIFIED` are wrong about nine times in ten.

So the pool is never read directly. `tools/candidates.py` re-checks every
candidate against the real commentary file, keeps only what is genuinely there,
records the exact character offset, and hands you a brief. Anything in that
brief you may quote. Anything not in it, you must find yourself and it will be
checked again when you file it.

### What the briefs look like across the text

| verified quotes available | paragraphs |
|---|---|
| none | 50 |
| one or two | 53 |
| three or more | 323 |
| *median* | *9* |

Of the 50 with none, 38 have no candidate pool at all — the front matter
(p1–p2) and everything past PDF page 286, which the scan never covered. Those
paragraphs get the same full analysis; their quotations are found by direct
search. See §7.

---

## 3 · How to divide the work

**Five paragraphs per Cowork session.** Each analysis runs to eight or twelve
thousand words of dense material and needs the commentaries read around each
quote; a session that tries to do twenty will start summarising instead of
analysing, and that is exactly the failure to avoid.

Ask for the next batch at any time:

```sh
python3 tools/explanations.py --next 5
```

It prints the ids and, on stderr, how many remain. Work through them in order —
the analyses refer to each other, and section 1 of every one names what precedes
and follows it.

At roughly 85 sessions this is a long campaign. The progress ledger is the
filesystem itself: a paragraph is done when `Explanations/pNN.md` exists and
`tools/explanations.py` passes on it. Nothing else needs tracking, and an
interrupted session loses at most one paragraph.

---

## 4 · The session prompt

Paste this at the start of each Cowork session, with the ids from `--next 5`
substituted on the first line.

````text
Work in this repository. Write full scholarly analyses for these paragraphs of
སྐབས་དང་པོའི་སྤྱི་དོན།, one at a time, in order:

    p1 p2 p3 p4 p5            <-- replace with the ids from `--next`

Read these three files first, completely, before you start:

  1. info-for-cowork/analysis_rubric.md   — the rubric. It is the authority on
     what an analysis contains. Follow its six sections and its headings.
  2. Explanations/p6.md                   — a finished analysis. Match this
     level of depth, this use of the sources, and this format.
  3. COWORK-RUNBOOK.md §5, §6 and §8      — the per-paragraph procedure, the
     quality bar you will be checked against, and how the finished work is
     delivered to Drive.

Then, for each paragraph in turn, follow §5 of the runbook exactly. Do not
start the next paragraph until the current one passes its checks.

Two things matter more than speed:

  * Every Tibetan passage you present as a quotation must be one you have
    actually seen in the commentary file. The brief gives you verified ones.
    If you want a source that is not in the brief, search for it with
    `python3 tools/quotes.py find "…"` and quote what the search returns. If
    the search finds nothing, say the source was not located. Never write a
    Tibetan quotation from memory.

  * Before you use a quote, open its commentary around the offset the brief
    gives and read what is actually being discussed there. The scan's stated
    reason for relevance is a guess and is often wrong. A quote that turns out
    not to bear on the passage is dropped silently — do not pad the analysis
    with it, and do not argue with the scan in the text.

When all the paragraphs in this batch have passed their checks, deliver them to
Google Drive by following §8 of the runbook. Do not skip this: the repository is
the working copy, but Drive is where the finished analyses are read, and a
session that writes without delivering leaves the two out of step.

Report at the end: which paragraphs you completed, how many quotes each uses,
how many documents you uploaded, and anything you could not resolve.
````

---

## 5 · The per-paragraph procedure

Give this to Cowork as the standing procedure (it is referenced by the session
prompt above). Each numbered step is a real command.

### Step 1 — read the paragraph and its neighbours

```sh
python3 tools/candidates.py p12
```

This prints, in one document:

- the paragraph in full
- the paragraph before and after it, which section 1 of the rubric needs
- every candidate quote that is **actually present** in the commentary it
  names, strongest tier first, each with its exact location, the surrounding
  lines of the source, and the scan's stated reason

Read the whole brief. Not the first three quotes — the whole thing. A tier-4
Indian source at the bottom of the list is often the one that settles a point
the tier-1 texts pass over.

### Step 2 — check each quote in its own commentary

For any quote you are considering, open the source around it:

```sh
python3 - <<'EOF'
import sys; sys.path.insert(0, 'tools'); import quotes as Q
src = Q.sources()['ཙོང་ཁ་པ་བློ་བཟང་གྲགས་པ་_ལེགས་བཤད་གསེར་ཕྲེང་སྟོད་ཆ།.txt']
print(src.text[126677 - 1500 : 126677 + 1500])
EOF
```

You are asking one question: **does this passage actually bear on this
paragraph?** The scan matched on surface similarity and frequently latched onto
a shared phrase in an unrelated discussion. Reading a page either side settles
it in under a minute.

Keep a quote when it does one of these:

- states the position the paragraph is stating, from a named master
- states a position the paragraph is refuting, so the opponent can be named
- disagrees with the paragraph, which is what section 5 exists for
- supplies the root verse, sūtra passage or kārikā the paragraph is citing

Drop it otherwise. Five quotes that carry the argument beat twenty that
decorate it.

### Step 3 — find what the brief is missing

The pool is what an automated scan happened to find. It is not a survey. When
the paragraph cites something the brief does not cover — a root verse of the
*Ornament*, a line of Haribhadra, a passage of the gser phreng — go and find it:

```sh
python3 tools/quotes.py find "ཤེས་རབ་ཕ་རོལ་ཕྱིན་པ་ནི།"
python3 tools/quotes.py find "རྒྱལ་བའི་ཡུམ་རྣམ་པ་གསུམ" "འགྲེལ་པ་དོན་གསལ"
```

The second argument narrows to one commentary. Search **short distinctive
phrases**, not long ones — these files carry OCR damage and a long string will
miss where a six-syllable one hits.

The rubric asks every analysis to situate the passage against Maitreya's root
verses and Haribhadra's འགྲེལ་པ་དོན་གསལ།. Both are in `Commentaries/`. If
neither has anything to say about this paragraph, say so — that is a real
finding about a passage, not a gap in your work.

### Step 4 — write the selection file

`Explanations/quotes/_selected/p12.json`:

```json
{
  "paragraph": "p12",
  "quotes": [
    { "ref": "p12-q04",
      "why": "Tsongkhapa states the same division of the four, which is what the paragraph is narrowing." },
    { "file": "སེང་གེ་བཟང་པོ་_འགྲེལ་པ་དོན་གསལ།.txt",
      "text": "རྒྱལ་བའི་ཡུམ་རྣམ་པ་གསུམ་ཆར་ལས་བརྗོད་པར་བྱ་བ་ཉིད་དུ་བསྟན་པ",
      "citation": "འགྲེལ་པ་དོན་གསལ། brjod bya'i skabs",
      "why": "Haribhadra's own lemma, which the paragraph cites as འགྲེལ་པར. Found by direct search." }
  ]
}
```

- `ref` — the id from the brief (`p12-q04`). Use this whenever the quote came
  from the brief.
- `file` + `text` — for anything you found yourself. The text is re-located in
  the source when you build, so it must be a real string from that file.
- `why` — one sentence, for the reader, on what this quote is doing. It shows
  in the viewer's source panel.
- Order them as you want them numbered; ids are assigned in this order.

Then:

```sh
python3 tools/quotebank.py build p12
```

It re-verifies every entry against the source, assigns ids (`p12-q01`,
`p12-q02`, …), files each under its commentary, and refreshes the index. **A
quote it cannot find is refused with a message** — fix it, do not work around
it.

### Step 5 — get the anchor offsets

```sh
python3 tools/offsets.py p12
```

This prints the paragraph split into clauses with their exact character offsets.
Section 2 of the analysis translates the paragraph clause by clause, and each
unit carries the anchor for the span it translates:

```markdown
<!--line 224-415-->
> **བརྒྱད་སྟོང་དོན་བསྡུས་ཀྱིས་ཐོགས་མེད་ཀྱི་རྗེས་སུ་འབྲངས་ནས་…**
>
> the Summary of the Eight Thousand expounds the intent … following Asaṅga
```

Rules the checker enforces:

- anchors appear **only in section 2** — an anchor elsewhere competes with
  section 2's for the lookup and the reader lands in the wrong place
- they run forward, never overlap, and between them **cover the paragraph from
  0 to its last character** with no gaps
- a gap means a stretch of text the reader selects and gets nothing for

Group clauses into meaningful units — a whole quoted verse is one unit, not
eight. Ten to twenty units for a thousand-character paragraph is about right.

### Step 6 — write the analysis

`Explanations/p12.md`, following `info-for-cowork/analysis_rubric.md`. Use the
rubric's six section headings, in order, numbered as in `Explanations/p6.md`:

```markdown
# A title naming what this paragraph does

## 1 · Passage & Context
## 2 · Translation & Breakdown
## 3 · Structural Context (Dkar Chag)
## 4 · Philosophical Exposition & Commentary
## 5 · Bones of Contention 🦴
## 6 · Key Terminology & Technical Concepts
```

Link a quotation like this, and the words become clickable in the viewer:

```markdown
[རྟེན་དང་དབང་དུ་བྱ་བ་དང་། ། ལས་ནི་སྒོམ་པ་དང་བཅས་པ།](quote:p12-q03)
```

Link the Tibetan when you are showing the quotation itself; link a few English
words when you are describing it. Both work.

### Step 7 — check

```sh
python3 tools/explanations.py p12
```

It fails if a section heading is missing or out of order, if the anchors leave
a gap or overlap, if an anchor runs past the end of the paragraph, if a
`quote:` link does not resolve, or if the document is too short to be a real
analysis. Fix and re-run until it passes, then move to the next paragraph.

Every few paragraphs:

```sh
python3 tools/quotebank.py check      # every stored quote still at its offset
python3 tools/explanations.py         # everything, and rebuild the index
```

When the batch is finished, deliver it — §8.

---

## 6 · The quality bar

The checker catches shape, not substance. These are the things that make an
analysis worth having, and they are what to review against.

**Read the passage before explaining it.** The brief gives you the paragraph
before and after. Section 1 must say what they actually contain, not "the
preceding discussion."

**Say where it sits.** Section 3 wants four locations: the root verses,
Haribhadra, the yig cha's own outline, and the argumentative role. When a
passage has no counterpart in the Indian commentaries — common in the
preliminaries, which are a Tibetan addition — say that, and say what it implies.

**Name who holds what.** Never "some commentators hold." Name the master, name
the text, and say how far that text stands from this curriculum. "Gyaltsab Je,
within the same Gelug transmission" and "an Indian commentary at some remove
from this yigcha" are different kinds of support.

**Use the tiers as weight, not as truth.** Tier 1 is this text and Chökyi
Gyaltsen's other works; tier 5 is furthest away. Lead with the strongest tier
that says the thing. But where texts genuinely conflict, **report the conflict**
— never resolve it silently by preferring the higher tier. That conflict is
what section 5 is for.

**Say when the evidence is thin.** If the whole case rests on tier 4 and 5
material and the yigcha tradition is silent, write that down. `Explanations/p6.md`
does this in its last paragraph of section 4. It is a finding about the passage.

**Say when you are unsure.** A passage whose place in the outline is genuinely
unclear should be marked unclear. An analysis that reads uniformly confident is
less useful than one that marks its own edges.

**Do not fabricate.** No Tibetan quotation from memory, ever. Not a root verse
you are sure of, not a line of Haribhadra you have read a hundred times. Search
for it; if the search fails, say it was not located.

### Signs the work has gone lazy

- section 5 says the passage is uncontroversial, for a paragraph that opens
  ཁ་ཅིག … ཞེས་ཟེར་ན
- section 6 defines ཕྱིར or ཐལ — the rubric says skip vocabulary a Sera Jey
  monk knows
- the analysis quotes only the first two quotes in the brief
- section 2 has three anchors for a two-thousand-character paragraph
- no quotation was found by direct search in a whole batch
- two analyses in a row have the same shape of argument in section 4

---

## 7 · Paragraphs with no candidate pool

50 paragraphs have no verified quote in the pool; 38 of those have no pool at
all. `python3 tools/candidates.py p2` tells you so plainly.

They are:

- **p1–p2** — the title and the salutation verses, PDF pages 36–38. The
  lineage verses of p2 name some thirty masters; several have works in
  `Commentaries/`, and naming which ones is exactly the interesting content.
- **everything from PDF page 287 to the end** — the སྐྱབས་འགྲོ material and the
  printing colophon.
- a scattering in between where the scan returned nothing usable.

Treat them identically, except that step 1 gives you no quotes and step 3 does
all the work. Read the paragraph, identify what it cites or alludes to, and
search for each thing:

```sh
python3 tools/quotes.py find "བསྟན་བཅོས་མངོན་པར་རྟོགས་པའི་རྒྱན"
```

If a paragraph genuinely cites nothing — the colophon verses, for instance —
write the analysis without quotations and say in section 4 that the passage is
not one the commentarial literature engages. That is true and worth knowing. An
analysis with no `quote:` links passes the checker.

---

## 8 · Delivering to Google Drive

Everything finished goes into the **Explanations** folder in the owner's Drive
(`1NzJSxpQZf0RptceQSZIBR1BSqfWzKaaW`). Do this **at the end of every session**,
not once at the very end — Drive then always shows the current state, and an
interrupted campaign has still delivered everything written so far.

Only the files in `Explanations/drive-state.json` are yours. The folder is the
owner's and may hold anything else besides; never move, rename or trash a file
the ledger does not name, even one that looks like a stray draft of the work.

### What the folder looks like

```
Explanations/                                   (Google Drive)
  00 · Read me                     what this is, how the analyses are built,
                                   what the tiers mean
  00 · Contents                    every paragraph, its page and its title,
                                   in order, marking what is still to come
  01 · མཆོད་བརྗོད། · pages 38–40/
  02 · ཤིང་རྟ་སྲོལ་འབྱེད། · pages 41–61/
        p006 · page 41 · Which traditions open a way? …
        p007 · page 42 · Who composed the Gnod 'joms?
  …23 folders, following the text's own dkar chag divisions…
  Sources cited/
        ཙོང་ཁ་པ་ · ལེགས་བཤད་གསེར་ཕྲེང་སྟོད་ཆ།      every passage cited from
        སེང་གེ་བཟང་པོ་ · འགྲེལ་པ་དོན་གསལ།          it, across all paragraphs
  Source files/
        Analyses/p6.md             the exact Markdown, unconverted
        Quotations/p6.json         the quotation records
```

The analyses are uploaded as **Google Docs** so they can be read on a phone and
commented on. The viewer's machinery is rendered out on the way: the
`<!--line-->` anchors disappear, and each `quote:` link becomes a numbered
reference with the quotation, its source, its tier and its exact location
gathered under **Sources cited** at the foot of the document. The paragraph
itself is quoted under the title, so a document can be read without the PDF to
hand.

`Source files/` holds the originals unconverted, so nothing is lost in
translation and the corpus can be re-imported.

### The upload

Everything is prepared by a tool. Run it, then walk the manifest:

```sh
python3 tools/drive_export.py
```

It writes `dist/drive/` and `dist/drive/_manifest.json`, which tells you exactly
what to do:

```json
{
  "rootId": "1NzJSxpQZf0RptceQSZIBR1BSqfWzKaaW",
  "foldersToCreate": ["02 · ཤིང་རྟ་སྲོལ་འབྱེད། · pages 41–61", "Sources cited"],
  "files": [
    { "folder": "02 · ཤིང་རྟ་སྲོལ་འབྱེད། · pages 41–61",
      "title":  "p006 · page 41 · Which traditions open a way? …",
      "file":   "02 · …/p006 · ….md",
      "mime":   "text/markdown",
      "convert": true,
      "parentId": "…",
      "action": "create" }
  ]
}
```

Only what is new or changed appears in `files`. Anything already in Drive and
unchanged is left alone, so re-running is safe and cheap.

### The delivery prompt

Paste this after the analyses in a session are written and checked.

````text
Deliver this session's work to Google Drive.

1. Run `python3 tools/drive_export.py` and read `dist/drive/_manifest.json`.

2. For each path in `foldersToCreate`, create the folder with
   `create_file`, mime `application/vnd.google-apps.folder`. A nested path
   like `Source files/Analyses` means creating `Source files` first and then
   `Analyses` inside it. Take the id each call returns.

3. Record every folder id in `Explanations/drive-state.json` under `folders`,
   keyed by the same path string the manifest used. Save the file before
   uploading anything — if the session is interrupted, that file is what stops
   the next one creating duplicates.

4. Re-run `python3 tools/drive_export.py` so the manifest picks up the new
   folder ids as `parentId`.

5. For each row in `files`:
   - read the local file at `dist/drive/<file>`
   - `action: "create"` → `create_file` with that `parentId`, the row's
     `title`, `contentMimeType` from `mime`, and the text in `textContent`.
     Set `disableConversionToGoogleType: true` when `convert` is false — that
     is what keeps `Source files/` as plain .md and .json rather than turning
     them into Docs.
   - `action: "update"` → **`update_file` cannot do this.** That tool changes
     a file's title and parent only; it has no way to replace content. Replace
     the document instead: `create_file` exactly as for a new row, record the
     new id (next bullet), and only then `trash_file` the old id the ledger
     was holding. In that order the ledger is never pointing at a file that no
     longer exists.
   - Record the returned file id in `Explanations/drive-state.json` under
     `files`, keyed by the row's `key`, as `{"id": "…", "hash": "<the row's
     hash>"}`. On a replacement this overwrites the old id — which is why it
     must be written before the old file is trashed.

6. Save `Explanations/drive-state.json` and commit it. It is the delivery
   ledger; without it the next session cannot tell what is already there.

Report: how many folders you created, how many documents you uploaded or
updated, and the Drive link to one of this session's analyses so it can be
spot-checked.
````

### Notes

- **Drive rate-limits.** `create_file` returns *"Resource has been exhausted
  (e.g. check quota)"* if you upload too quickly — it happened within a dozen
  calls when this was first tried. Treat it as a pause, not a failure: wait
  half a minute and retry the same row. Do **not** skip the row and move on,
  and do not record it in the ledger until a call actually returns an id. A
  full delivery is well over a thousand files, so expect to meet this and
  pace accordingly — roughly one upload every few seconds is comfortable.
- **Save the state file as you go**, not at the end. A session that dies
  halfway through an upload leaves Drive and the ledger consistent if each id
  is recorded as it comes back.
- **Never upload a file twice.** The ledger is keyed by folder and title; if a
  row is missing from the manifest it is because Drive already has it,
  unchanged.
- **A replacement interrupted halfway leaves a twin.** If a session dies
  between creating a replacement and trashing the document it replaces, Drive
  shows two documents with the same title. The ledger settles which is which:
  keep the id it names, trash the other.
- **The create call reports `fileSize: 1`** for a converted document, because
  it returns before the Markdown import finishes. That is not an empty upload.
  Check it with `get_file_metadata` a moment later, or read it back, rather
  than re-uploading.
- **A title is not a filename.** The manifest's `title` is what Drive shows;
  the `file` is where to read the bytes. They differ where a title contains a
  character a filesystem will not take.
- **Characters outside the basic plane are stripped** from the Drive copies —
  Drive's Markdown import mangles them, and the rubric's 🦴 came back as
  mojibake. The heading still reads *Bones of Contention*, and the repository
  copy is untouched.

---

## 9 · When something goes wrong

**`quotebank.py build` refuses a quote.** The text is not in that file. Either
you mistyped it, or it is from a different commentary, or the scan invented it.
Search for it: `python3 tools/quotes.py find "<the first six syllables>"`. If
nothing comes back, drop it.

**`explanations.py` reports an anchor gap.** Run `python3 tools/offsets.py p12`
again and check your anchors tile the whole range. The commonest cause is a
quoted verse where the clause table shows the shads as separate rows — absorb
them into the surrounding unit.

**A quote is right but the offset looks odd.** `match: opening-run` in the brief
means the witness agrees for the first stretch and then diverges — a real
variant reading. Quote it and note the variance, as `p6.md` does for Dignāga's
`དང་བཅས་དང་` against the yig cha's `དང་བཅས་པ།`.

**Drive says the resource is exhausted.** That is the rate limit, not a
permissions problem. Wait, then retry the same upload. Check
`Explanations/drive-state.json` before retrying — if the id was already
recorded, the upload went through and retrying would duplicate it.

**The viewer shows nothing for a paragraph.** `python3 tools/explanations.py`
rebuilds `Explanations/index.json`, which is what the viewer lists. Run it after
any batch.

**Seeing it in the reader.** `npm start`, right-click a paragraph, *Look at
explanation*. Select a phrase and press ⌘T to check the anchor lands where it
should. Click a quotation to check the source panel opens at the right place.

---

## 10 · Command summary

```sh
python3 tools/explanations.py --next 5        # what to do next
python3 tools/candidates.py p12               # the evidence brief
python3 tools/offsets.py p12                  # anchor offsets
python3 tools/quotes.py find "…" ["file"]     # search the commentaries
python3 tools/quotebank.py build p12          # file the selection, re-verify
python3 tools/quotebank.py check              # audit the whole store
python3 tools/explanations.py p12             # check one analysis
python3 tools/explanations.py                 # check all, rebuild the index
python3 tools/drive_export.py                 # prepare the Drive delivery
npm test                                      # the viewer still works
```
