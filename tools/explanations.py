# -*- coding: utf-8 -*-
"""Check the explanation files and rebuild Explanations/index.json.

Checks that every file names a real paragraph, that its <!--line a-b--> anchors
fall inside that paragraph and run forward, and that every [text](quote:id)
link has a record in Explanations/quotes.

  python3 tools/explanations.py
"""
import json
import os
import re
import sys

DATA = 'app/data/text.json'
DIR = 'Explanations'
QUOTES = os.path.join(DIR, 'quotes')

ANCHOR = re.compile(r'<!--\s*line\s+(\d+)\s*-\s*(\d+)\s*-->')
QUOTE_REF = re.compile(r'\]\(quote:([A-Za-z0-9_-]+)\)')


def main():
    doc = json.load(open(DATA, encoding='utf-8'))
    paras = {p['id']: p for p in doc['paragraphs']}
    names = sorted(n[:-3] for n in os.listdir(DIR) if n.endswith('.md'))
    have_quotes = {n[:-5] for n in os.listdir(QUOTES) if n.endswith('.json')
                   and not n.startswith('_')}

    problems = []
    covered = {}
    for para_id in names:
        para = paras.get(para_id)
        if para is None:
            problems.append(f'{para_id}.md: no such paragraph')
            continue
        text = open(os.path.join(DIR, f'{para_id}.md'), encoding='utf-8').read()
        anchors = [(int(a), int(b)) for a, b in ANCHOR.findall(text)]
        if not anchors:
            problems.append(f'{para_id}.md: no line anchors')
        last = -1
        span = 0
        for start, end in anchors:
            if end <= start:
                problems.append(f'{para_id}.md: anchor {start}-{end} is empty')
            if end > len(para['text']):
                problems.append(f'{para_id}.md: anchor {start}-{end} runs past '
                                f"the paragraph ({len(para['text'])} chars)")
            if start < last:
                problems.append(f'{para_id}.md: anchor {start}-{end} goes '
                                'backwards')
            last = start
            span += max(0, min(end, len(para['text'])) - start)
        covered[para_id] = (span, len(para['text']))
        for quote_id in QUOTE_REF.findall(text):
            if quote_id not in have_quotes:
                problems.append(f'{para_id}.md: no record for quote {quote_id}')

    with open(os.path.join(DIR, 'index.json'), 'w', encoding='utf-8') as fh:
        json.dump(names, fh, ensure_ascii=False)
        fh.write('\n')

    for para_id in names:
        span, total = covered.get(para_id, (0, 0))
        pct = (100 * span / total) if total else 0
        print(f'{para_id:>6}  {len(open(os.path.join(DIR, para_id + ".md")).read()):>6} bytes'
              f'  anchors cover {pct:5.1f}% of {total} chars')
    print(f'\n{len(names)} explanation files, {len(have_quotes)} quote records')
    if problems:
        print('\nproblems:')
        for p in problems:
            print(' ', p)
        return 1
    print('all anchors and quote links check out')
    return 0


if __name__ == '__main__':
    sys.exit(main())
