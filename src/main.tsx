import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { EngineProvider } from './state/engine';
import { applySharedFromUrl, isEnthusiastHash, useStore } from './state/store';
import './fonts.css';
import './styles.css';

// A share link or a link to one of the full site's pages opens the Enthusiast mode.
if (applySharedFromUrl() || isEnthusiastHash(window.location.hash)) useStore.getState().setMode('enthusiast');

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <EngineProvider>
      <App />
    </EngineProvider>
  </StrictMode>,
);
