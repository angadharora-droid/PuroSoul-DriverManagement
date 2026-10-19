import { createPortal } from 'react-dom';
import { useCallback, useEffect, useRef, useState } from 'react';

export default function PaymentCamera({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [photo, setPhoto] = useState(null);
  const [facingMode, setFacingMode] = useState('environment');
  const [cameraUnavailable, setCameraUnavailable] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setLoading(true);
    setError('');
    setCameraUnavailable(false);

    if (!navigator.mediaDevices?.getUserMedia) {
      setLoading(false);
      setCameraUnavailable(true);
      setError('Live camera is unavailable in this browser. You can choose a photo instead.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setLoading(false);
        return;
      }

      video.srcObject = stream;
      await video.play();
      setLoading(false);
    } catch (err) {
      stopCamera();
      setLoading(false);
      setCameraUnavailable(true);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setError('Camera permission was denied. Allow camera access in your browser settings, or choose a photo instead.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera was found. You can choose a photo instead.');
      } else {
        setError('Could not start the camera. Try again or choose a photo instead.');
      }
    }
  }, [facingMode, stopCamera]);

  useEffect(() => {
    startCamera();

    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const makePhoto = useCallback((source, isVideo = false) => {
    const width = isVideo ? source.videoWidth : source.naturalWidth;
    const height = isVideo ? source.videoHeight : source.naturalHeight;

    if (!width || !height) {
      setError('The image is not ready yet. Please try again.');
      return;
    }

    // Resize large phone photos to keep uploads and local storage manageable.
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const canvas = document.createElement('canvas');

    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const context = canvas.getContext('2d');
    if (!context) {
      setError('Could not process the photo. Please try again.');
      return;
    }

    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Could not process the photo. Please try again.');
          return;
        }

        const reader = new FileReader();

        reader.onload = () => {
          setPhoto({
            dataUrl: reader.result,
            size: blob.size,
          });
          setError('');
        };

        reader.onerror = () => {
          setError('Could not read the photo. Please try again.');
        };

        reader.readAsDataURL(blob);
      },
      'image/jpeg',
      0.82
    );
  }, []);

  const takePhoto = useCallback(() => {
    const video = videoRef.current;

    if (!video || !video.videoWidth || !video.videoHeight) {
      setError('The camera is not ready yet. Please wait a moment and try again.');
      return;
    }

    makePhoto(video, true);
  }, [makePhoto]);

  const onFileSelected = useCallback((event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      event.target.value = '';
      return;
    }

    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      makePhoto(image);
      URL.revokeObjectURL(objectUrl);
      event.target.value = '';
    };

    image.onerror = () => {
      setError('Could not open that image. Please choose another.');
      URL.revokeObjectURL(objectUrl);
      event.target.value = '';
    };

    image.src = objectUrl;
  }, [makePhoto]);

  const closeCamera = useCallback(() => {
    stopCamera();
    onClose?.();
  }, [onClose, stopCamera]);

  const retakePhoto = useCallback(() => {
    setPhoto(null);
    setError('');
    if (!streamRef.current) {
      startCamera();
    }
  }, [startCamera]);

  const acceptPhoto = useCallback(() => {
    if (!photo) return;

    stopCamera();
    onCapture(photo);
  }, [photo, onCapture, stopCamera]);

  const switchCamera = useCallback(() => {
    setFacingMode((current) =>
      current === 'environment' ? 'user' : 'environment'
    );
  }, []);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex flex-col overflow-hidden bg-black text-white"
      style={{
        height: '100vh',
        maxHeight: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        overscrollBehavior: 'none',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Take payment photo"
    >
      {/* Header remains visible */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/15 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-base font-bold">Payment photo</h2>
          <p className="text-xs text-white/65">
            Keep the payment amount and reference visible
          </p>
        </div>

        <button
          type="button"
          onClick={closeCamera}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-2xl hover:bg-white/25"
          aria-label="Close camera"
        >
          ×
        </button>
      </header>

      {/* Preview fills the available space; the page itself does not scroll */}
      <main
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black"
        style={{ touchAction: 'pan-y' }}
      >
        {photo ? (
          <img
            src={photo.dataUrl}
            alt="Captured payment"
            className="h-full w-full object-contain"
          />
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="h-full w-full object-contain"
              style={{
                objectFit: 'contain',
                backgroundColor: '#000',
              }}
            />

            {loading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black">
                <div className="h-9 w-9 animate-spin rounded-full border-4 border-white/25 border-t-white" />
                <p className="text-sm text-white/80">Starting camera…</p>
              </div>
            )}

            {error && (
              <div className="absolute left-4 right-4 top-4 rounded-xl bg-red-950/95 p-3 text-sm text-white">
                {error}
              </div>
            )}

            {cameraUnavailable && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
                <p className="text-sm text-white/80">
                  You can still upload a photo of the payment screen.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-xl bg-white px-5 py-3 font-semibold text-black"
                >
                  Choose photo
                </button>
              </div>
            )}
          </>
        )}
      </main>

      {/* Controls stay visible at the bottom without scrolling */}
      <footer className="flex shrink-0 flex-col gap-3 border-t border-white/15 bg-black px-4 pb-4 pt-3">
        {photo ? (
          <>
            <p className="text-center text-sm text-green-300">
              Photo ready · {(photo.size / 1024).toFixed(0)} KB
            </p>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={retakePhoto}
                className="min-h-12 rounded-xl border border-white/30 px-3 py-3 font-semibold"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={acceptPhoto}
                className="min-h-12 rounded-xl bg-white px-3 py-3 font-bold text-black"
              >
                Use photo
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-center text-xs text-white/65">
              Centre the payment success screen in the preview
            </p>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="min-h-11 rounded-xl border border-white/25 px-3 py-2 text-sm font-semibold"
              >
                Upload
              </button>

              <button
                type="button"
                onClick={takePhoto}
                disabled={loading || cameraUnavailable}
                aria-label="Take photo"
                className="flex h-16 w-16 items-center justify-center rounded-full border-[5px] border-white disabled:opacity-40"
              >
                <span className="h-11 w-11 rounded-full bg-white" />
              </button>

              <button
                type="button"
                onClick={switchCamera}
                disabled={loading || cameraUnavailable}
                className="min-h-11 rounded-xl border border-white/25 px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Flip camera
              </button>
            </div>
          </>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onFileSelected}
          className="hidden"
          aria-label="Choose payment photo"
        />
      </footer>
    </div>,
    document.body
  );
}
