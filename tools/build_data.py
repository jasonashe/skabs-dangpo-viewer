# -*- coding: utf-8 -*-
"""Build app/data/text.json from the rows extracted out of the PDF.

Everything downstream keys off PDF page numbers so the viewer's paging is the
PDF's paging.  The folio stamped on the page ("~ 4 ~") is carried along too.
"""
import json, os, re, collections

ROWS = json.load(open('tools/_rows.json'))

BODY_FIRST, BODY_LAST = 36, 323
TOC_FIRST, TOC_LAST = 2, 35
NOTE_FIRST, NOTE_LAST = 324, 351
FOLIO_OFFSET = BODY_FIRST - 1          # printed folio N  ->  PDF page N + 35

TSHEG = '་'
SHADS = '།༎༏༐༑༒༔'
MARKS = '❶❷❸❹❺❻❼❽❾❿⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴'
MARK_INDEX = {m: i + 1 for i, m in enumerate(MARKS)}


def clean(t):
    t = t.replace(' ', ' ').replace('​', '')
    return re.sub(r'[ \t]+', ' ', t).strip()


def normalise(t):
    t = re.sub(r'་([ཱ-྄])', r'\1་', t)        # tsheg emitted before its vowel
    t = re.sub(r'([།༎༏༑])\s*([ཱ-྄])', r'\2\1', t)   # ... or before a shad
    t = re.sub(r' +([་])', r'\1', t)               # space wedged before a tsheg
    # justification eats the space a shad is always followed by
    t = re.sub(r'([།༎༏༑])(?=[\u0F40-\u0FBC])', r'\1 ', t)
    return re.sub(r'[ \t]{2,}', ' ', t).strip()


# ---------------------------------------------------------------- paragraphs
def body_rows():
    for p in range(BODY_FIRST, BODY_LAST + 1):
        page = ROWS[str(p)]
        rs = [r for r in page['rows']
              if clean(r['text']) and not r.get('head')]
        if not rs:
            continue
        margin = min(r['x0'] for r in rs)
        dom = page.get('size') or 16.0
        for r in rs:
            # lift the editorial superscripts out before anything else, so the
            # reading text is source characters only and copy/search stay exact
            raw = clean(r['text'])
            marks, letters = [], []
            for ch in raw:
                if ch in MARK_INDEX:
                    marks.append({'n': MARK_INDEX[ch], 'at': len(letters)})
                else:
                    letters.append(ch)
            text = normalise(''.join(letters))
            # normalise only ever inserts, so walk it to re-place the marks
            yield {'page': p, 'folio': page['folio'], 'x0': r['x0'],
                   'text': text, 'rawText': ''.join(letters), 'marks': marks,
                   'indented': r['x0'] > margin + 6,
                   'heading': r.get('size', dom) > dom + 0.5}


def remap(raw, cooked, at):
    """Map an offset in the pre-normalised row onto the normalised row."""
    i = j = 0
    while i < at and j < len(cooked):
        if raw[i] == cooked[j]:
            i += 1
            j += 1
        else:
            j += 1
    return j


def build_paragraphs():
    groups, cur, after_heading = [], None, False
    for r in body_rows():
        if cur is None or r['indented'] or r['heading'] or after_heading:
            cur = []
            groups.append(cur)
        after_heading = r['heading']
        cur.append(r)

    paras = []
    for i, rows in enumerate(groups, start=1):
        text, page_starts, marks = '', [], []
        for r in rows:
            t = r['text']
            if not text:
                sep = ''
            else:
                last, first = text[-1], t[0]
                if last == TSHEG or first in SHADS or first == TSHEG:
                    sep = ''
                elif last in SHADS:
                    sep = ' '
                else:
                    sep = ''
            base = len(text) + len(sep)
            if not page_starts or page_starts[-1]['page'] != r['page']:
                page_starts.append({'page': r['page'], 'folio': r['folio'],
                                    'offset': base})
            for m in r['marks']:
                marks.append({'n': m['n'],
                              'offset': base + remap(r['rawText'], t, m['at'])})
            text += sep + t

        paras.append({
            'id': 'p%d' % i,
            'page': rows[0]['page'],
            'folio': rows[0]['folio'],
            'endPage': rows[-1]['page'],
            'text': text,
            'marks': marks,
            'pageStarts': page_starts,
        })
    return paras


# ------------------------------------------------------------------- the toc
DOTS = re.compile(r'[.…]{3,}')


def build_toc(paras):
    first_para_on_page = {}
    for p in paras:
        first_para_on_page.setdefault(p['page'], p['id'])
    # for continuation pages, fall back to the paragraph that straddles them
    para_for_page = {}
    for p in paras:
        for pg in range(p['page'], p['endPage'] + 1):
            para_for_page.setdefault(pg, p['id'])

    entries = []
    for pnum in range(TOC_FIRST, TOC_LAST + 1):
        rows = [r for r in ROWS[str(pnum)]['rows']
                if clean(r['text']) and not r.get('head')]
        if not rows:
            continue
        margin = min(r['x0'] for r in rows)
        for r in rows:
            text = normalise(clean(r['text']))
            if not text:
                continue
            centred = r['x0'] > margin + 80
            parts = DOTS.split(text)
            if centred and len(parts) == 1:
                entries.append({'label': text.strip(), 'level': 0,
                                'folio': None, 'page': None})
                continue
            if len(parts) < 2:
                if entries and not DOTS.search(text):
                    entries[-1]['label'] = (entries[-1]['label'] + text).strip()
                continue
            label = parts[0].strip()
            target = parts[-1].strip().strip('།').strip()
            level = 1 if r['x0'] <= margin + 5 else 2
            m = re.fullmatch(r'(\d+)', target)
            folio = int(m.group(1)) if m else None
            entries.append({'label': label, 'level': level, 'folio': folio,
                            'page': folio + FOLIO_OFFSET if folio else None,
                            'note': None if folio else target})

    # part headings inherit the destination of the entry that follows them
    for i, e in enumerate(entries):
        if e['level'] == 0 and e['page'] is None:
            for nxt in entries[i + 1:]:
                if nxt['page']:
                    e['page'], e['folio'] = nxt['page'], nxt['folio']
                    break

    out = []
    for i, e in enumerate(entries):
        if not e['label'] or re.fullmatch(r'[\d༠-༩]+', e['label']):
            continue
        page = e['page']
        e2 = {'id': 't%d' % (i + 1), 'label': e['label'], 'level': e['level'],
              'folio': e['folio'], 'page': page,
              'paraId': (first_para_on_page.get(page)
                         or para_for_page.get(page)) if page else None}
        if e.get('note'):
            e2['note'] = e['note']
        out.append(e2)
    return out


# ------------------------------------------------- lung mchan / bsdur mchan
ENTRY_RE = re.compile(r'(?<!\S)(\d{1,3})\s*(?=[' + MARKS + r'])')


def build_apparatus():
    """Parse the citation/variant apparatus, keyed by folio + superscript no."""
    blocks, section = [], None
    for pnum in range(NOTE_FIRST, NOTE_LAST + 1):
        rows = [r for r in ROWS[str(pnum)]['rows']
                if clean(r['text']) and not r.get('head')]
        if not rows:
            continue
        margin = min(r['x0'] for r in rows)
        for r in rows:
            text = clean(r['text'])
            if r['x0'] > margin + 60:            # centred sub-head
                section = normalise(text)
                continue
            blocks.append((section, text))

    blob_sections, blob = [], ''
    for section, line in blocks:
        if not blob:
            blob = line
        else:
            last, first = blob[-1], line[0]
            if last == TSHEG or first in SHADS or first == TSHEG:
                blob += line
            else:
                blob += ' ' + line
        blob_sections.append((len(blob), section))
    blob = normalise(blob)

    def section_at(pos):
        for end, sec in blob_sections:
            if pos < end:
                return sec
        return blob_sections[-1][1] if blob_sections else None

    notes = {}
    positions = [(m.start(), int(m.group(1)))
                 for m in ENTRY_RE.finditer(blob)]
    for idx, (start, folio) in enumerate(positions):
        end = positions[idx + 1][0] if idx + 1 < len(positions) else len(blob)
        body = blob[start:end][len(str(folio)):].strip()
        cur = None
        for tok in re.split('([' + MARKS + '])', body):
            if tok in MARK_INDEX:
                cur = MARK_INDEX[tok]
                notes.setdefault(folio, {})[cur] = ''
            elif cur is not None and folio in notes:
                notes[folio][cur] = (notes[folio][cur] + tok).strip()
    for folio in notes:
        for n in list(notes[folio]):
            notes[folio][n] = re.sub(r'\s+', ' ', notes[folio][n]).strip()
    return notes


def main():
    paras = build_paragraphs()
    toc = build_toc(paras)
    notes = build_apparatus()

    running = {}
    for p in range(BODY_FIRST, BODY_LAST + 1):
        rows = ROWS[str(p)]['rows']
        hdr = None
        for r in rows:
            if r['y0'] > 618:
                hdr = normalise(clean(r['text']))
        if hdr:
            running[p] = hdr

    data = {
        'meta': {
            'title': 'སྐབས་དང་པོའི་སྤྱི་དོན།',
            'author': 'རྗེ་བཙུན་ཆོས་ཀྱི་རྒྱལ་མཚན།',
            'file': 'སྐབས་དང་པོའི་སྤྱི་དོན།.pdf',
            'pdfPages': len(ROWS),
            'bodyFirstPage': BODY_FIRST,
            'bodyLastPage': BODY_LAST,
            'folioOffset': FOLIO_OFFSET,
        },
        'paragraphs': paras,
        'toc': toc,
        'runningHeads': {str(k): v for k, v in running.items()},
        'apparatus': {str(f): {str(n): t for n, t in ns.items()}
                      for f, ns in notes.items()},
    }
    os.makedirs('app/data', exist_ok=True)
    with open('app/data/text.json', 'w') as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))

    print('paragraphs', len(paras))
    print('toc entries', len(toc), '| with page', sum(1 for t in toc if t['page']))
    print('apparatus folios', len(notes),
          '| notes', sum(len(v) for v in notes.values()))
    print('marks in text', sum(len(p['marks']) for p in paras))
    print('bytes', os.path.getsize('app/data/text.json'))


if __name__ == '__main__':
    main()
