import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppShell from './app/AppShell';
import { DataProvider } from './contexts/DataContext';
import { AccessibilityProvider } from './contexts/AccessibilityContext';

const root = createRoot(document.getElementById('root')!)
const showKitGallery = import.meta.env.DEV
  && new URLSearchParams(window.location.search).get('v') === '__kit'

if (showKitGallery) {
  void import('./app/KitGallery').then(({ default: KitGallery }) => {
    root.render(<StrictMode><KitGallery /></StrictMode>)
  })
} else {
  root.render(
    <StrictMode>
      <AccessibilityProvider>
        <DataProvider>
          <AppShell />
        </DataProvider>
      </AccessibilityProvider>
    </StrictMode>
  )
}
