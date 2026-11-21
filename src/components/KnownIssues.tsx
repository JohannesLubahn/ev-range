import { contentWarnings, knownIssues } from '../content/bundled';
import { ISSUE_STATUS_LABEL, type KnownIssue } from '../content/parse';
import { InlineMd } from './Markdown';

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

/** The known-issues section of the Notes page. Content: content/known_issues.csv (see content/README.md). */
export function KnownIssuesSection({ id }: { id?: string }) {
  const open = knownIssues.filter((i) => i.status === 'open');
  const closed = knownIssues.filter((i) => i.status !== 'open');
  return (
    <section id={id} className="stack" style={{ gap: 8 }}>
      <div className="stack" style={{ gap: 2 }}>
        <h2>Known issues</h2>
        <p className="muted">Where the model or the app is known to be wrong or incomplete.</p>
      </div>
      {contentWarnings.length > 0 && (
        <ul className="notice" style={{ paddingLeft: 28, margin: 0 }}>
          {contentWarnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {knownIssues.length === 0 ? (
        <p className="panel muted">No known issues recorded yet.</p>
      ) : (
        <>
          {open.length ? (
            <ul className="issue-list">
              {open.map((i) => (
                <IssueItem key={i.id} issue={i} />
              ))}
            </ul>
          ) : (
            <p className="muted">No open issues.</p>
          )}
          {closed.length > 0 && (
            <details>
              <summary className="muted">Closed ({closed.length})</summary>
              <ul className="issue-list" style={{ marginTop: 8 }}>
                {closed.map((i) => (
                  <IssueItem key={i.id} issue={i} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
