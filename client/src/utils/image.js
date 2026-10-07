// Small enough to upload quickly on event-ground mobile data, large enough that
// the UTR / amount on a UPI screenshot stays perfectly legible.
const KEEP_ORIGINAL_MAX = 400 * 1024;
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.82;
const HARD_MAX = 5 * 1024 * 1024; // server limit

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable image'));
    };
    img.src = url;
  });
}

async function toPayload(blob, contentType) {
  const dataUrl = await readAsDataUrl(blob);
  return { dataUrl, contentType, size: blob.size };
}

/**
 * Turns the picked UPI screenshot into { dataUrl, contentType, size }: small
 * JPEG/PNG files go up untouched; anything bigger is scaled to MAX_SIDE and
 * re-encoded as JPEG (which the server can also embed in the PDF archive).
 */
export async function prepareScreenshot(file) {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Choose an image — the UPI payment screenshot');
  }
  if (['image/jpeg', 'image/png'].includes(file.type) && file.size <= KEEP_ORIGINAL_MAX) {
    return toPayload(file, file.type);
  }
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; // transparent PNG areas would otherwise turn black in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob) throw new Error('encode failed');
    return toPayload(blob, 'image/jpeg');
  } catch {
    // Couldn't re-encode on this device — send the original if the server accepts it.
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= HARD_MAX) {
      return toPayload(file, file.type);
    }
    throw new Error('Could not read this image — please take the screenshot again');
  }
}

/** Raw base64 (no data: prefix) for the API. */
export function dataUrlToBase64(dataUrl) {
  return String(dataUrl).slice(String(dataUrl).indexOf(',') + 1);
}

/** "240 KB" */
export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
