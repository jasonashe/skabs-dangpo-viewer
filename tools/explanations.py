# -*- coding: utf-8 -*-
"""Check the analysis documents and rebuild Explanations/index.json.

An analysis is accepted only if it would actually work in the reader:

  * it names a real paragraph
  * it carries the six rubric sections, in order
  * its <!--line a-b--> anchors lie inside the paragraph, run forward, and
    between them cover the whole of it — that is what the translation lookup
    scrolls to, so a gap is a passage the reader cannot look up
  * every [text](quote:id) link resolves in the quote index

  python3 tools/explanations.py             # check everything, rebuild index
  python3 tools/explanations.py p12         # check one
  python3 tools/explanations.py --next 5    # the next five still to write
"""
import json
import os
import re
import sys

DATA = 'app/data/text.json'
DIR = 'Explanations'
INDEX = os.path.join(DIR, 'quotes', 'index.json')

ANCHOR = re.compile(r'<!--\s*line\s+(\d+)\s*-\s*(\d+)\s*-->')
QUOTE_REF = re.compile(r'\]\(quote:([A-Za-z0-9_-]+)\)')

SECTIONS = [
    'Passage & Context',
    'Translation & Breakdown',
    'Structural Context',
    'Philosophical Exposition',
    'Bones of Contention',
    'Key Terminology',
]

# an analysis this short has not done the work the rubric asks for
MIN_BYTES = 2500


def check_one(para, text, quote_ids):
    problems = []
    name = para['id']
    length = len(para['text'])

    heads = re.findall(r'^#{1,6}\s+(.*)$', text, re.M)
    joined = ' | '.join(heads)
    seen_at = -1
    for wanted in SECTIONS:
        where = next((i for i, h in enumerate(heads)
                      if wanted.lower() in h.lower()), None)
        if where is None:
            problems.append(f'{name}: no section heading for "{wanted}" '
                            f'(headings found: {joined[:120]})')
        elif where < seen_at:
            problems.append(f'{name}: section "{wanted}" is out of order')
        else:
            seen_at = where

    if len(text) < MIN_BYTES:
        problems.append(f'{name}: only {len(text)} bytes — too thin for a '
                        'full analysis')

    anchors = [(int(a), int(b)) for a, b in ANCHOR.findall(text)]
    if not anchors:
        problems.append(f'{name}: no line anchors, so nothing to look up')
    covered, last_end, last_start = 0, 0, -1
    for start, end in anchors:
        if end <= start:
            problems.append(f'{name}: anchor {start}-{end} is empty')
            continue
        if end > length:
            problems.append(f'{name}: anchor {start}-{end} runs past the '
                            f'paragraph ({length} chars)')
        if start < last_start:
            problems.append(f'{name}: anchor {start}-{end} goes backwards')
        if start > last_end:
            problems.append(f'{name}: characters {last_end}-{start} are in no '
                            'anchor, so that stretch cannot be looked up')
        elif start < last_end:
            problems.append(f'{name}: anchor {start}-{end} overlaps the one '
                            f'before it (ends {last_end}) — the lookup picks '
                            'one block, so anchors must not compete')
        last_start, last_end = start, max(last_end, min(end, length))
        covered += max(0, min(end, length) - start)
    if anchors and last_end < length:
        problems.append(f'{name}: characters {last_end}-{length} are in no '
                        'anchor')

    for ref in QUOTE_REF.findall(text):
        if ref not in quote_ids:
            problems.append(f'{name}: quote {ref} is not in the quote index')

    return problems, covered, length


def main():
    doc = json.load(open(DATA, encoding='utf-8'))
    paras = {p['id']: p for p in doc['paragraphs']}
    try:
        quote_ids = set(json.load(open(INDEX, encoding='utf-8')))
    except OSError:
        quote_ids = set()

    if '--next' in sys.argv:
        want = int(sys.argv[sys.argv.index('--next') + 1])
        done = {n[:-3] for n in os.listdir(DIR) if n.endswith('.md')}
        todo = [p['id'] for p in doc['paragraphs'] if p['id'] not in done]
        print(' '.join(todo[:want]))
        print(f'# {len(done)} done, {len(todo)} to go', file=sys.stderr)
        return 0

    only = sys.argv[1] if len(sys.argv) > 1 else None
    names = sorted((n[:-3] for n in os.listdir(DIR) if n.endswith('.md')),
                   key=lambda n: int(re.sub(r'\D', '', n) or 0))
    if only:
        names = [n for n in names if n == only]
        if not names:
            raise SystemExit(f'no analysis file for {only}')

    problems = []
    for name in names:
        para = paras.get(name)
        text = open(os.path.join(DIR, f'{name}.md'), encoding='utf-8').read()
        if para is None:
            problems.append(f'{name}.md: no such paragraph')
            continue
        issues, covered, length = check_one(para, text, quote_ids)
        problems += issues
        pct = 100 * covered / length if length else 0
        refs = len(set(QUOTE_REF.findall(text)))
        print(f'{name:>6}  {len(text):>6} bytes  {refs:>2} quotes  '
              f'anchors cover {pct:5.1f}%'
              f"{'' if not issues else '  <- ' + str(len(issues)) + ' problems'}")

    if not only:
        with open(os.path.join(DIR, 'index.json'), 'w', encoding='utf-8') as fh:
            json.dump(names, fh, ensure_ascii=False)
            fh.write('\n')
        done = len(names)
        total = len(paras)
        print(f'\n{done} of {total} paragraphs analysed '
              f'({100 * done // max(1, total)}%), {len(quote_ids)} quotes '
              'in the index')

    if problems:
        print('\nproblems:')
        for problem in problems:
            print(' ', problem)
        return 1
    print('\nall checks pass')
    return 0


if __name__ == '__main__':
    sys.exit(main())
