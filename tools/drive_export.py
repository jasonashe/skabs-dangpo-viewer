# -*- coding: utf-8 -*-
"""Prepare the analyses for delivery to Google Drive.

The repository is the working copy the viewer reads.  Drive is for reading,
sharing and commenting, so what goes there is not a mirror of the repo: the
viewer's machinery is rendered into something a reader wants — the line anchors
disappear, and a quotation link becomes the quotation with its source named
underneath.

Everything is written to dist/drive/ together with a manifest saying which file
belongs in which Drive folder.  Uploading is then a walk over the manifest, one
create_file call per row, which is all the agent has to do.

  python3 tools/drive_export.py            # build dist/drive/
  python3 tools/drive_export.py --stats    # what would be uploaded
"""
import hashlib
import json
import os
import re
import shutil
import sys

DATA = 'app/data/text.json'
DIR = 'Explanations'
STORE = os.path.join(DIR, 'quotes')
OUT = 'dist/drive'
# what has already been delivered, so a second run uploads only what changed
STATE = os.path.join(DIR, 'drive-state.json')

ANCHOR = re.compile(r'<!--\s*line\s+\d+\s*-\s*\d+\s*-->\n?')
QUOTE_LINK = re.compile(r'\[([^\]]*)\]\(quote:([A-Za-z0-9_-]+)\)')
TITLE_LINE = re.compile(r'^#\s+(.*)$', re.M)
# Drive's Markdown import mangles characters outside the basic plane — the
# rubric's 🦴 comes back as mojibake — so they are dropped on the way out.
# The repository copy keeps them; the viewer renders them correctly.
ASTRAL = re.compile(r'[\U00010000-\U0010FFFF]')


def for_drive(text):
    return re.sub(r'[ \t]+$', '', ASTRAL.sub('', text), flags=re.M)


def load():
    doc = json.load(open(DATA, encoding='utf-8'))
    try:
        index = json.load(open(os.path.join(STORE, 'index.json'),
                               encoding='utf-8'))
    except OSError:
        index = {}
    return doc, index


def sections(doc):
    """The text's own top-level divisions, from the dkar chag.

    A handful of sub-headings were centred in the dkar chag and came out of
    parsing marked level 0.  The outline's own convention tells them apart: a
    sub-heading opens with an ordinal — དང་པོ, གཉིས་པ and so on — and a
    division never does.  Divisions are also short, being the names printed as
    running heads.
    """
    ordinal = re.compile(
        r'^(དང་པོ|གཉིས་པ|གསུམ་པ|བཞི་པ|ལྔ་པ|དྲུག་པ|བདུན་པ|བརྒྱད་པ|དགུ་པ|བཅུ)')

    def is_division(label):
        return bool(label) and len(label) <= 40 and not ordinal.match(label)

    seen, out = set(), []
    for entry in doc['toc']:
        if entry['level'] != 0 or not entry.get('page'):
            continue
        # the division's name is the first clause; anything after it ran on
        # from the following line
        label = re.split(r'[།༎]', entry['label'])[0].strip()
        label = re.sub(r'^\d+', '', label).strip()
        if not is_division(label) or entry['page'] in seen:
            continue
        seen.add(entry['page'])
        out.append({'page': entry['page'], 'label': label + '།'})
    out.sort(key=lambda s: s['page'])

    for i, section in enumerate(out):
        section['until'] = (out[i + 1]['page'] - 1 if i + 1 < len(out)
                            else doc['meta']['bodyLastPage'])
        section['number'] = i + 1
        section['paragraphs'] = []

    for para in doc['paragraphs']:
        home = None
        for section in out:
            if section['page'] <= para['page'] <= section['until']:
                home = section
        if home is None:                       # the title page, before it all
            home = out[0]
        home['paragraphs'].append(para)
    return [s for s in out if s['paragraphs']]


# ext4 caps a filename at 255 bytes; leave room for a '.json' suffix.
LIMIT = 200


def blockquote(text):
    """Quote every line, not just the first.

    A quotation lifted from a source keeps that source's line breaks, and a
    verse runs to several lines. Marking only the first leaves the rest as
    ordinary paragraphs outside the quote.
    """
    lines = [ln.strip() for ln in text.strip().splitlines()]
    return '\n'.join('> ' + ln if ln else '>' for ln in lines)


def safe(name):
    """A filename Drive and every filesystem will accept.

    The cap is in bytes, not characters: a Tibetan title is three bytes per
    character in UTF-8, so 120 characters can be 360 bytes and ext4 refuses
    anything past 255. Truncated names carry a digest of the full title so
    two commentaries that share a long opening cannot land on one file. Only
    the filename is shortened — the manifest keeps the full Drive title.
    """
    name = re.sub(r'[\\/:*?"<>|]', '·', name).strip()
    name = re.sub(r'\s+', ' ', name)
    encoded = name.encode('utf-8')
    if len(encoded) <= LIMIT:
        return name
    digest = hashlib.sha1(encoded).hexdigest()[:10]
    keep = encoded[:LIMIT - len(digest) - 1].decode('utf-8', 'ignore').rstrip()
    return f'{keep} {digest}'


def analysis_title(text, para):
    match = TITLE_LINE.search(text)
    return match.group(1).strip() if match else f"Paragraph {para['id']}"


def render(text, para, index):
    """The reading version: no anchors, quotations resolved and attributed."""
    used, seen = [], {}

    def swap(match):
        label, quote_id = match.group(1), match.group(2)
        record = index.get(quote_id)
        if record is None:
            return label
        if quote_id not in seen:
            used.append({'id': quote_id, **record})
            seen[quote_id] = len(used)
        return f'{label} [{seen[quote_id]}]'

    body = QUOTE_LINK.sub(swap, ANCHOR.sub('', text))
    body = re.sub(r'\n{3,}', '\n\n', body).strip()

    head = [
        f"**{para['id']} · PDF page {para['page']}"
        + (f"–{para['endPage']}" if para['endPage'] != para['page'] else '')
        + f" · folio {para['folio']}**",
        '',
        '> ' + para['text'].replace('\n', ' '),
        '',
        '---',
    ]

    tail = []
    if used:
        tail = ['', '---', '', '## Sources cited', '']
        for i, quote in enumerate(used, start=1):
            source = quote['source']
            tier = f" · tier {quote['tier']}" if quote.get('tier') else ''
            tail.append(f"**[{i}]** {source['author']} · *{source['title']}*"
                        f"{tier}")
            tail.append('')
            tail.append(blockquote(quote['text']))
            tail.append('')
            loc = quote['location']
            tail.append(f"`{source['file']}` — character {loc['offset']}, "
                        f"line {loc['line']}, {loc['length']} characters, "
                        f"match {loc['match']}")
            if quote.get('note'):
                tail.append('')
                tail.append(f"*{quote['note']}*")
            tail.append('')

    lines = body.split('\n')
    if lines and lines[0].startswith('# '):
        out = [lines[0], ''] + head + lines[1:] + tail
    else:
        out = head + lines + tail
    return for_drive('\n'.join(out))


def contents_doc(doc, secs, done):
    lines = ['# སྐབས་དང་པོའི་སྤྱི་དོན། — Contents', '',
             f"{len(done)} of {len(doc['paragraphs'])} paragraphs analysed.",
             '']
    for section in secs:
        have = [p for p in section['paragraphs'] if p['id'] in done]
        lines.append(f"## {section['number']:02d} · {section['label']} "
                     f"· pages {section['page']}–{section['until']}")
        lines.append('')
        lines.append(f"{len(have)} of {len(section['paragraphs'])} analysed.")
        lines.append('')
        for para in section['paragraphs']:
            mark = '' if para['id'] in done else '  *(not yet written)*'
            title = done.get(para['id'], '')
            lines.append(f"- **{para['id']}** · page {para['page']} — "
                         f"{title}{mark}")
        lines.append('')
    return '\n'.join(lines)


def readme_doc(doc, secs, done, index):
    return '\n'.join([
        '# སྐབས་དང་པོའི་སྤྱི་དོན། — analyses',
        '',
        "Paragraph-by-paragraph analyses of རྗེ་བཙུན་ཆོས་ཀྱི་རྒྱལ་མཚན།'s "
        'སྐབས་དང་པོའི་སྤྱི་དོན།, the first-chapter general-meaning text of the '
        'Sera Jey Prajñāpāramitā curriculum.',
        '',
        '## What is here',
        '',
        f"- **{len(done)} of {len(doc['paragraphs'])} paragraphs** analysed, "
        f'in {len(secs)} folders following the text\'s own dkar chag '
        'divisions.',
        '- **00 · Contents** lists every paragraph, its page, and its title.',
        '- **Sources cited** gathers every quotation by the commentary it '
        'comes from — a citation index across the whole work.',
        '- **Source files** holds the exact Markdown and the quotation '
        'records, for anyone who wants to re-import them.',
        '',
        '## How each analysis is built',
        '',
        'Every one follows the same six sections: the passage and its context; '
        'a clause-by-clause translation; where the passage sits in the '
        'Abhisamayālaṃkāra, in Haribhadra, and in this text\'s own outline; '
        'the philosophical exposition; the points genuinely in dispute; and '
        'the technical terminology.',
        '',
        'A paragraph number like **p012** is the paragraph\'s position in the '
        'text. PDF page numbers are the pages of the '
        'སྐབས་དང་པོའི་སྤྱི་དོན།.pdf scan, so they can be read side by side '
        'with it; the folio is the number printed on the page itself.',
        '',
        '## About the quotations',
        '',
        f'The {len(index)} quotations cited across these analyses were each '
        'located in the commentary they are attributed to, and the character '
        'offset given under every citation is where it actually sits in that '
        'file. Nothing is quoted from memory.',
        '',
        'A **tier** marks how close a source stands to this curriculum: tier 1 '
        'is སྐབས་དང་པོའི་སྤྱི་དོན། itself and Jetsun Chökyi Gyaltsen\'s other '
        'works, and the numbers rise as the source moves further away. A lower '
        'tier is not better scholarship, only nearer to hand; where sources '
        'genuinely disagree, the analyses say so rather than preferring the '
        'nearer one.',
        '',
        '## Where an analysis is thin',
        '',
        'The analyses say when the evidence for a reading is thin, and when a '
        'passage\'s place in the outline is genuinely unclear. Those remarks '
        'are findings about the text, not gaps in the work.',
    ])


def sources_doc(filename, meta, quotes, para_titles):
    lines = [f"# {meta['author']} · {meta['title']}", '']
    if meta.get('tier'):
        lines += [f"Tier {meta['tier']}.", '']
    count = len(quotes)
    lines += [f"`{filename}`", '',
              f"{count} passage{'' if count == 1 else 's'} "
              f"{'is' if count == 1 else 'are'} cited from this text across "
              'the analyses.', '']
    for quote in sorted(quotes, key=lambda q: q['location']['offset']):
        para = quote['paragraph']
        lines.append(f"## {para} — {para_titles.get(para, '')}")
        lines.append('')
        lines.append(blockquote(quote['text']))
        lines.append('')
        loc = quote['location']
        lines.append(f"Character {loc['offset']}, line {loc['line']}, "
                     f"{loc['length']} characters, match {loc['match']}.")
        if quote.get('note'):
            lines.append('')
            lines.append(f"*{quote['note']}*")
        lines.append('')
    return '\n'.join(lines)


def main():
    doc, index = load()
    secs = sections(doc)
    paras = {p['id']: p for p in doc['paragraphs']}

    have = {}
    for name in os.listdir(DIR):
        if not name.endswith('.md'):
            continue
        para_id = name[:-3]
        if para_id in paras:
            have[para_id] = open(os.path.join(DIR, name),
                                 encoding='utf-8').read()
    titles = {pid: analysis_title(text, paras[pid])
              for pid, text in have.items()}

    if '--stats' in sys.argv:
        print(f'{len(have)} analyses, {len(index)} quotations, '
              f'{len(secs)} sections')
        for section in secs:
            done = sum(1 for p in section['paragraphs'] if p['id'] in have)
            print(f"  {section['number']:02d} {section['label'][:40]:<42} "
                  f"{done:>3}/{len(section['paragraphs']):<3} "
                  f"pages {section['page']}–{section['until']}")
        return 0

    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)
    manifest = []

    def emit(folder, title, body, mime='text/markdown', source=None):
        suffix = ('.json' if mime == 'application/json'
                  else os.path.splitext(source)[1] if source else '.md')
        rel = os.path.join(folder, safe(title) + suffix)
        path = os.path.join(OUT, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if source is None:
            open(path, 'w', encoding='utf-8').write(body)
        else:
            shutil.copyfile(source, path)
        manifest.append({'folder': folder, 'title': title, 'file': rel,
                         'mime': mime,
                         'convert': mime == 'text/markdown'})

    emit('', '00 · Read me', for_drive(readme_doc(doc, secs, have, index)))
    emit('', '00 · Contents', for_drive(contents_doc(doc, secs, titles)))

    for section in secs:
        folder = safe(f"{section['number']:02d} · {section['label']} · "
                      f"pages {section['page']}–{section['until']}")
        for para in section['paragraphs']:
            if para['id'] not in have:
                continue
            number = int(re.sub(r'\D', '', para['id']))
            title = (f"p{number:03d} · page {para['page']} · "
                     f"{titles[para['id']]}")
            emit(folder, title, render(have[para['id']], para, index))

    # every quotation, gathered by the commentary it comes from
    by_source = {}
    for quote in index.values():
        by_source.setdefault(quote['source']['file'], []).append(quote)
    for filename, quotes in sorted(by_source.items()):
        meta = dict(quotes[0]['source'], tier=quotes[0].get('tier'))
        title = f"{meta['author']} · {meta['title']}"
        emit('Sources cited', title,
             for_drive(sources_doc(filename, meta, quotes, titles)))

    # the exact files, unconverted, for anyone re-importing them
    for para_id in sorted(have, key=lambda p: int(re.sub(r'\D', '', p))):
        emit('Source files/Analyses', para_id,
             None, mime='text/markdown',
             source=os.path.join(DIR, f'{para_id}.md'))
    # one record per paragraph rather than the repository's per-commentary
    # filing: in Drive these are a machine-readable backup, and thirty folders
    # of JSON would be clutter beside the analyses they belong to
    per_para = {}
    for quote in index.values():
        per_para.setdefault(quote['paragraph'], []).append(quote)
    for para_id, quotes in sorted(per_para.items(),
                                  key=lambda kv: int(re.sub(r'\D', '', kv[0]))):
        payload = json.dumps(
            {'paragraph': para_id,
             'quotes': sorted(quotes, key=lambda q: q['id'])},
            ensure_ascii=False, indent=2) + '\n'
        emit('Source files/Quotations', para_id, payload,
             mime='application/json')

    state = load_state()
    for row in manifest:
        row['convert'] = (row['mime'] == 'text/markdown'
                          and not row['file'].startswith('Source files'))
        row['key'] = (f"{row['folder']}/{row['title']}" if row['folder']
                      else row['title'])
        row['hash'] = hashlib.sha256(
            open(os.path.join(OUT, row['file']), 'rb').read()).hexdigest()[:16]
        row['parentId'] = state['folders'].get(row['folder']) or state['root']
        known = state['files'].get(row['key'])
        if known is None:
            row['action'] = 'create'
        elif known.get('hash') != row['hash']:
            row['action'] = 'update'
            row['fileId'] = known['id']
        else:
            row['action'] = 'skip'

    folders = sorted({row['folder'] for row in manifest if row['folder']})
    todo = [row for row in manifest if row['action'] != 'skip']
    missing = [f for f in folders if f not in state['folders']]

    with open(os.path.join(OUT, '_manifest.json'), 'w', encoding='utf-8') as fh:
        json.dump({'driveFolder': 'Explanations',
                   'rootId': state['root'],
                   'foldersToCreate': missing,
                   'files': todo}, fh, ensure_ascii=False, indent=2)

    print(f'{len(manifest)} files in {len(folders) + 1} folders -> {OUT}')
    print(f'  {len(have)} analyses, {len(index)} quotations, '
          f'{len(by_source)} commentaries cited')
    print(f'  to upload: {len(todo)} '
          f"({sum(1 for r in todo if r['action'] == 'create')} new, "
          f"{sum(1 for r in todo if r['action'] == 'update')} changed), "
          f'{len(manifest) - len(todo)} unchanged')
    if missing:
        print(f'  folders to create first: {len(missing)}')
    print(f'  manifest: {OUT}/_manifest.json')
    return 0


def load_state():
    try:
        state = json.load(open(STATE, encoding='utf-8'))
    except OSError:
        state = {}
    state.setdefault('root', None)
    state.setdefault('folders', {})
    state.setdefault('files', {})
    return state


if __name__ == '__main__':
    sys.exit(main())
