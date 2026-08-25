# -*- coding: utf-8 -*-
"""Restore inter-syllable tsheg that the PDF's glyph stream drops.

The same work is present in Commentaries/ as an e-text.  Aligning the two with
spaces removed isolates the one defect worth repairing: a missing ་ between two
syllables.  Only pure insertions of ་ are adopted — no letter is ever changed
and nothing the printed edition shows is removed.
"""
import difflib, json, re, sys

ETEXT = 'Commentaries/རྗེ་བཙུན་ཆོས་ཀྱི་རྒྱལ་མཚན་_སྐབས་དང་པོའི་སྤྱི་དོན།.txt'
WINDOW = 2500


def strip_spaces(s):
    out, idx = [], []
    for i, ch in enumerate(s):
        if ch == ' ':
            continue
        out.append(ch)
        idx.append(i)
    return ''.join(out), idx


def main():
    data = json.load(open('app/data/text.json'))
    paras = data['paragraphs']
    et = re.sub(r'\s+', ' ', open(ETEXT, encoding='utf-8').read())
    # the e-text drops the shad after a ག/ང syllable; the print keeps it
    et_cmp = et.replace('༑', '།')

    pdf = '\n'.join(p['text'] for p in paras)
    P, Pidx = strip_spaces(pdf.replace('༑', '།').replace('\n', ' '))
    E, _ = strip_spaces(et_cmp)

    inserts, cursor, i = [], 0, 0
    while i < len(P):
        win = P[i:i + WINDOW]
        anchor = win[:36]
        j = E.find(anchor, cursor)
        if j < 0:
            j = E.find(win[:20], cursor)
        if j < 0:
            i += WINDOW // 2
            continue
        ewin = E[j:j + int(WINDOW * 1.2)]
        sm = difflib.SequenceMatcher(None, win, ewin, autojunk=False)
        tail = None
        for tag, a1, a2, b1, b2 in sm.get_opcodes():
            if tag == 'insert' and set(ewin[b1:b2]) == {'་'} and 0 < a1 < len(win):
                inserts.append(Pidx[i + a1])
            elif tag == 'equal':
                tail = (a2, b2)
        if tail and tail[0] > WINDOW * 0.5:
            i += tail[0]
            cursor = j + tail[1]
        else:
            i += WINDOW // 2
            cursor = j + WINDOW // 2
    inserts = sorted({o for o in inserts
                      if 0 < o < len(pdf) and pdf[o] != '\n' and pdf[o - 1] != '\n'})
    print('tsheg insertions:', len(inserts), file=sys.stderr)
    for off in inserts[:20]:
        print('  ', repr(pdf[max(0, off - 14):off]), '<<་>>',
              repr(pdf[off:off + 14]), file=sys.stderr)
    if '--apply' not in sys.argv:
        return

    # map absolute offsets back onto individual paragraphs
    bounds, pos = [], 0
    for p in paras:
        bounds.append((pos, pos + len(p['text']), p))
        pos += len(p['text']) + 1
    applied = 0
    for off in inserts:
        for s, e, p in bounds:
            if s <= off < e:
                local = off - s
                p.setdefault('_edits', []).append(local)
                applied += 1
                break
    for p in paras:
        edits = sorted(p.pop('_edits', []))
        if not edits:
            continue
        out, prev = [], 0
        for off in edits:
            out.append(p['text'][prev:off]); out.append('་'); prev = off
        out.append(p['text'][prev:])
        p['text'] = ''.join(out)
        bump = lambda o: o + sum(1 for off in edits if off <= o)
        for m in p['marks']:
            m['offset'] = bump(m['offset'])
        for ps in p['pageStarts']:
            ps['offset'] = bump(ps['offset'])
    with open('app/data/text.json', 'w') as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(',', ':'))
    print('applied', applied, file=sys.stderr)


if __name__ == '__main__':
    main()
