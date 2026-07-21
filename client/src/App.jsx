import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import NewCollection from './pages/collector/NewCollection';
import Handover from './pages/collector/Handover';
import History from './pages/collector/History';
import Collections from './pages/admin/Collections';
import Parties from './pages/admin/Parties';
import Collectors from './pages/admin/Collectors';
import Receivers from './pages/admin/Receivers';
import Admins from './pages/admin/Admins';
import Reports from './pages/admin/Reports';
import Settings from './pages/admin/Settings';

function RequireRole({ role, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  return children;
}

const collectorLinks = [
  { to: '/', label: 'New collection', icon: 'banknotes', end: true },
  { to: '/handover', label: 'Handover', icon: 'arrows-right-left' },
  { to: '/history', label: 'My history', icon: 'clock' },
];

const adminLinks = [
  { to: '/admin', label: 'Collections', icon: 'banknotes', end: true },
  { to: '/admin/reports', label: 'Reports', icon: 'chart-bar' },
  { to: '/admin/parties', label: 'Parties', icon: 'storefront' },
  { to: '/admin/collectors', label: 'Collectors', icon: 'truck' },
  { to: '/admin/receivers', label: 'Receivers', icon: 'inbox' },
  { to: '/admin/admins', label: 'Admins', icon: 'shield' },
  { to: '/admin/settings', label: 'Settings', icon: 'adjustments' },
];

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace /> : <Login />} />

      <Route
        element={
          <RequireRole role="collector">
            <Layout links={collectorLinks} />
          </RequireRole>
        }
      >
        <Route path="/" element={<NewCollection />} />
        <Route path="/handover" element={<Handover />} />
        <Route path="/history" element={<History />} />
      </Route>

      <Route
        element={
          <RequireRole role="admin">
            <Layout links={adminLinks} />
          </RequireRole>
        }
      >
        <Route path="/admin" element={<Collections />} />
        <Route path="/admin/reports" element={<Reports />} />
        <Route path="/admin/parties" element={<Parties />} />
        <Route path="/admin/collectors" element={<Collectors />} />
        <Route path="/admin/receivers" element={<Receivers />} />
        <Route path="/admin/admins" element={<Admins />} />
        <Route path="/admin/settings" element={<Settings />} />
      </Route>

      <Route path="*" element={<Navigate to={user ? (user.role === 'admin' ? '/admin' : '/') : '/login'} replace />} />
    </Routes>
  );
}
