import { createContext, useContext, useState, useCallback } from 'react';
import { api, getAuth, setAuth } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuthState] = useState(getAuth);

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

  return <AuthContext.Provider value={{ user: auth?.user || null, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
