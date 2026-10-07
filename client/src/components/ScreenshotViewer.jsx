import { useEffect, useState } from 'react';
import { apiBlob, saveBlob } from '../api/client';
import { Modal, Button, Spinner, Alert } from './ui';
import { formatINR, formatDateTime } from '../utils/format';

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Shows the UPI payment screenshot stored with an event bill (fetched with the JWT, never a public URL). */
export default function ScreenshotViewer({ bill, onClose }) {
  const [shot, setShot] = useState({ url: '', blob: null, error: '' });

  useEffect(() => {
    if (!bill) return undefined;
    let url = '';
    let cancelled = false;
    setShot({ url: '', blob: null, error: '' });
    apiBlob(`/api/events/bills/${bill.id}/screenshot`)
      .then(({ blob }) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setShot({ url, blob, error: '' });
      })
      .catch((err) => !cancelled && setShot({ url: '', blob: null, error: err.message }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bill]);

  if (!bill) return null;
  const label = bill.billLabel || bill.ref;

  return (
    <Modal open title={`UPI screenshot — bill ${label}`} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1 text-sm">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900">{bill.customerName}</p>
          <p className="text-xs text-slate-500">
            {formatDateTime(bill.verifiedAt || bill.createdAt)}
            {bill.upiRef ? <> • UPI ref <span className="tnum font-mono">{bill.upiRef}</span></> : null}
          </p>
        </div>
        <p className="tnum shrink-0 font-bold text-slate-900">{formatINR(bill.totalAmount)}</p>
      </div>
      <div className="flex min-h-64 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {shot.error ? (
          <div className="p-4"><Alert>{shot.error}</Alert></div>
        ) : shot.url ? (
          <img src={shot.url} alt={`UPI payment screenshot for bill ${label}`} className="max-h-[65vh] w-auto object-contain" />
        ) : (
          <Spinner className="h-7 w-7 text-brand-700" />
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button
          icon="download"
          disabled={!shot.blob}
          onClick={() => saveBlob(shot.blob, `upi-${label}.${EXT[shot.blob.type] || 'jpg'}`)}
        >
          Download
        </Button>
      </div>
    </Modal>
  );
}
