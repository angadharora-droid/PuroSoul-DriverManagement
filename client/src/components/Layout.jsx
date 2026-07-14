import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from './icons';
import { Avatar } from './ui';

function BrandMark({ className = 'h-9 w-9' }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-sm shadow-brand-900/30 ${className}`}>
      <Icon name="droplet" className="h-[58%] w-[58%]" strokeWidth={2} />
    </div>
  );
}

export { BrandMark };

export default function Layout({ links }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 pt-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <BrandMark />
              <div className="min-w-0">
                <p className="font-display truncate text-[15px] font-bold leading-tight text-brand-900">Puro Soul Cash</p>
                <p className="truncate text-[11px] leading-tight text-slate-500">Collection verification</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-3 sm:flex">
                <Avatar name={user?.name} className="h-6 w-6 text-[10px]" />
                <span className="max-w-32 truncate text-xs font-semibold text-slate-700">{user?.name}</span>
                <span className="rounded-full bg-slate-200 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {user?.role}
                </span>
              </span>
              <button
                onClick={() => {
                  logout();
                  navigate('/login');
                }}
                className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <Icon name="logout" className="h-4.5 w-4.5" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </div>
          </div>

          <nav className="scrollbar-none -mx-1 mt-2 flex gap-1 overflow-x-auto px-1 pb-0" aria-label="Primary">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `relative flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-t-lg px-3.5 pb-2.5 pt-2 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'text-brand-800 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-brand-700'
                      : 'text-slate-500 hover:bg-slate-100/70 hover:text-slate-700'
                  }`
                }
              >
                <Icon name={l.icon} className="h-4.5 w-4.5" />
                {l.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 pb-16">
        <Outlet />
      </main>
    </div>
  );
}
