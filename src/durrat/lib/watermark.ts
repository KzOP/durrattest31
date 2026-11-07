const MAX_SIDE = 1280;
const QUALITY = 0.78;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image'));
    image.src = src;
  });
}

/** Resize a large photo in the browser, then stamp the office watermark. */
export async function watermarkImage(file: File): Promise<string> {
  let source: ImageBitmap | HTMLImageElement;
  let objectUrl = '';
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions);
  } catch {
    objectUrl = URL.createObjectURL(file);
    source = await loadImage(objectUrl);
  }
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(source.width * scale);
    canvas.height = Math.round(source.height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const fontSize = Math.max(22, canvas.width / 18);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(-Math.PI / 14);
    context.font = `700 ${fontSize}px Arial`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(255,255,255,0.45)';
    context.shadowColor = 'rgba(0,0,0,0.25)';
    context.shadowBlur = fontSize / 6;
    context.fillText('درة الهجرة للعقارات', 0, 0);
    context.restore();
    return canvas.toDataURL('image/jpeg', QUALITY);
  } finally {
    if ('close' in source) source.close();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/** Fallback when cloud upload fails: a small copy that fits safely inside the property record. */
export async function shrinkDataUrl(dataUrl: string, maxSide = 640, quality = 0.6): Promise<string> {
  if (!dataUrl.startsWith('data:')) return dataUrl;
  try {
    const image = await loadImage(dataUrl);
    const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * scale);
    canvas.height = Math.round(image.height * scale);
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return dataUrl;
  }
}
