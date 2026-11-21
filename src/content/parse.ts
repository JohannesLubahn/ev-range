/**
 * Reads the site's text pages from content/ (see content/README.md): the known-issues list, the notes and the
 * impressum. Pure functions, so they can be tested without the bundler; src/content/bundled.ts feeds them the files.
 */
import { parseCsv } from '../data/parse';
import { firstHeading } from './markdown';

export const ISSUE_STATUSES = ['open', 'fixed', 'wontfix'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = { open: 'Open', fixed: 'Fixed', wontfix: "Won't fix" };

export interface KnownIssue {
  id: string;
  status: IssueStatus;
  /** Where it shows up: a page name (Compare, Stress tests, ...) or a part of the model. */
  area: string;
  title: string;
  /** Markdown (inline only). */
  details: string;
  /** Dates as written (YYYY-MM-DD). */
  added: string;
  resolved: string;
}

export const KNOWN_ISSUE_COLUMNS = ['id', 'status', 'area', 'title', 'details', 'added', 'resolved'] as const;

export function parseKnownIssues(csv: string, warnings: string[] = []): KnownIssue[] {
  const { rows, columns } = parseCsv(csv);
  for (const c of KNOWN_ISSUE_COLUMNS) if (!columns.includes(c)) warnings.push(`content/known_issues.csv: column "${c}" is missing`);
  const out: KnownIssue[] = [];
  rows.forEach((r, i) => {
    const where = `content/known_issues.csv, row ${i + 2}`;
    if (!r.title) {
      warnings.push(`${where}: no title, row skipped`);
      return;
    }
    const s = (r.status ?? '').toLowerCase().replace(/[\s'’-]/g, '');
    let status: IssueStatus = 'open';
    if ((ISSUE_STATUSES as readonly string[]).includes(s)) status = s as IssueStatus;
    else if (s) warnings.push(`${where}: status "${r.status}" is not one of ${ISSUE_STATUSES.join(', ')}; shown as open`);
    out.push({
      id: r.id || String(i + 1),
      status,
      area: r.area ?? '',
      title: r.title,
      details: r.details ?? '',
      added: r.added ?? '',
      resolved: r.resolved ?? '',
    });
  });
  return out;
}

export interface Note {
  /** File name without .md, e.g. "2026-11-21-battery-thoughts". */
  slug: string;
  /** From the file name (YYYY-MM-DD-...), or "" if the name has no date. */
  date: string;
  /** The note's first "# " heading, or the slug. */
  title: string;
  markdown: string;
}

/**
 * One note per Markdown file in content/notes/. Files whose name starts with "_" (like _template.md) are skipped.
 * Newest first; undated notes after the dated ones, by name.
 */
export function parseNotes(files: Record<string, string>): Note[] {
  const notes: Note[] = [];
  for (const [path, markdown] of Object.entries(files)) {
    const slug = path.split('/').pop()!.replace(/\.md$/i, '');
    if (slug.startsWith('_')) continue;
    const date = /^(\d{4}-\d{2}-\d{2})/.exec(slug)?.[1] ?? '';
    const title = firstHeading(markdown) ?? slug.replace(/^\d{4}-\d{2}-\d{2}-?/, '').replace(/[-_]+/g, ' ');
    notes.push({ slug, date, title, markdown });
  }
  return notes.sort((a, b) => (a.date && b.date ? b.date.localeCompare(a.date) : a.date ? -1 : b.date ? 1 : 0) || a.slug.localeCompare(b.slug));
}
