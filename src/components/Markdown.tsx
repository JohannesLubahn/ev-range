import { Fragment, useMemo } from 'react';
import { parseBlocks, parseInline } from '../content/markdown';

/** Inline Markdown (bold, italic, code, links) as React elements; never as raw HTML. */
export function InlineMd({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((t, i) => {
        switch (t.type) {
          case 'strong':
            return <strong key={i}>{t.text}</strong>;
          case 'em':
            return <em key={i}>{t.text}</em>;
          case 'code':
            return (
              <code key={i} className="mono">
                {t.text}
              </code>
            );
          case 'link': {
            const external = !t.href.startsWith('#');
            return (
              <a key={i} href={t.href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {t.text}
              </a>
            );
          }
          default:
            return <Fragment key={i}>{t.text}</Fragment>;
        }
      })}
    </>
  );
}

/**
 * A Markdown text (see src/content/markdown.ts for what is supported). `shift` moves headings down,
 * e.g. shift 1 shows "# Title" as an h2 inside a page that has its own h1.
 */
export function Markdown({ source, shift = 0 }: { source: string; shift?: number }) {
  const blocks = useMemo(() => parseBlocks(source), [source]);
  return (
    <div className="prose">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading': {
            const H = (['h1', 'h2', 'h3', 'h4'] as const)[Math.min(3, b.level - 1 + shift)];
            return (
              <H key={i}>
                <InlineMd text={b.text} />
              </H>
            );
          }
          case 'list': {
            const L = b.ordered ? 'ol' : 'ul';
            return (
              <L key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>
                    <InlineMd text={it} />
                  </li>
                ))}
              </L>
            );
          }
          case 'quote':
            return (
              <blockquote key={i}>
                <InlineMd text={b.text} />
              </blockquote>
            );
          case 'rule':
            return <hr key={i} />;
          default:
            return (
              <p key={i}>
                <InlineMd text={b.text} />
              </p>
            );
        }
      })}
    </div>
  );
}
