
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

export default function PaymentCamera({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);
  const run = useRef(0);
  const source = useRef('live');
  const phaseRef = useRef('starting');

  const [phase, setPhaseState] = useState('starting');
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const setPhase = useCallback((nextPhase) => {
    phaseRef.current = nextPhase;
    setPhaseState(nextPhase);
  }, []);

  const stop = useCallback(() => {
    run.current += 1;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
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
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      // Ignore a camera request that completed after the component stopped it.
      if (mine !== run.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      const [track] = stream.getVideoTracks();

      track.addEventListener('ended', () => {
        if (streamRef.current !== stream) return;

        stop();

        if (document.hidden) return;

        setError('The camera stopped.');
        setPhase('blocked');
      });

      // Enable continuous focus where supported.
      track
        .applyConstraints({
          advanced: [{ focusMode: 'continuous' }],
        })
        .catch(() => {});

      if (!videoRef.current) {
        stream.getTracks().forEach((item) => item.stop());
        streamRef.current = null;
        return;
      }

      videoRef.current.srcObject = stream;

      try {
        await videoRef.current.play();
      } catch {
        // Some browsers require a user gesture before playback.
        if (mine === run.current) {
          setError('Tap to retry the camera or use the phone camera.');
          setPhase('blocked');
        }
      }
    } catch (err) {
      if (mine !== run.current) return;

      setError(cameraErrorMessage(err));
      setPhase('blocked');
    }
  }, [stop, setPhase]);

  useEffect(() => {
    start();

    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else if (
        ['live', 'starting'].includes(phaseRef.current)
      ) {
        start();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [start, stop]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  async function takePhoto() {
    const video = videoRef.current;

    if (busy || !video || phaseRef.current !== 'live') return;

    setBusy(true);
    setError('');

    try {
      const shot = await captureFrame(video);

      video.pause();
      source.current = 'live';

      setPhoto(shot);
      setPhase('review');
    } catch (err) {
      setError(err.message || 'Could not capture the photo.');
    } finally {
      setBusy(false);
    }
  }

  function openPhoneCamera() {
    stop();
    setPhase('blocked');
    fileRef.current?.click();
  }

  async function onPhoneCameraPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setBusy(true);
    setError('');

    try {
      const shot = await preparePhoto(file);

      source.current = 'phone';
      setPhoto(shot);
      setPhase('review');
    } catch (err) {
      setError(err.message || 'Could not prepare the photo.');
      setPhase('blocked');
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    setPhoto(null);

    if (source.current === 'phone') {
      openPhoneCamera();
      return;
    }

    if (!streamRef.current) {
      start();
      return;
    }

    setPhase('live');

    videoRef.current?.play().catch(() => {
      setError('Could not restart the camera. Please try again.');
      setPhase('blocked');
    });
  }

  function acceptPhoto() {
    if (!photo) return;

    stop();
    onCapture(photo);
  }

  const canStream = Boolean(navigator.mediaDevices?.getUserMedia);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col overflow-hidden bg-black text-white"
      style={{
        height: '100vh',
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Take UPI payment photo"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <h2 className="text-base font-bold">
          UPI payment photo
        </h2>

        <button
          type="button"
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          aria-label="Close camera"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
      </div>

      {/* Camera preview */}
      <div className="relative min-h-0 w-full flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          onPlaying={() => {
            if (phaseRef.current === 'starting') {
              setPhase('live');
            }
          }}
          className="absolute inset-0 h-full w-full object-contain"
        />

        {phase === 'review' && photo && (
          <img
            src={photo.dataUrl}
            alt="UPI payment photo just taken"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}

        {phase === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <Spinner className="h-8 w-8 text-white" />

            <p className="text-sm text-white/80">
              Starting camera…
            </p>

            <button
              type="button"
              onClick={openPhoneCamera}
              className="mt-2 min-h-10 cursor-pointer rounded-lg px-3 text-xs font-semibold text-white/70 underline underline-offset-2"
            >
              Use the phone camera instead
            </button>
          </div>
        )}

        {phase === 'blocked' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-y-auto px-6 text-center">
            {busy ? (
              <>
                <Spinner className="h-8 w-8 text-white" />
                <p className="text-sm text-white/80">
                  Preparing photo…
                </p>
              </>
            ) : (
              <>
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/10">
                  <Icon name="camera" className="h-8 w-8 text-white/80" />
                </span>

                <p className="max-w-xs text-sm leading-relaxed text-white/85">
                  {error || 'Take the photo with the phone camera.'}
                </p>

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
                    <button
                      type="button"
                      onClick={start}
                      className="min-h-11 cursor-pointer rounded-xl px-4 text-sm font-semibold text-white/80 hover:bg-white/10"
                    >
                      Try the in-app camera again
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div
        className="shrink-0 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        {phase === 'review' ? (
          <>
            <p className="mb-3 text-center text-xs text-white/70">
              Can you read the amount and UTR? If not, retake.
            </p>

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
            <p
              className={`mb-3 text-center text-xs ${
                error && phase === 'live'
                  ? 'font-semibold text-red-300'
                  : 'text-white/70'
              }`}
            >
              {error && phase === 'live'
                ? error
                : 'Fit the whole UPI success screen — amount and UTR — in the frame'}
            </p>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={takePhoto}
                disabled={phase !== 'live' || busy}
                aria-label="Take photo"
                className="flex h-[72px] w-[72px] shrink-0 cursor-pointer items-center justify-center rounded-full border-4 border-white transition-opacity active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="h-14 w-14 rounded-full bg-white" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Fallback to the device camera */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={onPhoneCameraPhoto}
      />
    </div>
  );
}
