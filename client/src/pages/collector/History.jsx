import { useEffect, useState } from 'react';
import { api, apiDownload } from '../../api/client';
import { StatusBadge, EmptyState, Button, Avatar, CardSkeleton, PageHeader } from '../../components/ui';
import Icon from '../../components/icons';
import { useToast } from '../../components/toast';
import { formatINR, formatDateTime } from '../../utils/format';

export default function History() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    api
      .get('/api/collections/mine', { page })
      .then(setData)
      .catch((err) => setError(err.message));
  }, [page]);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <PageHeader title="My collections" subtitle={data ? `${data.total} total record${data.total === 1 ? '' : 's'}` : undefined} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!data ? (
        <CardSkeleton count={4} />
      ) : data.items.length === 0 ? (
        <EmptyState icon="banknotes" title="No collections yet" subtitle="Your OTP-verified collections will appear here after your first delivery run." />
      ) : (
        <div className="space-y-3">
          {data.items.map((t, i) => (
            <div
              key={t.id}
              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card animate-fade-in-up"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <div className="flex items-start gap-3">
                <Avatar name={t.party?.name} className="mt-0.5 h-10 w-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate font-semibold text-slate-900">{t.party?.name || '—'}</p>
                    <p className="tnum shrink-0 font-bold text-slate-900">{formatINR(t.amount)}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDateTime(t.createdAt)} • ref <span className="tnum font-mono">{t.ref}</span>
                  </p>
                  {t.notes && <p className="mt-1 truncate text-xs text-slate-400">{t.notes}</p>}
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    <StatusBadge status={t.status} />
                    {t.status === 'verified' && (
                      <button
                        onClick={() =>
                          apiDownload(`/api/collections/${t.id}/receipt.pdf`, null, `receipt-${t.ref}.pdf`)
                            .then(() => toast('Receipt downloaded'))
                            .catch((e) => toast(e.message, 'error'))
                        }
                        className="flex min-h-9 cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                      >
                        <Icon name="download" className="h-3.5 w-3.5" />
                        Receipt
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {data && data.pages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <Button variant="secondary" icon="chevron-left" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span className="tnum text-sm text-slate-500">
            Page {data.page} of {data.pages}
          </span>
          <Button variant="secondary" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>
            Next
            <Icon name="chevron-right" className="h-4.5 w-4.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
