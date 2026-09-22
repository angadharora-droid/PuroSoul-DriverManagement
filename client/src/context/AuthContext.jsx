import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getAuth, setAuth, verifySession } from '../api/client';
import { resolveSsoToken, ssoEnabled, ssoLogout } from '../lib/sso';
import { Spinner } from '../components/ui';

const AuthContext = createContext(null);

/**
 * Central sign-on: with no usable saved session, the portal cookie may still
 * identify this visitor. Exchanges the portal's hand-off token for the same
 * { token, user } the matching role login returns and saves it the same way.
 * Null when SSO is off, the visitor is not signed in to the portal, or no
 * account here is linked.
 */
async function restoreFromSso() {
  const token = await resolveSsoToken();
  if (!token) return null;
  try {
    const data = await api.post('/api/auth/sso', { token });
    const next = { token: data.token, user: data.user };
    setAuth(next);
    return next;
  } catch {
    return null;
  }
}

const LOGIN_PATHS = {
  admin: '/api/auth/admin/login',
  receiver: '/api/auth/receiver/login',
  collector: '/api/auth/collector/login',
};

export function AuthProvider({ children }) {
  const [auth, setAuthState] = useState(getAuth);
  // A restored session is only trusted once the API confirms it: a token that
  // expired, was revoked, or belongs to a deactivated account is dropped here
  // rather than breaking the first screen the user lands on.
  // Also true when there is no saved session but central sign-on is configured:
  // the portal cookie may sign the visitor in before the login screen shows.
  const [checking, setChecking] = useState(() => !!auth || ssoEnabled());

  useEffect(() => {
    if (!checking) return;
    let cancelled = false;
    (async () => {
      const saved = getAuth() ? await verifySession() : null;
      return saved || restoreFromSso();
    })()
      // Never leave the app on the splash: if the check itself fails
      // (e.g. storage is blocked), fall through to the login screen.
      .catch(() => null)
      .then((next) => {
        if (cancelled) return;
        setAuthState(next);
        setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [checking]);

  const login = useCallback(async (role, credentials) => {
    const path = LOGIN_PATHS[role] || LOGIN_PATHS.collector;
    const data = await api.post(path, credentials);
    const next = { token: data.token, user: data.user };
    setAuth(next);
    setAuthState(next);
    return next.user;
  }, []);

  const logout = useCallback(() => {
    ssoLogout(); // end the portal session too, or the next load signs back in
    setAuth(null);
    setAuthState(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user: auth?.user || null, login, logout }}>
      {checking ? (
        <div className="flex min-h-dvh items-center justify-center text-brand-700">
          <Spinner className="h-8 w-8" />
        </div>
      ) : (
        children
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
