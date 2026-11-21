import { useEffect } from 'react';
import { KnownIssuesSection } from '../components/KnownIssues';
import { Markdown } from '../components/Markdown';
import { notes } from '../content/bundled';
import { parseBlocks } from '../content/markdown';

/** A note without its title heading (the page shows the title itself). */
function body(md: string): string {
  const first = parseBlocks(md)[0];
  return first?.type === 'heading' && first.level === 1 ? md.replace(/^\s*(<!--[\s\S]*?-->\s*)*#\s+.*$/m, '') : md;
}

/**
 * Known issues (content/known_issues.csv) and personal notes (one Markdown file per note in content/notes/);
 * see content/README.md. The old address #known-issues opens this page at the known issues.
 */
export function NotesPage() {
  useEffect(() => {
    if (window.location.hash === '#known-issues') document.getElementById('known-issues')?.scrollIntoView();
  }, []);
  return (
    <div className="text-page">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <h1>Notes</h1>
          <p className="muted">Known issues, and personal notes on the cars, the model and this project.</p>
        </div>
      </div>
      <div className="stack" style={{ gap: 32 }}>
        <KnownIssuesSection id="known-issues" />
        <section className="stack" style={{ gap: 8 }}>
          <h2>Personal notes</h2>
          {notes.length === 0 ? (
            <p className="panel muted">No notes yet.</p>
          ) : (
            notes.map((n) => (
              <article key={n.slug} className="panel note">
                <header>
                  <h3>{n.title}</h3>
                  {n.date && (
                    <time className="faint" dateTime={n.date}>
                      {n.date}
                    </time>
                  )}
                </header>
                <Markdown source={body(n.markdown)} shift={2} />
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  );
}
