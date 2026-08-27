# -*- coding: utf-8 -*-
"""Turn an analyst's quote selection into the store the viewer reads.

The analyst decides *which* quotes bear on a paragraph and *why*.  Everything
mechanical happens here: each selected quote is looked up in the commentary
file again, its offset re-derived from the source rather than trusted, a stable
id assigned, and the record filed under the commentary it came from — the same
shape info-for-cowork/quotes uses:

    Explanations/quotes/<commentary-slug>/<paragraph-id>.json

A quote that cannot be found in its own source is refused, so nothing that is
not really in the text can reach the reader.

    Explanations/quotes/_selected/p12.json      what the analyst chose
        {"paragraph": "p12", "quotes": [
           {"ref": "p12-q03", "why": "…"},                      from the brief
           {"file": "…txt", "text": "…", "why": "…"}            found by hand
        ]}

  python3 tools/quotebank.py build p12       # one paragraph
  python3 tools/quotebank.py build --all
  python3 tools/quotebank.py pack            # refresh quotes/index.json
  python3 tools/quotebank.py check           # re-verify the whole store
"""
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import candidates as C                                       # noqa: E402
import quotes as Q                                           # noqa: E402

STORE = 'Explanations/quotes'
SELECTED = os.path.join(STORE, '_selected')
INDEX = os.path.join(STORE, 'index.json')
NAMES = json.load(open('Commentaries/commentary_names.json', encoding='utf-8'))


def slug_for(filename):
    """The folder a commentary's records live in."""
    for slug in C.slug_dirs():
        path = os.path.join(C.POOL, slug, 'paragraph_000.json')
        if os.path.exists(path):
            record = json.load(open(path, encoding='utf-8'))
            if C.source_file(record) == filename:
                return slug
    # a source the scan never covered: derive a folder name from the file.
    # Tibetan filenames flatten to nothing under an ascii fold, so a bare
    # 'other' would collide and one commentary's records would overwrite
    # another's; a short digest of the filename keeps each one its own folder.
    stem = filename[:-4] if filename.endswith('.txt') else filename
    name = re.sub(r'[^a-z0-9]+', '_', stem.encode('ascii', 'replace')
                  .decode().lower()).strip('_')
    digest = hashlib.sha1(stem.encode('utf-8')).hexdigest()[:10]
    return f'{name}_{digest}' if name else f'other_{digest}'


_slugs = {}


def slug(filename):
    if filename not in _slugs:
        _slugs[filename] = slug_for(filename)
    return _slugs[filename]


def resolve(paragraph_id, entry, brief_index):
    """One selection entry -> a verified record, or a reason it was refused."""
    if entry.get('ref'):
        quote = brief_index.get(entry['ref'])
        if quote is None:
            return None, f"{entry['ref']} is not in this paragraph's brief"
        filename, text = quote['file'], quote['text']
    else:
        filename, text = entry.get('file'), entry.get('text')
        if not filename or not text:
            return None, 'entry needs either a ref or a file plus text'

    sources = Q.sources()
    if filename not in sources:
        return None, f'no such commentary file: {filename}'
    found = sources[filename].find(text)
    if not found:
        return None, f'not found in {filename}: {text[:40]}…'
    offset, length, exact = found
    meta = NAMES.get(filename, {})
    return {
        'file': filename,
        'text': sources[filename].text[offset:offset + length],
        'title': meta.get('title', filename),
        'author': (meta.get('author') or '').strip(),
        'tier': meta.get('tier'),
        'offset': offset,
        'length': length,
        'line': sources[filename].line_of(offset),
        'match': 'exact' if exact else 'opening-run',
        'why': (entry.get('why') or '').strip(),
        'citation': (entry.get('citation') or '').strip() or None,
    }, None


def build(paragraph_id, quiet=False):
    path = os.path.join(SELECTED, f'{paragraph_id}.json')
    if not os.path.exists(path):
        return 0, [f'no selection file at {path}']
    selection = json.load(open(path, encoding='utf-8'))

    para = C.by_id().get(paragraph_id)
    if para is None:
        return 0, [f'no paragraph {paragraph_id}']
    kept, _ = C.verify(C.gather(para))
    brief_index = {f'{paragraph_id}-q{i:02d}': q
                   for i, q in enumerate(kept, start=1)}

    records, problems = [], []
    for i, entry in enumerate(selection.get('quotes') or [], start=1):
        record, why_not = resolve(paragraph_id, entry, brief_index)
        if record is None:
            problems.append(f'{paragraph_id} quote {i}: {why_not}')
            continue
        record['id'] = f'{paragraph_id}-q{len(records) + 1:02d}'
        records.append(record)

    # clear this paragraph out of every commentary folder, then refile
    for folder in os.listdir(STORE) if os.path.isdir(STORE) else []:
        stale = os.path.join(STORE, folder, f'{paragraph_id}.json')
        if folder != '_selected' and os.path.exists(stale):
            os.remove(stale)

    by_source = {}
    for record in records:
        by_source.setdefault(record['file'], []).append(record)
    for filename, group in by_source.items():
        folder = os.path.join(STORE, slug(filename))
        os.makedirs(folder, exist_ok=True)
        meta = NAMES.get(filename, {})
        payload = {
            'paragraph': paragraph_id,
            'commentary': {
                'file': filename,
                'title': meta.get('title', filename),
                'author': (meta.get('author') or '').strip(),
                'tier': meta.get('tier'),
            },
            'quotes': [{k: v for k, v in r.items() if k != 'file'}
                       for r in group],
        }
        with open(os.path.join(folder, f'{paragraph_id}.json'), 'w',
                  encoding='utf-8') as fh:
            json.dump(payload, fh, ensure_ascii=False, indent=2)
            fh.write('\n')

    if not quiet:
        print(f'{paragraph_id}: {len(records)} quotes filed under '
              f'{len(by_source)} commentaries')
        for problem in problems:
            print(f'  refused — {problem}')
    return len(records), problems


def pack():
    """Flatten the store into the single file the viewer loads."""
    index = {}
    for folder in sorted(os.listdir(STORE)):
        path = os.path.join(STORE, folder)
        if folder.startswith('_') or not os.path.isdir(path):
            continue
        for name in sorted(os.listdir(path)):
            if not name.endswith('.json'):
                continue
            payload = json.load(open(os.path.join(path, name),
                                     encoding='utf-8'))
            commentary = payload['commentary']
            for quote in payload['quotes']:
                index[quote['id']] = {
                    'id': quote['id'],
                    'text': quote['text'],
                    'source': {
                        'file': commentary['file'],
                        'title': commentary['title'],
                        'author': commentary['author'],
                    },
                    'location': {
                        'offset': quote['offset'],
                        'length': quote['length'],
                        'line': quote['line'],
                        'match': quote['match'],
                    },
                    'paragraph': payload['paragraph'],
                    'tier': commentary['tier'],
                    **({'citation': quote['citation']}
                       if quote.get('citation') else {}),
                    **({'note': quote['why']} if quote.get('why') else {}),
                }
    with open(INDEX, 'w', encoding='utf-8') as fh:
        json.dump(index, fh, ensure_ascii=False, separators=(',', ':'))
        fh.write('\n')
    print(f'{len(index)} quotes indexed in {INDEX}')
    return index


def check():
    """Every stored quote must still be at the offset it claims."""
    sources = Q.sources()
    bad, total = [], 0
    for folder in sorted(os.listdir(STORE)):
        path = os.path.join(STORE, folder)
        if folder.startswith('_') or not os.path.isdir(path):
            continue
        for name in sorted(os.listdir(path)):
            if not name.endswith('.json'):
                continue
            payload = json.load(open(os.path.join(path, name),
                                     encoding='utf-8'))
            filename = payload['commentary']['file']
            for quote in payload['quotes']:
                total += 1
                src = sources.get(filename)
                if src is None:
                    bad.append(f"{quote['id']}: unknown file {filename}")
                    continue
                at = quote['offset']
                if src.text[at:at + quote['length']] != quote['text']:
                    bad.append(f"{quote['id']}: text is not at char {at} of "
                               f'{filename}')
    print(f'{total} stored quotes, {len(bad)} wrong')
    for problem in bad[:20]:
        print(' ', problem)
    return 1 if bad else 0


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    command = sys.argv[1]
    if command == 'pack':
        pack()
        return 0
    if command == 'check':
        return check()
    if command == 'build':
        if '--all' in sys.argv:
            os.makedirs(SELECTED, exist_ok=True)
            names = sorted(n[:-5] for n in os.listdir(SELECTED)
                           if n.endswith('.json'))
            made, problems = 0, []
            for paragraph_id in names:
                count, issues = build(paragraph_id, quiet=True)
                made += count
                problems += issues
            print(f'{len(names)} paragraphs, {made} quotes filed')
            for problem in problems:
                print(f'  refused — {problem}')
            pack()
            return 1 if problems else 0
        _, problems = build(sys.argv[2])
        pack()
        return 1 if problems else 0
    raise SystemExit(__doc__)


if __name__ == '__main__':
    sys.exit(main())
