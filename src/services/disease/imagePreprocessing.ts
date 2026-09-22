import type { ImageFeatures, PreprocessedImage } from '@/models';

/**
 * Step 1 of the disease pipeline — runs for real in the browser:
 * validate → decode → centre-crop + resize to the model input size → measure colour features.
 * The resized pixels are exactly what a trained CNN (or the backend) would receive.
 */

export const MODEL_INPUT_SIZE = 224;
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export class ImageInputError extends Error {}

export function validateFile(file: File): void {
  if (!ACCEPTED.includes(file.type)) throw new ImageInputError('Please use a JPG, PNG or WebP photo.');
  if (file.size > MAX_UPLOAD_BYTES) throw new ImageInputError('The photo is larger than 8 MB. Please use a smaller photo.');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new ImageInputError('This image could not be read. Try another photo.'));
    img.src = src;
  });
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max / 255];
}

export function measure(data: ImageData): ImageFeatures {
  const { width, height, data: px } = data;
  let green = 0, yellow = 0, brown = 0, leaf = 0, bright = 0;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  const pale: number[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [h, s, v] = rgbToHsv(px[i], px[i + 1], px[i + 2]);
      bright += v;
      let isLeaf = true;
      if (h >= 65 && h <= 170 && s > 0.18 && v > 0.15) green++;
      else if (h >= 40 && h < 65 && s > 0.3 && v > 0.35) yellow++;
      else if (h >= 5 && h < 40 && s > 0.3 && v > 0.15) brown++;
      else {
        isLeaf = false;
        if (s < 0.2 && v > 0.72) pale.push(x, y);
      }
      if (isLeaf) {
        leaf++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Whitish pixels only count if they sit inside the leaf's bounding box.
  let paleInLeaf = 0;
  for (let k = 0; k < pale.length; k += 2) {
    if (pale[k] > minX && pale[k] < maxX && pale[k + 1] > minY && pale[k + 1] < maxY) paleInLeaf++;
  }
  const total = width * height;
  const leafArea = Math.max(1, leaf);
  return {
    width,
    height,
    leafCoverage: leaf / total,
    green: green / leafArea,
    yellow: yellow / leafArea,
    brown: brown / leafArea,
    pale: paleInLeaf / Math.max(1, leafArea + paleInLeaf),
    brightness: bright / total,
  };
}

export async function preprocess(src: File | string, sampleId?: string): Promise<PreprocessedImage> {
  if (src instanceof File) validateFile(src);
  const url = src instanceof File ? URL.createObjectURL(src) : src;
  try {
    const img = await loadImage(url);
    if (img.naturalWidth < 64 || img.naturalHeight < 64) throw new ImageInputError('The photo is too small. Use at least 64 × 64 pixels.');

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = MODEL_INPUT_SIZE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new ImageInputError('Your browser could not process the image.');

    // Centre-crop to a square, then resize (same as typical CNN preprocessing).
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
    const pixels = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

    return { tensorSize: MODEL_INPUT_SIZE, pixels, previewUrl: canvas.toDataURL('image/jpeg', 0.9), features: measure(pixels), sampleId };
  } finally {
    if (src instanceof File) URL.revokeObjectURL(url);
  }
}
