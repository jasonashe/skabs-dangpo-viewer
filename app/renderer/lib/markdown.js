// A small Markdown renderer, enough for the explanation files: headings,
// emphasis, code, blockquotes, lists, rules, tables of two columns and links.
//
// Two conventions on top of plain Markdown, both invisible to other Markdown
// tools:
//
//   <!--line 120-388-->   the blocks that follow explain characters 120..388
//                         of the paragraph; used by the translation lookup
//   [text](quote:q0042)   a quotation; a plain click opens the quote panel

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ESCAPES[c]);
}

function inline(src) {
  let out = escapeHtml(src);
  // code first, so nothing inside it is re-interpreted
  const code = [];
  out = out.replace(/`([^`]+)`/g, (_m, body) => {
    code.push(body);
    return `\u0000${code.length - 1}\u0000`;
  });
  out = out.replace(/\[([^\]]*)\]\(quote:([A-Za-z0-9_-]+)\)/g,
    (_m, label, id) =>
      `<span class="quote-ref" data-quote="${escapeHtml(id)}" tabindex="0" ` +
      `role="button">${label}</span>`);
  out = out.replace(/\[([^\]]*)\]\((https?:[^)\s]+)\)/g,
    (_m, label, href) => `<a href="${escapeHtml(href)}" target="_blank" ` +
      `rel="noopener">${label}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|\W)_([^_\n]+)_(?=\W|$)/g, '$1<em>$2</em>');
  out = out.replace(/\u0000(\d+)\u0000/g, (_m, i) => `<code>${escapeHtml(code[+i])}</code>`);
  return out;
}

const LINE_ANCHOR = /^<!--\s*line\s+(\d+)\s*-\s*(\d+)\s*-->\s*$/;

export function render(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let anchor = null;
  let openAnchor = false;
  let i = 0;

  const closeAnchor = () => {
    if (openAnchor) {
      out.push('</section>');
      openAnchor = false;
    }
  };
  const openAnchorIfNeeded = () => {
    if (anchor && !openAnchor) {
      out.push(`<section class="exp-line" data-start="${anchor[0]}" ` +
               `data-end="${anchor[1]}">`);
      openAnchor = true;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    const m = line.match(LINE_ANCHOR);
    if (m) {
      closeAnchor();
      anchor = [Number(m[1]), Number(m[2])];
      i += 1;
      continue;
    }
    if (/^<!--/.test(line.trim())) {           // any other comment: drop it
      while (i < lines.length && !/-->/.test(lines[i])) i += 1;
      i += 1;
      continue;
    }
    if (!line.trim()) { i += 1; continue; }

    if (/^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeAnchor();
      anchor = null;
      out.push('<hr>');
      i += 1;
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      openAnchorIfNeeded();
      const level = h[1].length;
      out.push(`<h${level}>${inline(h[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (/^ {0,3}>/.test(line)) {
      openAnchorIfNeeded();
      const buf = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i])) {
        buf.push(lines[i].replace(/^ {0,3}>\s?/, ''));
        i += 1;
      }
      out.push(`<blockquote>${render(buf.join('\n'))}</blockquote>`);
      continue;
    }

    if (/^ {0,3}```/.test(line)) {
      openAnchorIfNeeded();
      i += 1;
      const buf = [];
      while (i < lines.length && !/^ {0,3}```/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }

    const bullet = line.match(/^\s*([-*+]|\d+[.)])\s+/);
    if (bullet) {
      openAnchorIfNeeded();
      const ordered = /\d/.test(bullet[1]);
      const items = [];
      while (i < lines.length) {
        const mm = lines[i].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (!mm) {
          if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) {
            items[items.length - 1] += '\n' + lines[i].trim();
            i += 1;
            continue;
          }
          break;
        }
        if (ordered !== /\d/.test(mm[1])) break;
        items.push(mm[2]);
        i += 1;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>` +
        items.map((t) => `<li>${inline(t.replace(/\n/g, ' '))}</li>`).join('') +
        `</${tag}>`);
      continue;
    }

    // paragraph
    openAnchorIfNeeded();
    const buf = [];
    while (i < lines.length && lines[i].trim() &&
           !LINE_ANCHOR.test(lines[i]) &&
           !/^ {0,3}(#{1,6}\s|>|```|[-*+]\s|\d+[.)]\s|-{3,}\s*$)/.test(lines[i])) {
      buf.push(lines[i].trim());
      i += 1;
    }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  closeAnchor();
  return out.join('');
}
