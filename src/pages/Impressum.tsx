import { Markdown } from '../components/Markdown';
import { impressum } from '../content/bundled';

/** Content: content/impressum.md. Its "# Impressum" heading is the page title. */
export function ImpressumPage() {
  return (
    <div className="text-page">
      <div className="panel">
        <Markdown source={impressum} />
      </div>
    </div>
  );
}
