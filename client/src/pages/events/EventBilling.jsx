
import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './icons';
import { Spinner } from './ui';
import { captureFrame, preparePhoto } from '../utils/image';

function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access is blocked for this site. Allow it in browser settings, or use the phone camera.';
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

  const setPhase = useCallback((next) => {
    phaseRef.current = next;
    setPhaseState(next);
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
    const requestId = run.current;

    setError('');
    setPhase('starting');

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        "This browser can't show the camera inside the app. Use the phone camera instead."
      );
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

      // Discard a late camera response if the overlay was closed or restarted.
      if (requestId !== run.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;

      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      video.srcObject = stream;

      const [track] = stream.getVideoTracks();

      track.addEventListener('ended', () => {
        if (streamRef.current !== stream) return;

        streamRef.current = null;

        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }

        if (document.hidden) return;

        setError('The camera stopped. Please try again.');
        setPhase('blocked');
      });

      // Continuous focus is optional and not supported by every browser.
      track
        .applyConstraints({
          advanced: [{ focusMode: 'continuous' }],
        })
        .catch(() => {});

      try {
        await video.play();
      } catch {
        if (requestId !== run.current) return;

        setError(
          'The camera could not start playback. Try again or use the phone camera.'
        );
        setPhase('blocked');
      }
    } catch (err) {
      if (requestId !== run.current) return;

      setError(cameraErrorMessage(err));
      setPhase('blocked');
    }
  }, [stop, setPhase]);

  // Start the camera on mount and release it when the page is hidden.
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
      document.removeEventListener(
        'visibilitychange',
        onVisibility
      );
      stop();
    };
  }, [start, stop]);

  // Lock page scrolling while the full-screen camera is open.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  async function takePhoto() {
    const video = videoRef.current;

    if (
      busy ||
      !video ||
      phaseRef.current !== 'live'
    ) {
      return;
    }

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

    // Allow the same file to be selected again.
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
      setError(
        err.message || 'Could not prepare the photo. Please try again.'
      );
      setPhase('blocked');
    } finally {
      setBusy(false);
    }
  }

  function retake() {
    setPhoto(null);
    setError('');

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
    if (!photo || busy) return;

    stop();
    onCapture(photo);
  }

  const canStream = Boolean(
    navigator.mediaDevices?.getUserMedia
  );

  // Portal: escape transformed/overflow-hidden parent layouts.
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex flex-col overflow-hidden bg-black text-white"
      style={{
        top: 0,
        left: 0,
        width: '100%',
        height: '100vh',
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
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
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          aria-label="Close camera"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
      </div>

      {/* Flexible preview: fills the space between header and controls. */}
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
            className="absolute inset-0 h-full w-full bg-black object-contain"
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

      {/* Bottom controls stay inside the viewport. */}
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

      {/* Native phone camera fallback */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={onPhoneCameraPhoto}
      />
    </div>,
    document.body
  );
}
