import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { DataProvider } from './contexts/DataContext';
import { AccessibilityProvider } from './contexts/AccessibilityContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccessibilityProvider>
      <DataProvider>
        <App />
      </DataProvider>
    </AccessibilityProvider>
  </StrictMode>,
);
