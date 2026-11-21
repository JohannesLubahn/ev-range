import { Markdown } from '../components/Markdown';
import { notes } from '../content/bundled';
import { parseBlocks } from '../content/markdown';

/** A note without its title heading (the page shows the title itself). */
function body(md: string): string {
  const first = parseBlocks(md)[0];
  return first?.type === 'heading' && first.level === 1 ? md.replace(/^\s*(<!--[\s\S]*?-->\s*)*#\s+.*$/m, '') : md;
}

/** Content: one Markdown file per note in content/notes/ (see content/README.md). */
export function NotesPage() {
  return (
    <div className="text-page">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <h1>Notes</h1>
          <p className="muted">Personal notes on the cars, the model and this project.</p>
        </div>
      </div>
      {notes.length === 0 ? (
        <p className="panel muted">No notes yet.</p>
      ) : (
        <div className="stack">
          {notes.map((n) => (
            <article key={n.slug} className="panel note">
              <header>
                <h2>{n.title}</h2>
                {n.date && (
                  <time className="faint" dateTime={n.date}>
                    {n.date}
                  </time>
                )}
              </header>
              <Markdown source={body(n.markdown)} shift={1} />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
