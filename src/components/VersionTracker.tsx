import { versionWarnings, versions } from '../content/bundled';
import { InlineMd } from './Markdown';

/** The version tracker on the Notes page, between the personal notes and the known issues. Content: content/versions.csv. */
export function VersionTrackerSection({ id }: { id?: string }) {
  return (
    <section id={id} className="stack" style={{ gap: 8 }}>
      <h2>Version Tracker</h2>
      {versionWarnings.length > 0 && (
        <ul className="notice" style={{ paddingLeft: 28, margin: 0 }}>
          {versionWarnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {versions.length === 0 ? (
        <p className="panel muted">No versions recorded yet.</p>
      ) : (
        <div className="panel version-panel">
          <table className="data-table version-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Date</th>
                <th>Description</th>
                <th>Author</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((v, i) => (
                <tr key={`${v.version}-${i}`}>
                  <td className="nowrap">{v.version}</td>
                  <td className="nowrap">{v.date}</td>
                  <td>
                    <InlineMd text={v.description} />
                  </td>
                  <td className="nowrap">{v.author}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
