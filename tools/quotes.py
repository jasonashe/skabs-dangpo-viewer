# -*- coding: utf-8 -*-
"""Locate a quotation inside the commentary texts and record where it sits.

The reader's quote panel needs a file plus an offset; this finds that offset by
searching the actual source, so every record shipped in Explanations/quotes is
verified against the text it claims to come from rather than asserted.

  python3 tools/quotes.py find "ཤེས་རབ་ཕ་རོལ་ཕྱིན་པ་ནི།"
  python3 tools/quotes.py build Explanations/quotes/_manifest.json
"""
import json
import os
import sys

SOURCES = 'Commentaries'
NAMES = json.load(open(os.path.join(SOURCES, 'commentary_names.json'),
                       encoding='utf-8'))


def search_form(text):
    """Fold away the spacing and shad conventions that differ edition to
    edition, keeping a map back to the original offsets."""
    out, index = [], []
    for i, ch in enumerate(text):
        if ch.isspace():
            continue
        if ch in '༑༎༏༐':
            ch = '།'
        out.append(ch)
        index.append(i)
    return ''.join(out), index


class Source:
    def __init__(self, filename):
        self.filename = filename
        with open(os.path.join(SOURCES, filename), encoding='utf-8') as fh:
            self.text = fh.read()
        self.folded, self.index = search_form(self.text)
        self.meta = NAMES.get(filename, {})

    def find(self, needle, exact_only=False):
        """Return (offset, length, exact) in the original text, or None.

        An exact hit means the source carries the quotation character for
        character once spacing and shad style are folded away.  Otherwise the
        opening run is matched and the reading recorded is the source's own,
        which is what the reader wants to see anyway.
        """
        folded, _ = search_form(needle)
        if not folded:
            return None
        exact = True
        at = self.folded.find(folded)
        if at < 0:
            if exact_only:
                return None
            exact = False
            for cut in (72, 56, 40, 28, 24):
                if cut >= len(folded):
                    continue                 # too short to anchor safely
                at = self.folded.find(folded[:cut])
                if at >= 0:
                    break
        if at < 0:
            return None
        start = self.index[at]
        last = min(at + len(folded), len(self.index)) - 1
        end = self.index[last] + 1
        # run on to the next syllable or clause boundary so the highlighted
        # span in the quote panel never stops mid-word
        while end < len(self.text) and self.text[end] not in ' \n་།༑༎':
            end += 1
        return start, end - start, exact

    def line_of(self, offset):
        return self.text.count('\n', 0, offset) + 1


_cache = {}


def sources():
    if not _cache:
        for name in sorted(os.listdir(SOURCES)):
            if name.endswith('.txt'):
                _cache[name] = Source(name)
    return _cache


def find(needle, only=None, exact_only=False):
    hits = []
    for name, src in sources().items():
        if only and only not in name:
            continue
        got = src.find(needle, exact_only)
        if got:
            hits.append((name, got[0], got[1], src, got[2]))
    hits.sort(key=lambda h: (not h[4], h[0]))
    return hits


def record(quote_id, needle, filename, note=None, citation=None):
    src = sources().get(filename)
    if src is None:
        raise SystemExit(f'no such source: {filename}')
    got = src.find(needle)
    if not got:
        raise SystemExit(f'{quote_id}: not found in {filename}')
    offset, length, is_exact = got
    return {
        'id': quote_id,
        'text': src.text[offset:offset + length],
        'source': {
            'file': filename,
            'title': src.meta.get('title', filename),
            'author': (src.meta.get('author') or '').strip(),
        },
        'location': {
            'offset': offset,
            'length': length,
            'line': src.line_of(offset),
            'match': 'exact' if is_exact else 'opening-run',
        },
        **({'citation': citation} if citation else {}),
        **({'note': note} if note else {}),
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cmd = sys.argv[1]

    if cmd == 'find':
        needle = sys.argv[2]
        only = sys.argv[3] if len(sys.argv) > 3 else None
        hits = find(needle, only)
        if not hits:
            print('no match')
            return
        for name, offset, length, src, exact in hits:
            print(f'{name}\n  offset {offset} line {src.line_of(offset)} '
                  f"len {length} {'exact' if exact else 'opening-run'}\n  "
                  f'{src.text[offset:offset + length][:130]}')
        return

    if cmd == 'build':
        manifest = json.load(open(sys.argv[2], encoding='utf-8'))
        outdir = os.path.dirname(sys.argv[2])
        made = 0
        for entry in manifest:
            rec = record(entry['id'], entry['text'], entry['file'],
                         note=entry.get('note'), citation=entry.get('citation'))
            path = os.path.join(outdir, f"{entry['id']}.json")
            with open(path, 'w', encoding='utf-8') as fh:
                json.dump(rec, fh, ensure_ascii=False, indent=2)
                fh.write('\n')
            made += 1
            print(f"{entry['id']}  {rec['location']['match']:12}  "
                  f"offset {rec['location']['offset']:>8}  "
                  f"{len(rec['text']):>4} chars  {rec['source']['file'][:46]}")
        print(f'{made} quote records written to {outdir}')
        return

    raise SystemExit(__doc__)


if __name__ == '__main__':
    main()
