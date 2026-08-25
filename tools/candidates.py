# -*- coding: utf-8 -*-
"""Build the evidence brief for one paragraph, with every quote verified.

info-for-cowork/quotes holds ~50,000 candidate quotes gathered by an earlier
automated scan.  Most of them are not in the text they claim to come from: of a
400-quote sample, 91% of the ones marked UNVERIFIED could not be found in their
own source file, while everything marked verified_exact or verified_fuzzy was
found.  So the pool cannot be handed to an analyst as it stands.

This checks every candidate against the actual commentary file and keeps only
the ones that are really there, recording where.  What comes out is a brief the
analyst can quote from without further checking.

  python3 tools/candidates.py p12                 # readable brief
  python3 tools/candidates.py p12 --json          # machine form
  python3 tools/candidates.py --audit             # coverage over all paragraphs
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import quotes as Q                                          # noqa: E402

DATA = 'app/data/text.json'
POOL = 'info-for-cowork/quotes'
NAMES = json.load(open('Commentaries/commentary_names.json', encoding='utf-8'))

# a quote shorter than this cannot be placed in a source with any confidence
MIN_QUOTE_CHARS = 24


def paragraphs():
    return json.load(open(DATA, encoding='utf-8'))['paragraphs']


def by_id():
    return {p['id']: p for p in paragraphs()}


def cowork_index(para):
    """The paragraph_NNN number this paragraph's candidates live under."""
    key = para.get('cowork')
    return int(key.split('_')[0]) - 1 if key else None


def source_file(record):
    """The commentary filename a pool record refers to."""
    name = record.get('commentary', '')
    return name.split('[', 1)[1].rstrip(']') + '.txt' if '[' in name else None


def slug_dirs():
    return sorted(os.listdir(POOL)) if os.path.isdir(POOL) else []


def gather(para):
    """Every candidate for this paragraph, from every commentary."""
    index = cowork_index(para)
    if index is None:
        return []
    out = []
    for slug in slug_dirs():
        path = os.path.join(POOL, slug, 'paragraph_%03d.json' % index)
        if not os.path.exists(path):
            continue
        record = json.load(open(path, encoding='utf-8'))
        filename = source_file(record)
        for quote in record.get('quotes') or []:
            out.append({'slug': slug, 'file': filename, **quote})
    return out


def verify(candidates):
    """Keep the candidates that are really in their source; note where."""
    sources = Q.sources()
    kept, dropped = [], {'missing': 0, 'too_short': 0, 'no_file': 0,
                         'duplicate': 0}
    seen = set()
    for cand in candidates:
        text = (cand.get('quote_tibetan') or '').strip()
        if len(re.sub(r'\s+', '', text)) < MIN_QUOTE_CHARS:
            dropped['too_short'] += 1
            continue
        if cand['file'] not in sources:
            dropped['no_file'] += 1
            continue
        # an opening-run match on a short anchor is not evidence — a handful
        # of syllables recur all over a three-megabyte commentary — so a
        # candidate that is not verbatim must still agree for 40 characters
        found = sources[cand['file']].find(text, min_anchor=40)
        if not found:
            dropped['missing'] += 1
            continue
        offset, length, exact = found
        key = (cand['file'], offset, length)
        if key in seen:
            dropped['duplicate'] += 1
            continue
        seen.add(key)
        meta = NAMES.get(cand['file'], {})
        kept.append({
            'file': cand['file'],
            'slug': cand['slug'],
            'title': meta.get('title', cand['file']),
            'author': (meta.get('author') or '').strip(),
            'tier': meta.get('tier'),
            'text': sources[cand['file']].text[offset:offset + length],
            'offset': offset,
            'length': length,
            'line': sources[cand['file']].line_of(offset),
            'match': 'exact' if exact else 'opening-run',
            'sa_bcad': cand.get('sa_bcad'),
            'why': (cand.get('relevance') or '').strip(),
            'scan_score': cand.get('correctness_score'),
            'scan_verification': cand.get('verification'),
        })
    # strongest tier first, then the scan's own confidence
    kept.sort(key=lambda q: (q['tier'] if isinstance(q['tier'], int) else 99,
                             -(q['scan_score'] or 0), q['file'], q['offset']))
    return kept, dropped


def context(quote, before=110, after=110):
    """A little of the source either side, so relevance can be judged."""
    src = Q.sources()[quote['file']]
    start = max(0, quote['offset'] - before)
    end = min(len(src.text), quote['offset'] + quote['length'] + after)
    return (('… ' if start > 0 else '') + src.text[start:quote['offset']],
            src.text[quote['offset'] + quote['length']:end]
            + (' …' if end < len(src.text) else ''))


def neighbours(para):
    """The paragraph before and after, which the rubric's section 1 needs."""
    all_paras = paragraphs()
    at = next(i for i, p in enumerate(all_paras) if p['id'] == para['id'])
    before = all_paras[at - 1] if at > 0 else None
    after = all_paras[at + 1] if at + 1 < len(all_paras) else None
    return before, after


def brief(para, kept, dropped):
    lines = []
    add = lines.append
    add(f"# Evidence brief — {para['id']}")
    add('')
    add(f"PDF page {para['page']}"
        + (f"–{para['endPage']}" if para['endPage'] != para['page'] else '')
        + f" · folio {para['folio']} · {len(para['text'])} characters"
        + (f" · cowork {para['cowork']}" if para.get('cowork') else
           ' · no cowork counterpart'))
    add('')
    add('## The paragraph')
    add('')
    add(para['text'])
    add('')
    before, after = neighbours(para)
    add('## What runs either side')
    add('')
    if before:
        add(f"**Preceding — {before['id']} (page {before['page']}):** "
            f"…{before['text'][-320:]}")
    else:
        add('**Preceding:** nothing — this is the start of the document.')
    add('')
    if after:
        add(f"**Following — {after['id']} (page {after['page']}):** "
            f"{after['text'][:320]}…")
    else:
        add('**Following:** nothing — this is the end of the document.')
    add('')
    add('## Verified quotes')
    add('')
    total = len(kept) + sum(dropped.values())
    add(f'{len(kept)} of {total} candidates are actually present in the '
        f"source they name — dropped {dropped['missing']} not found there, "
        f"{dropped['too_short']} too short to place, "
        f"{dropped['duplicate']} duplicate.")
    add('')
    if not kept:
        add('No candidate survived verification. Search the commentaries '
            'directly — see the runbook.')
        add('')
    for i, quote in enumerate(kept, start=1):
        tier = quote['tier'] if quote['tier'] is not None else 'unknown'
        add(f"### {para['id']}-q{i:02d} · tier {tier} · {quote['author']} · "
            f"{quote['title']}")
        add('')
        lead, tail = context(quote)
        add(f'> …{lead.strip()}')
        add('>')
        add(f"> **{quote['text']}**")
        add('>')
        add(f'> {tail.strip()}…')
        add('')
        add(f"- **File:** `{quote['file']}`")
        add(f"- **Location:** char {quote['offset']}, line {quote['line']}, "
            f"{quote['length']} chars, match {quote['match']}")
        if quote['sa_bcad']:
            add(f"- **Under:** {quote['sa_bcad']}")
        if quote['why']:
            add(f"- **The scan's reason:** {quote['why']}")
        add('')
    return '\n'.join(lines)


def audit():
    total = {'kept': 0, 'missing': 0, 'too_short': 0, 'duplicate': 0,
             'no_file': 0}
    empty, thin = [], []
    paras = paragraphs()
    for para in paras:
        kept, dropped = verify(gather(para))
        total['kept'] += len(kept)
        for key, value in dropped.items():
            total[key] += value
        if not kept:
            empty.append(para['id'])
        elif len(kept) < 3:
            thin.append(para['id'])
        print(f"{para['id']:>6}  {len(kept):>4} verified  "
              f"{dropped['missing']:>4} not in source", flush=True)
    print()
    print(f"paragraphs: {len(paras)}")
    print(f"verified quotes kept: {total['kept']}")
    print(f"candidates dropped: {total['missing']} not found, "
          f"{total['too_short']} too short, {total['duplicate']} duplicate, "
          f"{total['no_file']} unknown file")
    print(f"paragraphs with no verified quote: {len(empty)}")
    print(f"paragraphs with one or two: {len(thin)}")
    with open('tools/_candidate_audit.json', 'w', encoding='utf-8') as fh:
        json.dump({'empty': empty, 'thin': thin, 'totals': total}, fh,
                  ensure_ascii=False, indent=2)


def main():
    if '--audit' in sys.argv:
        audit()
        return
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    para = by_id().get(sys.argv[1])
    if para is None:
        raise SystemExit(f'no paragraph {sys.argv[1]}')
    kept, dropped = verify(gather(para))
    if '--json' in sys.argv:
        json.dump({'paragraph': para, 'quotes': kept, 'dropped': dropped},
                  sys.stdout, ensure_ascii=False, indent=2)
        print()
        return
    print(brief(para, kept, dropped))


if __name__ == '__main__':
    main()
