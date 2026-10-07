import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './icons';
import { Spinner } from './ui';
import { captureFrame, preparePhoto } from '../utils/image';

function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access is blocked for this site. Allow it from the lock icon in the address bar, or use the phone camera.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The camera is busy in another app. Close that app and try again.';
    default:
      return 'The camera could not start.';
  }
}

/**
 * Full-screen rear camera for the UPI payment photo. It runs inside the page —
 * no hop out to the camera app, so it's quicker and a low-memory phone can't
 * kill the tab mid-bill — and falls back to the phone's own camera app when
 * the browser can't stream (permission off, no HTTPS, old browser). Mount it
 * only while it's needed; the photo comes back as { dataUrl, contentType, size }.
 */
export default function PaymentCamera({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const run = useRef(0); // bumped on every stop, so a camera that opens late is let go
  const source = useRef('live'); // where the photo under review came from
  const phaseRef = useRef('starting');
  const [phase, setPhaseState] = useState('starting'); // starting | live | review | blocked
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const setPhase = useCallback((p) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  const stop = useCallback(() => {
    run.current += 1;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const start = useCallback(async () => {
    stop();
    const mine = run.current;
    setError('');
    setPhase('starting');
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't show the camera inside the app.");
      setPhase('blocked');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (mine !== run.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const [track] = stream.getVideoTracks();
      track.addEventListener('ended', () => {
        if (streamRef.current !== stream) return;
        stop();
        if (document.hidden) return; // restarted when the page is back in view
        setError('The camera stopped.');
        setPhase('blocked');
      });
      // Keep refocusing as the phone moves, where the browser allows it.
      track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => {}); // onPlaying switches to 'live'
    } catch (err) {
      if (mine !== run.current) return;
      setError(cameraErrorMessage(err));
      setPhase('blocked');
    }
  }, [stop, setPhase]);

  // Camera on while open; released when the phone switches apps and when closed.
  useEffect(() => {
    start();
    const onVisibility = () => {
      if (document.hidden) stop();
      else if (['live', 'starting'].includes(phaseRef.current)) start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [start, stop]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  async function takePhoto() {
    const video = videoRef.current;
    if (busy || !video) return;
    setBusy(true);
    setError('');
    try {
      const shot = await captureFrame(video);
      video.pause(); // frozen, not stopped — a retake is instant
      source.current = 'live';
      setPhoto(shot);
      setPhase('review');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openPhoneCamera() {
    stop(); // the camera app needs the camera to itself
    setPhase('blocked');
    fileRef.current?.click();
  }

  async function onPhoneCameraPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // taking another photo should still fire
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const shot = await preparePhoto(file);
      source.current = 'phone';
      setPhoto(shot);
      setPhase('review');
    } catch (err) {
      setError(err.message);
      setPhase('blocked');
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    setPhoto(null);
    if (source.current === 'phone') return openPhoneCamera();
    if (!streamRef.current) return start();
    setPhase('live');
    videoRef.current?.play().catch(() => {});
  }

  function acceptPhoto() {
    stop();
    onCapture(photo);
  }

  const canStream = Boolean(navigator.mediaDevices?.getUserMedia);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Take UPI payment photo">
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <h2 className="text-base font-bold">UPI payment photo</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="Close camera"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        {/* object-contain: what's on screen is exactly what gets saved */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          onPlaying={() => phaseRef.current === 'starting' && setPhase('live')}
          className="absolute inset-0 h-full w-full object-contain"
        />

        {phase === 'review' && photo && (
          <img src={photo.dataUrl} alt="UPI payment photo just taken" className="absolute inset-0 h-full w-full bg-black object-contain" />
        )}

        {phase === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <Spinner className="h-8 w-8 text-white" />
            <p className="text-sm text-white/80">Starting camera…</p>
            <button type="button" onClick={openPhoneCamera} className="mt-2 min-h-10 cursor-pointer rounded-lg px-3 text-xs font-semibold text-white/70 underline underline-offset-2">
              Use the phone camera instead
            </button>
          </div>
        )}

        {phase === 'blocked' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            {busy ? (
              <>
                <Spinner className="h-8 w-8 text-white" />
                <p className="text-sm text-white/80">Preparing photo…</p>
              </>
            ) : (
              <>
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10">
                  <Icon name="camera" className="h-8 w-8 text-white/80" />
                </span>
                <p className="max-w-xs text-sm leading-relaxed text-white/85">{error || 'Take the photo with the phone camera.'}</p>
                <div className="flex w-full max-w-xs flex-col gap-2">
                  <button
                    type="button"
                    onClick={openPhoneCamera}
                    className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-900 active:scale-[0.98]"
                  >
                    <Icon name="camera" className="h-5 w-5" />
                    Open phone camera
                  </button>
                  {canStream && (
                    <button type="button" onClick={start} className="min-h-11 cursor-pointer rounded-xl px-4 text-sm font-semibold text-white/80 hover:bg-white/10">
                      Try the in-app camera again
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {phase === 'review' ? (
          <>
            <p className="mb-3 text-center text-xs text-white/70">Can you read the amount and UTR? If not, retake.</p>
            <div className="mx-auto grid max-w-sm grid-cols-2 gap-3">
              <button
                type="button"
                onClick={retake}
                className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/40 px-4 text-sm font-semibold text-white active:scale-[0.98]"
              >
                <Icon name="refresh" className="h-5 w-5" />
                Retake
              </button>
              <button
                type="button"
                onClick={acceptPhoto}
                className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white active:scale-[0.98]"
              >
                <Icon name="check" className="h-5 w-5" />
                Use photo
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={`mb-3 text-center text-xs ${error && phase === 'live' ? 'font-semibold text-red-300' : 'text-white/70'}`}>
              {error && phase === 'live' ? error : 'Fit the whole UPI success screen — amount and UTR — in the frame'}
            </p>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={takePhoto}
                disabled={phase !== 'live' || busy}
                aria-label="Take photo"
                className="flex h-18 w-18 cursor-pointer items-center justify-center rounded-full border-4 border-white transition-opacity active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="h-14 w-14 rounded-full bg-white" />
              </button>
            </div>
          </>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={onPhoneCameraPhoto} />
    </div>
  );
}
