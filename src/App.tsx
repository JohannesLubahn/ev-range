import { useEffect, useState } from 'react';
import { CalcDrawer } from './components/CalcDrawer';
import { IconBolt, IconMonitor, IconMoon, IconSun } from './components/Icons';
import { AssumptionsPage } from './pages/Assumptions';
import { CarsPage } from './pages/Cars';
import { ComparePage } from './pages/Compare';
import { CostPage } from './pages/Cost';
import { PhysicsPage } from './pages/Physics';
import { StressTestsPage } from './pages/StressTests';
import { useEngine } from './state/engine';
import { useStore, VIEWS, type Theme, type View } from './state/store';

function viewFromHash(): View {
  const h = window.location.hash.replace(/^#/, '');
  return (VIEWS.find((v) => v.id === h)?.id ?? 'compare') as View;
}

function useView(): View {
  const [view, setView] = useState<View>(viewFromHash);
  useEffect(() => {
    const on = () => setView(viewFromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
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

export function App() {
  const view = useView();
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const { ds } = useEngine();
  useApplyTheme(theme);
  useEffect(() => {
    const label = VIEWS.find((v) => v.id === view)?.label;
    document.title = view === 'compare' ? 'EV Compare' : `${label} · EV Compare`;
  }, [view]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#compare" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}>
            <IconBolt size={24} />
            EV Compare
          </a>
          <nav className="nav" aria-label="Views">
            {VIEWS.map((v) => (
              <a key={v.id} href={`#${v.id}`} aria-current={view === v.id ? 'page' : undefined}>
                {v.label}
              </a>
            ))}
          </nav>
          <div className="topbar-tools">
            <button type="button" className="btn ghost" onClick={() => setTheme(NEXT_THEME[theme])} aria-label={THEME_LABEL[theme]} title={THEME_LABEL[theme]}>
              {theme === 'system' ? <IconMonitor /> : theme === 'light' ? <IconSun /> : <IconMoon />}
            </button>
          </div>
        </div>
      </header>
      <main className="wrap">
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
        {view === 'compare' && <ComparePage />}
        {view === 'stress-tests' && <StressTestsPage />}
        {view === 'cost' && <CostPage />}
        {view === 'cars' && <CarsPage />}
        {view === 'physics' && <PhysicsPage />}
        {view === 'assumptions' && <AssumptionsPage />}
      </main>
      <CalcDrawer />
    </>
  );
}
