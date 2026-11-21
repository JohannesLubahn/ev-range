/**
 * A small Markdown reader for the text pages (known issues, notes, impressum). It covers what those pages need
 * and nothing more: headings (#, ##, ###), paragraphs, bullet and numbered lists, block quotes, horizontal rules,
 * and inline **bold**, *italic* / _italic_, `code` and [links](url). HTML comments are dropped, so a file can
 * carry hints for whoever writes it. Raw HTML is shown as text: the pages never inject markup.
 */

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'rule' };

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong' | 'em' | 'code'; text: string }
  | { type: 'link'; text: string; href: string };

const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

export function stripComments(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, '');
}

export function parseBlocks(md: string): Block[] {
  const lines = stripComments(md).replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let quote: string[] = [];

  const flush = () => {
    if (para.length) blocks.push({ type: 'paragraph', text: para.join(' ') });
    if (list) blocks.push({ type: 'list', ...list });
    if (quote.length) blocks.push({ type: 'quote', text: quote.join(' ') });
    para = [];
    list = null;
    quote = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    const h = /^(#{1,3})\s+(.*?)\s*#*$/.exec(t);
    if (h) {
      flush();
      blocks.push({ type: 'heading', level: h[1].length as 1 | 2 | 3, text: h[2] });
      continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(t)) {
      flush();
      blocks.push({ type: 'rule' });
      continue;
    }
    const q = /^>\s?(.*)$/.exec(t);
    if (q) {
      if (!quote.length) flush();
      quote.push(q[1]);
      continue;
    }
    const b = BULLET.exec(line) ?? NUMBERED.exec(line);
    if (b) {
      const ordered = !BULLET.test(line);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(b[1].trim());
      continue;
    }
    if (list && /^\s{2,}/.test(line)) {
      // An indented line continues the last list item.
      list.items[list.items.length - 1] += ' ' + t;
      continue;
    }
    if (list || quote.length) flush();
    para.push(t);
  }
  flush();
  return blocks;
}

/** Only these links are made clickable; anything else (javascript:, data:, ...) stays text. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^(https?:|mailto:)/i.test(h) || /^#[\w-]*$/.test(h)) return h;
  return null;
}

const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*?)\*|(?<![\w])_([^_\s][^_]*?)_(?![\w])/g;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ type: 'code', text: m[1] });
    else if (m[2] !== undefined) out.push({ type: 'strong', text: m[2] });
    else if (m[3] !== undefined) {
      const href = safeHref(m[4]);
      out.push(href ? { type: 'link', text: m[3], href } : { type: 'text', text: m[0] });
    } else out.push({ type: 'em', text: m[5] ?? m[6] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

/** The first level-1 heading, if any (a note's title). */
export function firstHeading(md: string): string | undefined {
  const b = parseBlocks(md).find((x) => x.type === 'heading' && x.level === 1);
  return b?.type === 'heading' ? b.text : undefined;
}
