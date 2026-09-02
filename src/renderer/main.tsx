import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/renderer/App';
import { AppErrorBoundary } from '@/renderer/components/AppErrorBoundary';
import './styles.css';

window.addEventListener('error', (event) => {
  window.desktop?.reportRendererError({
    event: 'window.error',
    message: event.message || 'Неизвестная ошибка renderer',
    stack: event.error instanceof Error ? event.error.stack : undefined
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  window.desktop?.reportRendererError({
    event: 'unhandledrejection',
    message: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined
  });
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
