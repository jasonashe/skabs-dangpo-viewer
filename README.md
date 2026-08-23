# སྐབས་དང་པོའི་སྤྱི་དོན། Viewer

A desktop reader for སྐབས་དང་པོའི་སྤྱི་དོན། with per-paragraph explanations,
line-level translation lookup, and inline source-quote viewing.

See [SPEC.md](SPEC.md) for the full build specification.

## Contents

- `SPEC.md` — build specification (window layout, panels, sizing rules, settings, platform targets).
- `Skabs Viewer.dc.html` — the viewer.
- `skabs-data.js` — structured paragraph data extracted from the source PDF.
- `support.js` — supporting logic.
- `Commentaries/` — Tibetan commentary source texts, plus `commentary_names.json`.
- `སྐབས་དང་པོའི་སྤྱི་དོན།.pdf` — the source PDF.

## Platform

Primary build targets macOS 12.3.1+, structured so a Windows build needs only
native window chrome swapped in.
