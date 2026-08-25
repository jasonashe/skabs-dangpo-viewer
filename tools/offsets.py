# -*- coding: utf-8 -*-
"""Print a paragraph split into clauses with their character offsets.

The explanation files tag each block with the span of the paragraph it
explains (<!--line start-end-->); this is where those numbers come from, so
they are measured rather than guessed.

  python3 tools/offsets.py p6
  python3 tools/offsets.py p6 --find "ཞེས་གསུངས་པའི་ཕྱིར།"
"""
import json
import re
import sys

DATA = 'app/data/text.json'
BREAK = re.compile(r'(?<=[།༎༏༑]) ')


def clauses(text):
    out, start = [], 0
    for m in BREAK.finditer(text):
        out.append((start, m.start() + 1, text[start:m.start() + 1]))
        start = m.end()
    if start < len(text):
        out.append((start, len(text), text[start:]))
    return out


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    para_id = sys.argv[1]
    doc = json.load(open(DATA, encoding='utf-8'))
    para = next((p for p in doc['paragraphs'] if p['id'] == para_id), None)
    if para is None:
        raise SystemExit(f'no paragraph {para_id}')

    if '--find' in sys.argv:
        needle = sys.argv[sys.argv.index('--find') + 1]
        at = para['text'].find(needle)
        if at < 0:
            raise SystemExit('not found')
        print(f'{at}-{at + len(needle)}')
        return

    print(f"# {para['id']}  pdf pages {para['page']}-{para['endPage']}  "
          f"folio {para['folio']}  {len(para['text'])} chars")
    for i, (s, e, t) in enumerate(clauses(para['text'])):
        print(f'{i:>3} {s:>5}-{e:<5} {t}')


if __name__ == '__main__':
    main()
