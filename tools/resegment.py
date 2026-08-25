# -*- coding: utf-8 -*-
"""Re-segment the extracted paragraphs to match info-for-cowork/paragraphs.tsv.

The PDF's own indentation leaves a handful of enormous blocks — one runs to
13,000 characters — and the analysis material in info-for-cowork is keyed to a
finer division of the same text.  This splits our paragraphs at exactly the
boundaries that file uses, so one paragraph is one analysis is one candidate
pool, with no mapping layer anywhere.

Paragraphs outside the TSV's range (the title page and salutation, and
everything past PDF page 286) are carried through unsplit.

Offsets recorded inside a paragraph — page starts and the editorial
superscripts — are rebased onto whichever fragment they land in.

  python3 tools/resegment.py            # report what would change
  python3 tools/resegment.py --apply
"""
import json
import re
import sys

DATA = 'app/data/text.json'
TSV = 'info-for-cowork/paragraphs.tsv'
MARKS = '❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴'


def fold(text):
    """Comparison form.

    Spacing, shad style, the editorial superscripts and the inter-syllable
    tsheg are all folded away — the tsheg because our repair pass restored a
    few that the PDF had dropped, and the TSV carries the PDF's reading.  What
    is left is still distinctive enough to place a paragraph unambiguously.
    """
    text = re.sub(r'([།༎༏༑])\s*([ཱ-྄])', r'\2\1', text)
    text = text.replace('༑', '།').replace('༎', '།')
    text = re.sub(f'[{MARKS}་]', '', text)
    return re.sub(r'\s+', '', text)


def fold_index(text):
    """Folded text plus a map from folded position back to the original."""
    out, index = [], []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch.isspace() or ch in MARKS or ch == '་':
            i += 1
            continue
        if ch in '།༎༏༑':
            # a vowel sign stranded after its shad belongs before it; emit the
            # pair in reading order while keeping both real offsets
            j = i + 1
            while j < len(text) and text[j].isspace():
                j += 1
            if j < len(text) and '\u0f71' <= text[j] <= '\u0f84':
                out.append(text[j]); index.append(j)
                out.append('།'); index.append(i)
                i = j + 1
                continue
        out.append('།' if ch in '༑༎' else ch)
        index.append(i)
        i += 1
    return ''.join(out), index


def load_tsv():
    rows = []
    with open(TSV, encoding='utf-8') as fh:
        for line in fh:
            if line.startswith('#'):
                continue
            key, text = line.rstrip('\n').split('\t')
            rows.append({'key': key, 'text': text,
                         'index': int(key.split('_')[0]),
                         'page': int(key.split('_')[1])})
    return rows


def split_points(para, members):
    """Where inside a paragraph the TSV's members begin, in real offsets."""
    folded, index = fold_index(para['text'])
    cuts, at = [], 0
    for member in members:
        needle = fold(member['text'])
        found = folded.find(needle, at)
        if found < 0:
            return None
        cuts.append((index[found], member))
        at = found + len(needle)
    return cuts


def main():
    doc = json.load(open(DATA, encoding='utf-8'))
    paras = doc['paragraphs']
    rows = load_tsv()

    # place every TSV paragraph inside the paragraph that contains it
    folded_paras = [(p, fold(p['text'])) for p in paras]
    members = {p['id']: [] for p in paras}
    homeless = []
    for row in rows:
        needle = fold(row['text'])
        for para, folded in folded_paras:
            if needle and needle in folded:
                members[para['id']].append(row)
                break
        else:
            homeless.append(row)

    out, split_count, carried = [], 0, 0
    for para in paras:
        mine = members[para['id']]
        cuts = split_points(para, mine) if len(mine) > 1 else None
        if not cuts:
            piece = dict(para)
            piece['cowork'] = mine[0]['key'] if len(mine) == 1 else None
            out.append(piece)
            carried += 1 if not mine else 0
            continue
        split_count += 1
        if cuts[0][0] > 0:                   # text before the first member
            cuts.insert(0, (0, None))
        for i, (start, member) in enumerate(cuts):
            end = cuts[i + 1][0] if i + 1 < len(cuts) else len(para['text'])
            out.append(fragment(para, start, end, member))

    out = merge_display_lines(out)

    for i, piece in enumerate(out, start=1):
        piece['id'] = 'p%d' % i

    # the contents entries point at paragraph ids, which have all just moved
    first_on_page, spans_page = {}, {}
    for piece in out:
        first_on_page.setdefault(piece['page'], piece['id'])
        for page in range(piece['page'], piece['endPage'] + 1):
            spans_page.setdefault(page, piece['id'])
    retargeted = 0
    for entry in doc['toc']:
        if not entry.get('page'):
            continue
        target = first_on_page.get(entry['page']) or spans_page.get(entry['page'])
        if target and target != entry.get('paraId'):
            retargeted += 1
        entry['paraId'] = target

    print(f'{len(paras)} paragraphs -> {len(out)}')
    print(f'  split: {split_count} paragraphs')
    print(f'  carried through with no cowork counterpart: '
          f'{sum(1 for p in out if not p.get("cowork"))}')
    print(f'  TSV paragraphs not placed: {len(homeless)}')
    for row in homeless:
        print(f'    {row["key"]}')
    sizes = sorted(len(p['text']) for p in out)
    print(f'  length: median {sizes[len(sizes) // 2]}, max {sizes[-1]}')
    print(f'  contents entries retargeted: {retargeted}')

    if '--apply' not in sys.argv:
        print('\n(dry run — pass --apply to write)')
        return

    doc['paragraphs'] = out
    doc['meta']['segmentation'] = 'info-for-cowork/paragraphs.tsv'
    with open(DATA, 'w', encoding='utf-8') as fh:
        json.dump(doc, fh, ensure_ascii=False, separators=(',', ':'))
    print(f'\nwrote {DATA}')


SHADS = '།༎༏༐༑༒༔'
TSHEG = '་'
# a run of short pieces on one page with no counterpart in the TSV is a title
# or a verse broken across typeset lines, not several units of argument
DISPLAY_LINE_MAX = 280


def merge_display_lines(pieces):
    out = []
    for piece in pieces:
        prev = out[-1] if out else None
        short = (not piece.get('cowork')
                 and len(piece['text']) <= DISPLAY_LINE_MAX)
        # the run continues while each *incoming* piece is a display line, so a
        # verse of eight typeset lines becomes one paragraph rather than
        # stalling once the accumulated text passes the threshold
        joinable = (short and prev is not None and prev.get('_run')
                    and prev['page'] == piece['page'])
        if not joinable:
            piece = dict(piece)
            piece['_run'] = short
            out.append(piece)
            continue
        last, first = prev['text'][-1], piece['text'][0]
        if last == TSHEG or first in SHADS or first == TSHEG:
            sep = ''
        elif last in SHADS:
            sep = ' '
        else:
            sep = ' '
        base = len(prev['text']) + len(sep)
        prev['text'] += sep + piece['text']
        prev['endPage'] = piece['endPage']
        prev['marks'] += [dict(m, offset=m['offset'] + base)
                          for m in piece['marks']]
        prev['pageStarts'] += [dict(ps, offset=ps['offset'] + base)
                               for ps in piece['pageStarts']
                               if ps['page'] != prev['pageStarts'][-1]['page']]
    for piece in out:
        piece.pop('_run', None)
    return out


def fragment(para, start, end, member):
    """One piece of a split paragraph, with its inner offsets rebased."""
    text = para['text'][start:end]
    page_starts = [dict(ps) for ps in para['pageStarts']
                   if start <= ps['offset'] < end]
    if not page_starts or page_starts[0]['offset'] > start:
        # the piece begins mid-page: carry the page it starts on
        current = para['pageStarts'][0]
        for ps in para['pageStarts']:
            if ps['offset'] <= start:
                current = ps
        page_starts.insert(0, dict(current, offset=start))
    for ps in page_starts:
        ps['offset'] -= start
    marks = [dict(m, offset=m['offset'] - start) for m in para['marks']
             if start <= m['offset'] < end]
    return {
        'id': para['id'],
        'page': page_starts[0]['page'],
        'folio': page_starts[0]['folio'],
        'endPage': page_starts[-1]['page'],
        'text': text,
        'marks': marks,
        'pageStarts': page_starts,
        'cowork': member['key'] if member else None,
    }


if __name__ == '__main__':
    main()
