import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './components/toast';
import ErrorBoundary from './components/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Outermost, so a crash in routing or in a provider still renders a recovery screen. */}
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
