import { createContext, useCallback, useContext, useRef, useState } from 'react';
import Icon from './icons';

const ToastContext = createContext(() => {});

/** toast('Saved', 'success' | 'error' | 'info') — auto-dismisses, aria-live polite. */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const toast = useCallback((message, kind = 'success') => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const styles = {
    success: 'border-brand-200 bg-brand-50 text-brand-900',
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
  };
  const icons = { success: 'check-circle', error: 'warning', info: 'info' };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg shadow-slate-900/5 animate-toast-in ${styles[t.kind]}`}
          >
            <Icon name={icons[t.kind]} className="h-5 w-5 shrink-0" />
            <span className="min-w-0">{t.message}</span>
            <button
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="ml-auto shrink-0 rounded-md p-0.5 opacity-60 hover:opacity-100"
              aria-label="Dismiss notification"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
