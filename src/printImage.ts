/** Max printable bitmap width on Amwal POS printers. */
export const ECR_PRINTER_WIDTH = 384;

/** Max encoded image payload accepted for PRINT. */
export const ECR_PRINTER_MAX_BYTES = 15 * 1024 * 1024;

/**
 * Ensures [image] is non-empty, at most 15 MB, and when it is a PNG that its
 * width is exactly 384 px. Height may be any positive value.
 *
 * Returns null when valid. JPEG and other formats are left for the Android
 * host to decode after the size check.
 */
export function validatePrintImage(
  image: Uint8Array | null | undefined
): string | null {
  if (image == null || image.length === 0) {
    return `Print image is required (width must be ${ECR_PRINTER_WIDTH}px)`;
  }
  if (image.length > ECR_PRINTER_MAX_BYTES) {
    return (
      `Print image size must not exceed ${ECR_PRINTER_MAX_BYTES / (1024 * 1024)} MB ` +
      `(was ${image.length} bytes)`
    );
  }
  if (!looksLikePng(image)) return null;
  if (image.length < 24) return 'Print image could not be decoded';
  const width = readUint32(image, 16);
  const height = readUint32(image, 20);
  if (width <= 0 || height <= 0) return 'Print image could not be decoded';
  if (width !== ECR_PRINTER_WIDTH) {
    return `Print image width must be ${ECR_PRINTER_WIDTH}px (was ${width}x${height})`;
  }
  return null;
}

// Hermes provides btoa; the library build excludes example/, so React Native globals are not in scope.
declare function btoa(data: string): string;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(
      ...bytes.subarray(index, Math.min(index + chunk, bytes.length))
    );
  }
  return btoa(binary);
}

function looksLikePng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  );
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}
