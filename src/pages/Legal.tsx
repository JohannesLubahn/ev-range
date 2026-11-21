import { Markdown } from '../components/Markdown';
import { legalNotice } from '../content/bundled';

/** Content: content/legal.md. Its "# Legal notice" heading is the page title. */
export function LegalPage() {
  return (
    <div className="text-page">
      <div className="panel">
        <Markdown source={legalNotice} />
      </div>
    </div>
  );
}
