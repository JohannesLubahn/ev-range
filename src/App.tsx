import { useEffect, useState } from 'react';
import { CalcDrawer } from './components/CalcDrawer';
import { CarPickerDrawer } from './components/CarPicker';
import { CartoonCar } from './components/CartoonCar';
import { Footer } from './components/Footer';
import { IconMonitor, IconMoon, IconSun } from './components/Icons';
import { Logo } from './components/Logo';
import { ModeSwitch } from './components/ModeSwitch';
import { AssumptionsPage } from './pages/Assumptions';
import { CarsPage } from './pages/Cars';
import { ComparePage } from './pages/Compare';
import { CostPage } from './pages/Cost';
import { LegalPage } from './pages/Legal';
import { NotesPage } from './pages/Notes';
import { PhysicsPage } from './pages/Physics';
import { BatteryLifePage, StressTestsPage } from './pages/StressTests';
import { useEngine } from './state/engine';
import { ALL_VIEWS, isEnthusiastHash, useStore, VIEW_ALIASES, VIEWS, type Mode, type Theme, type View } from './state/store';

function viewFromHash(): View {
  const h = window.location.hash.replace(/^#/, '');
  return ALL_VIEWS.find((v) => v.id === h)?.id ?? VIEW_ALIASES[h] ?? 'compare';
}

function useView(): View {
  const [view, setView] = useState<View>(viewFromHash);
  useEffect(() => {
    const on = () => setView(viewFromHash());
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
    };
  }, []);
  return view;
}

/** Sets data-theme only for an explicit choice in the app, and never removes a theme set by the host page. */
function useApplyTheme(theme: Theme) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      if (root.dataset.themeByApp) {
        delete root.dataset.theme;
        delete root.dataset.themeByApp;
      }
    } else {
      root.dataset.theme = theme;
      root.dataset.themeByApp = '1';
    }
  }, [theme]);
}

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<Theme, string> = { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' };

/** Goes to a page: '' is the start (the landing page in Fun-sized mode), without a bare '#' left in the address. */
function navigate(hash: string) {
  if (hash) window.location.hash = hash;
  else {
    window.history.pushState(null, '', window.location.pathname + window.location.search);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

export function App() {
  const view = useView();
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const mode = useStore((s) => s.mode);
  const setMode = useStore((s) => s.setMode);
  const { ds } = useEngine();
  useApplyTheme(theme);
  const fun = mode === 'fun';
  /** Fun-sized mode shows the landing page; only the legal notice (footer) is reachable from it. */
  const landing = fun && view !== 'legal';
  useEffect(() => {
    const label = ALL_VIEWS.find((v) => v.id === view)?.label;
    document.title = landing || view === 'compare' ? 'EV Range' : `${label} · EV Range`;
  }, [view, landing]);
  // A link to one of the full site's pages (typed in, or followed from a text) opens the Enthusiast mode.
  useEffect(() => {
    const on = () => {
      if (isEnthusiastHash(window.location.hash)) setMode('enthusiast');
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [setMode]);
  const changeMode = (m: Mode) => {
    setMode(m);
    navigate(m === 'enthusiast' ? '#compare' : '');
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a
            href={fun ? './' : '#compare'}
            onClick={(e) => {
              e.preventDefault();
              navigate(fun ? '' : '#compare');
            }}
            className="brand"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            <Logo size={26} />
            <span className="brand-name">EV Range</span>
          </a>
          {!fun && (
            <nav className="nav" aria-label="Views">
              {VIEWS.map((v) => (
                <a key={v.id} href={`#${v.id}`} aria-current={view === v.id ? 'page' : undefined}>
                  {v.label}
                </a>
              ))}
            </nav>
          )}
          <div className="topbar-tools">
            <ModeSwitch mode={mode} onChange={changeMode} />
            <button type="button" className="btn ghost" onClick={() => setTheme(NEXT_THEME[theme])} aria-label={THEME_LABEL[theme]} title={THEME_LABEL[theme]}>
              {theme === 'system' ? <IconMonitor /> : theme === 'light' ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </div>
      </header>
      <main className={landing ? 'wrap landing' : 'wrap'}>
        {ds.loadWarnings.length > 0 && (
          <details className="notice" style={{ marginBottom: 16 }}>
            <summary>{ds.loadWarnings.length} problems while reading the data files</summary>
            <ul>
              {ds.loadWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        )}
        {landing && <CartoonCar />}
        {!fun && view === 'compare' && <ComparePage />}
        {!fun && view === 'stress-tests' && <StressTestsPage />}
        {!fun && view === 'battery-life' && <BatteryLifePage />}
        {!fun && view === 'cost' && <CostPage />}
        {!fun && view === 'cars' && <CarsPage />}
        {!fun && view === 'physics' && <PhysicsPage />}
        {!fun && view === 'assumptions' && <AssumptionsPage />}
        {!fun && view === 'notes' && <NotesPage />}
        {view === 'legal' && <LegalPage />}
      </main>
      <Footer view={view} />
      {!fun && <CalcDrawer />}
      {!fun && <CarPickerDrawer />}
    </>
  );
}
