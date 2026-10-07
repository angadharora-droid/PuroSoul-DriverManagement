import { useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { api } from './api/client';
import Layout from './components/Layout';
import Icon from './components/icons';
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
import Events from './pages/admin/Events';
import EventDetail from './pages/admin/EventDetail';
import EventBilling from './pages/events/EventBilling';
import EventStock from './pages/events/EventStock';

function RequireRole({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to={user.role === 'admin' ? '/admin' : '/'} replace />;
  return children;
}

const collectorLinks = [
  { to: '/', label: 'New collection', icon: 'banknotes', end: true },
  { to: '/handover', label: 'Handover', icon: 'arrows-right-left' },
  { to: '/history', label: 'My history', icon: 'clock' },
];

const EVENT_LINKS = {
  billing: { to: '/events/billing', label: 'Event billing', icon: 'ticket' },
  stock: { to: '/events/stock', label: 'Event stock', icon: 'cube' },
};

/**
 * Collector / receiver shell. The event tab appears only for people assigned
 * to an open event — collectors who bill there, or its stock-keeping receiver.
 */
function FieldLayout() {
  const { user } = useAuth();
  const [eventLink, setEventLink] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/api/events/mine')
      .then((d) => !cancelled && setEventLink(d.events.length ? EVENT_LINKS[d.role] : null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // First, so it's visible without scrolling the tab strip on a phone.
  return <Layout links={eventLink ? [eventLink, ...collectorLinks] : collectorLinks} />;
}

/** Admin stepping in to bill or keep stock: the field screen, with a way back to the event report. */
function AdminEventTool({ children }) {
  const { id } = useParams();
  return (
    <div className="mx-auto max-w-md">
      <Link to={`/admin/events/${id}`} className="mb-3 inline-flex min-h-9 items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
        <Icon name="arrow-left" className="h-4 w-4" />
        Event report
      </Link>
      {children}
    </div>
  );
}

const adminLinks = [
  { to: '/admin', label: 'Collections', icon: 'banknotes', end: true },
  { to: '/admin/reports', label: 'Reports', icon: 'chart-bar' },
  { to: '/admin/events', label: 'Events', icon: 'ticket' },
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
          <RequireRole roles={['collector', 'receiver']}>
            <FieldLayout />
          </RequireRole>
        }
      >
        <Route path="/" element={<NewCollection />} />
        <Route path="/handover" element={<Handover />} />
        <Route path="/history" element={<History />} />
        <Route path="/events/billing" element={<RequireRole roles={['collector']}><EventBilling /></RequireRole>} />
        <Route path="/events/stock" element={<RequireRole roles={['receiver']}><EventStock /></RequireRole>} />
      </Route>

      <Route
        element={
          <RequireRole roles={['admin']}>
            <Layout links={adminLinks} />
          </RequireRole>
        }
      >
        <Route path="/admin" element={<Collections />} />
        <Route path="/admin/reports" element={<Reports />} />
        <Route path="/admin/events" element={<Events />} />
        <Route path="/admin/events/:id" element={<EventDetail />} />
        <Route path="/admin/events/:id/billing" element={<AdminEventTool><EventBilling /></AdminEventTool>} />
        <Route path="/admin/events/:id/stock" element={<AdminEventTool><EventStock /></AdminEventTool>} />
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
