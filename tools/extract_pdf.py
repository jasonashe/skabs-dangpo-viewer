# -*- coding: utf-8 -*-
"""Extract སྐབས་དང་པོའི་སྤྱི་དོན།.pdf into structured paragraph data.

Page numbers recorded on every paragraph are *PDF* page numbers (1-based, as
shown in Preview), so the viewer's paging matches the PDF exactly.  The printed
folio number stamped on the page ("~ 4 ~") is kept alongside it.
"""
import collections, json, re, sys
from pdfminer.high_level import extract_pages
from pdfminer.layout import LTChar, LAParams

PDF = 'སྐབས་དང་པོའི་སྤྱི་དོན།.pdf'

BODY_FIRST, BODY_LAST = 36, 323      # PDF pages of the treatise itself
TOC_FIRST,  TOC_LAST  = 2, 35        # dkar chag
NOTE_FIRST, NOTE_LAST = 324, 351     # lung mchan / bsdur mchan apparatus

TSHEG = '་'
SHADS = '།༎༏༐༑༒༔'
MARKS = '❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴'


def walk(obj):
    for c in obj:
        if isinstance(c, LTChar):
            yield c
        elif hasattr(c, '__iter__'):
            yield from walk(c)


def page_rows(layout):
    """Group a page's glyphs into visual rows, keeping source characters exact."""
    chars = [c for c in walk(layout) if c.get_text() != '\n']
    if not chars:
        return [], None, None
    # the stamped folio ("~ 4 ~") is the only run set in Cambria
    folio_chars = [c for c in chars if 'Cambria' in c.fontname]
    chars = [c for c in chars if 'Cambria' not in c.fontname]
    stamped = None
    if folio_chars:
        folio_chars.sort(key=lambda c: c.x0)
        m = re.search(r'~\s*(\d+)\s*~', ''.join(c.get_text() for c in folio_chars))
        if m:
            stamped = int(m.group(1))
    header = [c for c in chars if c.y0 > 615]
    body = [c for c in chars if c.y0 <= 615]
    if not body:
        return [], stamped, None
    sizes = collections.Counter(round(c.size, 1) for c in body)
    dominant = sizes.most_common(1)[0][0]
    cut = dominant * 0.75
    main = [c for c in body if c.size >= cut]
    small = [c for c in body if c.size < cut]
    baselines = []
    for c in sorted(main, key=lambda c: -c.y0):
        for b in baselines:
            if abs(b[0] - c.y0) <= 3.0:
                b[1].append(c)
                break
        else:
            baselines.append([c.y0, [c]])
    baselines.sort(key=lambda b: -b[0])
    span = dominant * 1.7
    for c in small:                       # attach markers to the row they annotate
        best, bestd = None, 1e9
        for b in baselines:
            d = c.y0 - b[0]
            if -2.0 <= d <= span and d < bestd:
                best, bestd = b, d
        if best is not None:
            best[1].append(c)
    rows, folio = [], stamped
    for y0, cs in baselines:
        cs.sort(key=lambda c: c.x0)
        text = ''.join(c.get_text() for c in cs)
        m = re.fullmatch(r'\s*~\s*(\d+)\s*~\s*', text)
        if m:
            folio = int(m.group(1))
            continue
        rows.append({'y0': y0, 'x0': min(c.x0 for c in cs), 'text': text,
                     'size': round(max(c.size for c in cs), 1)})
    if header:
        header.sort(key=lambda c: c.x0)
        hd = ''.join(c.get_text() for c in header).strip()
        m = re.fullmatch(r'\s*~\s*(\d+)\s*~\s*', hd)
        if m and folio is None:
            folio = int(m.group(1))
        elif hd and not m:
            rows.insert(0, {'y0': max(c.y0 for c in header),
                            'x0': min(c.x0 for c in header), 'text': hd,
                            'size': round(max(c.size for c in header), 1),
                            'head': True})
    return rows, folio, dominant


def clean_row(t):
    t = t.replace(' ', ' ')
    t = re.sub(r'[ \t]+', ' ', t)
    return t.strip()


def join_rows(rows):
    """Concatenate wrapped rows without inventing a space at the break."""
    out = ''
    for r in rows:
        t = clean_row(r)
        if not t:
            continue
        if not out:
            out = t
            continue
        last = out[-1]
        first = t[0]
        if last == TSHEG or last in MARKS or first in SHADS or first == TSHEG:
            out += t
        elif last in SHADS or last == ' ':
            out += (' ' + t) if last != ' ' else t
        else:
            out += t
    return re.sub(r'[ \t]{2,}', ' ', out).strip()


def normalise(t):
    """Repair glyph-order artefacts that the PDF's font encoding introduces."""
    # a tsheg that got emitted between a base letter and its vowel sign
    t = re.sub(r'་([ཱ-྄])', r'\1་', t)
    # stray space directly before a tsheg
    t = re.sub(r' +་', '་', t)
    return t


def main():
    laparams = LAParams(char_margin=2.0, line_margin=0.35,
                        word_margin=0.1, boxes_flow=None)
    wanted = list(range(0, 355))
    pages = {}
    for idx, layout in zip(wanted, extract_pages(PDF, laparams=laparams,
                                                 page_numbers=wanted)):
        rows, folio, dom = page_rows(layout)
        pages[idx + 1] = {'rows': rows, 'folio': folio, 'size': dom}
        if (idx + 1) % 40 == 0:
            print('  ...page', idx + 1, file=sys.stderr)
    json.dump({str(k): v for k, v in pages.items()},
              open('tools/_rows.json', 'w'), ensure_ascii=False)
    print('wrote tools/_rows.json', len(pages), file=sys.stderr)


if __name__ == '__main__':
    main()
