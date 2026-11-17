import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { EngineProvider } from './state/engine';
import { applySharedFromUrl } from './state/store';
import './styles.css';

applySharedFromUrl();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <EngineProvider>
      <App />
    </EngineProvider>
  </StrictMode>,
);
