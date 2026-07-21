import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getAuth, setAuth, verifySession } from '../api/client';
import { Spinner } from '../components/ui';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuthState] = useState(getAuth);
  // A restored session is only trusted once the API confirms it: a token that
  // expired, was revoked, or belongs to a deactivated account is dropped here
  // rather than breaking the first screen the user lands on.
  const [checking, setChecking] = useState(() => !!auth);

  useEffect(() => {
    if (!checking) return;
    let cancelled = false;
    verifySession()
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
    const path = role === 'admin' ? '/api/auth/admin/login' : '/api/auth/collector/login';
    const data = await api.post(path, credentials);
    const next = { token: data.token, user: data.user };
    setAuth(next);
    setAuthState(next);
    return next.user;
  }, []);

  const logout = useCallback(() => {
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
