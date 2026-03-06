/** Max total size for product/post media (photos or video). */
export const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/** Cover + up to 2 more; each slot can be image or video. */
export const MAX_MEDIA_SLOTS = 3;
/** At least one media (cover) required. */
export const MIN_MEDIA_SLOTS = 1;

/** Community post: 1 cover + 2 images + 2 videos, max 20 MB total. */
export const POST_MAX_MEDIA_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
export const POST_MEDIA_SLOTS = 5; // cover, image2, image3, video1, video2
export const POST_MIN_MEDIA_SLOTS = 1; // cover required

/** @deprecated Use MAX_MEDIA_SLOTS / MIN_MEDIA_SLOTS for unified flow. */
export const MIN_PHOTOS = 1;
export const MAX_PHOTOS = 3;

/** Hint shown when upload fails due to size (e.g. in alert). */
export const SIZE_HINT =
  'Tip: To reduce file size, send your photos or video to WhatsApp, then download back to your gallery and upload here.';

/** True if error is likely due to file size (413, payload too large, etc.). */
export function isPayloadTooLargeError(error: unknown): boolean {
  const msg = String((error as { message?: string })?.message ?? (error as { error?: string })?.error ?? '');
  return (
    msg.includes('413') ||
    msg.includes('Payload too large') ||
    msg.includes('maximum allowed size') ||
    msg.toLowerCase().includes('payload too large') ||
    msg.toLowerCase().includes('entity too large')
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** True if URL is likely a video (e.g. .mp4, .mov). */
export function isVideoUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.mov') || lower.includes('.webm') || lower.includes('video');
}
