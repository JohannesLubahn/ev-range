import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { firstHeading, parseBlocks, parseInline, safeHref } from '../src/content/markdown';
import { parseKnownIssues, parseNotes } from '../src/content/parse';

describe('markdown subset', () => {
  it('reads headings, paragraphs, lists, quotes and rules; drops comments', () => {
    const md = [
      '<!-- a hint\nover two lines -->',
      '# Title',
      'First line',
      'continues here.',
      '',
      '## Part',
      '- one',
      '  more of one',
      '- two',
      '1. first',
      '2. second',
      '> quoted',
      '---',
    ].join('\n');
    expect(parseBlocks(md)).toEqual([
      { type: 'heading', level: 1, text: 'Title' },
      { type: 'paragraph', text: 'First line continues here.' },
      { type: 'heading', level: 2, text: 'Part' },
      { type: 'list', ordered: false, items: ['one more of one', 'two'] },
      { type: 'list', ordered: true, items: ['first', 'second'] },
      { type: 'quote', text: 'quoted' },
      { type: 'rule' },
    ]);
  });

  it('reads inline bold, italic, code and links', () => {
    expect(parseInline('a **b** *c* _d_ `e` [f](https://x.org) snake_case_name')).toEqual([
      { type: 'text', text: 'a ' },
      { type: 'strong', text: 'b' },
      { type: 'text', text: ' ' },
      { type: 'em', text: 'c' },
      { type: 'text', text: ' ' },
      { type: 'em', text: 'd' },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'e' },
      { type: 'text', text: ' ' },
      { type: 'link', text: 'f', href: 'https://x.org' },
      { type: 'text', text: ' snake_case_name' },
    ]);
  });

  it('makes only safe links clickable', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,x')).toBeNull();
    expect(safeHref('mailto:a@b.c')).toBe('mailto:a@b.c');
    expect(safeHref('#cars')).toBe('#cars');
    expect(parseInline('[x](javascript:alert(1))')[0].type).toBe('text');
  });

  it('finds the title', () => {
    expect(firstHeading('<!-- c -->\n\n# Hello *there*\n\ntext')).toBe('Hello *there*');
    expect(firstHeading('## not a title')).toBeUndefined();
  });
});

describe('known issues', () => {
  it('reads rows, defaults and warns on bad status or missing title', () => {
    const w: string[] = [];
    const csv = [
      'id,status,area,title,details,added,resolved',
      'a,open,Compare,First,"Has, commas",2026-11-21,',
      'b,Won\'t fix,Physics,Second,,2026-11-01,2026-11-02',
      ',maybe,,Third,,,',
      'd,fixed,,,,,',
    ].join('\n');
    const issues = parseKnownIssues(csv, w);
    expect(issues.map((i) => [i.id, i.status, i.title])).toEqual([
      ['a', 'open', 'First'],
      ['b', 'wontfix', 'Second'],
      ['3', 'open', 'Third'],
    ]);
    expect(issues[0].details).toBe('Has, commas');
    expect(w).toHaveLength(2);
  });

  it('the shipped file has the right columns and no warnings', () => {
    const w: string[] = [];
    parseKnownIssues(readFileSync('content/known_issues.csv', 'utf8'), w);
    expect(w).toEqual([]);
  });
});

describe('notes', () => {
  it('skips templates, takes date from the name and title from the first heading, newest first', () => {
    const notes = parseNotes({
      '/content/notes/2026-01-05-old.md': '# Old one\n\ntext',
      '/content/notes/2026-11-21-new-idea.md': 'no heading',
      '/content/notes/undated.md': '# Undated',
      '/content/notes/_template.md': '# Template',
    });
    expect(notes.map((n) => [n.slug, n.date, n.title])).toEqual([
      ['2026-11-21-new-idea', '2026-11-21', 'new idea'],
      ['2026-01-05-old', '2026-01-05', 'Old one'],
      ['undated', '', 'Undated'],
    ]);
  });
});

describe('impressum', () => {
  it('has its title and the § 5 DDG section', () => {
    const md = readFileSync('content/impressum.md', 'utf8');
    expect(firstHeading(md)).toBe('Impressum');
    expect(parseBlocks(md).some((b) => b.type === 'heading' && b.text.includes('§ 5 DDG'))).toBe(true);
    expect(readdirSync('content/notes').every((f) => f.endsWith('.md'))).toBe(true);
  });
});
