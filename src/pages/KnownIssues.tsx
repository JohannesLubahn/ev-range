import { InlineMd } from '../components/Markdown';
import { contentWarnings, knownIssues } from '../content/bundled';
import { ISSUE_STATUS_LABEL, type KnownIssue } from '../content/parse';

function IssueItem({ issue }: { issue: KnownIssue }) {
  return (
    <li className="issue">
      <div className="issue-head">
        <h3>
          <InlineMd text={issue.title} />
        </h3>
        <span className={`issue-status ${issue.status}`}>{ISSUE_STATUS_LABEL[issue.status]}</span>
      </div>
      {issue.details && (
        <p>
          <InlineMd text={issue.details} />
        </p>
      )}
      <p className="issue-meta faint">
        {[issue.area, issue.added && `added ${issue.added}`, issue.resolved && `${issue.status === 'fixed' ? 'fixed' : 'closed'} ${issue.resolved}`]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </li>
  );
}

/** Content: content/known_issues.csv (see content/README.md). */
export function KnownIssuesPage() {
  const open = knownIssues.filter((i) => i.status === 'open');
  const closed = knownIssues.filter((i) => i.status !== 'open');
  return (
    <div className="text-page">
      <div className="page-head">
        <div className="stack" style={{ gap: 4 }}>
          <h1>Known issues</h1>
          <p className="muted">Where the model or the app is known to be wrong or incomplete.</p>
        </div>
      </div>
      {contentWarnings.length > 0 && (
        <ul className="notice" style={{ marginBottom: 16, paddingLeft: 28 }}>
          {contentWarnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {knownIssues.length === 0 ? (
        <p className="panel muted">No known issues recorded yet.</p>
      ) : (
        <div className="stack">
          <section className="stack" style={{ gap: 8 }}>
            <h2>Open ({open.length})</h2>
            {open.length ? (
              <ul className="issue-list">
                {open.map((i) => (
                  <IssueItem key={i.id} issue={i} />
                ))}
              </ul>
            ) : (
              <p className="muted">None.</p>
            )}
          </section>
          {closed.length > 0 && (
            <details className="stack">
              <summary>
                <h2 style={{ display: 'inline' }}>Closed ({closed.length})</h2>
              </summary>
              <ul className="issue-list" style={{ marginTop: 8 }}>
                {closed.map((i) => (
                  <IssueItem key={i.id} issue={i} />
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
