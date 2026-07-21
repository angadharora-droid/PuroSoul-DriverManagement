import { Component } from 'react';
import { setAuth } from '../api/client';
import { Button } from './ui';
import Icon from './icons';

/**
 * Clears everything the app could have left in a bad state — saved session,
 * per-tab state, and any browser/PWA cache — then reloads from a fresh URL so
 * the browser cannot hand back the build that just crashed.
 */
async function resetAndReload() {
  try {
    setAuth(null);
    sessionStorage.clear();
  } catch {
    // Storage can be blocked (private mode); the reload below still helps.
  }
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // Best effort — never block the reload on cache cleanup.
  }
  window.location.replace(`/login?fresh=${Date.now()}`);
}

export default class ErrorBoundary extends Component {
  state = { error: null, resetting: false };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[ui] unhandled error', error, info?.componentStack);
  }

  handleReset = () => {
    this.setState({ resetting: true });
    // Reload regardless — a failed cleanup must not strand the button spinning.
    resetAndReload().catch(() => window.location.replace(`/login?fresh=${Date.now()}`));
  };

  handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error, resetting } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-pop">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <Icon name="warning" className="h-7 w-7" />
          </div>
          <h1 className="font-display text-xl font-bold tracking-tight text-slate-900">Something went wrong</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
            The screen failed to load. Resetting clears your saved session and loads the latest version — you'll need to log in again.
          </p>

          {error.message && (
            <p className="mt-4 truncate rounded-lg bg-slate-50 px-3 py-2 text-left font-mono text-xs text-slate-500" title={error.message}>
              {error.message}
            </p>
          )}

          <div className="mt-5 space-y-2">
            <Button className="w-full" icon="refresh" loading={resetting} onClick={this.handleReset}>
              {resetting ? 'Resetting…' : 'Reset and reload'}
            </Button>
            <Button variant="secondary" className="w-full" disabled={resetting} onClick={this.handleRetry}>
              Try again
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
