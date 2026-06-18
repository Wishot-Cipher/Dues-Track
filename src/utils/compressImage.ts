/**
 * compressImage — compress a browser File before uploading to Supabase.
 *
 * Why: Raw phone photos are 2–6MB. Compressed they're 200–400KB.
 * This multiplies free-tier storage runway by ~10x at zero cost.
 *
 * - Images → compressed JPEG at 1200px max width, 75% quality
 * - PDFs   → pass through unchanged (can't canvas-compress a PDF)
 * - Non-image, non-PDF → pass through unchanged
 *
 * Usage:
 *   const file = await compressImage(rawFile);
 *   // then upload `file` to Supabase instead of rawFile
 */
export async function compressImage(
  file: File,
  maxWidthPx = 1200,
  qualityPercent = 0.75,
): Promise<File> {
  // PDFs and non-images pass through unchanged
  if (!file.type.startsWith('image/')) return file;

  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const canvas = document.createElement('canvas');

      // Scale down proportionally if wider than maxWidth
      let { width, height } = img;
      if (width > maxWidthPx) {
        height = Math.round((height * maxWidthPx) / width);
        width  = maxWidthPx;
      }

      canvas.width  = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(file); // fallback — return original if canvas fails
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            resolve(file); // fallback
            return;
          }
          // Preserve original filename but always output as JPEG
          const name = file.name.replace(/\.[^.]+$/, '.jpg');
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        qualityPercent,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // fallback — return original if load fails
    };

    img.src = url;
  });
}

/**
 * validateFile — check size and type before upload attempt.
 * Returns an error string or null if valid.
 */
export function validateFile(
  file: File,
  options: {
    maxSizeMB?: number;
    allowedTypes?: string[];
  } = {},
): string | null {
  const maxSizeMB  = options.maxSizeMB  ?? 5;
  const allowedTypes = options.allowedTypes ?? [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
  ];

  if (file.size > maxSizeMB * 1024 * 1024) {
    return `File too large. Maximum size is ${maxSizeMB}MB. Please compress your image.`;
  }

  if (!allowedTypes.includes(file.type)) {
    return 'Only JPG, PNG, WebP, or PDF files are accepted.';
  }

  return null;
}