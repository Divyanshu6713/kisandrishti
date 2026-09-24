import '@fontsource-variable/manrope';
import './styles/index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { useAuthStore } from './state/authStore';

// Restore any saved session before the first route renders (guarded routes wait on this).
useAuthStore.getState().init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
