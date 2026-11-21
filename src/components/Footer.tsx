import { FOOTER_VIEWS, type View } from '../state/store';
import { Logo } from './Logo';

/** On every page: the legal notice, which must be reachable from everywhere. */
export function Footer({ view }: { view: View }) {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <span className="footer-brand">
          <Logo size={18} />
          EV Range
        </span>
        <nav className="footer-nav" aria-label="About this site">
          {FOOTER_VIEWS.map((v) => (
            <a key={v.id} href={`#${v.id}`} aria-current={view === v.id ? 'page' : undefined}>
              {v.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
