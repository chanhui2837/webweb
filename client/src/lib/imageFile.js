// 휴대폰 사진(HEIC 등)도 올릴 수 있도록, 업로드 전에 브라우저에서 PNG/JPG 로 바꾸고 너무 크면 줄인다.
// 파일 선택창은 반드시 accept="image/*" 를 써야 안드로이드 갤러리·아이폰 사진첩이 열린다.

const SERVER_OK = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_BYTES = 9.5 * 1024 * 1024;

export const IMAGE_ACCEPT = 'image/*';

function loadFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('이 사진 형식은 이 브라우저에서 열 수 없어요. 사진 앱에서 JPG 로 저장한 뒤 다시 선택해 주세요.'));
    };
    img.src = url;
  });
}

function toBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** 이미지 파일 → (필요하면 변환·축소한) 업로드용 Blob */
export async function normalizeImageFile(file, maxDim = 4000) {
  if (!file) throw new Error('사진을 선택해 주세요.');
  if (file.type && !file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name || '')) {
    throw new Error('이미지 파일만 올릴 수 있어요.');
  }
  // 이미 서버가 받는 형식이고 크기도 괜찮으면 그대로 사용 (GIF 애니메이션 보존)
  if (SERVER_OK.includes(file.type) && file.size <= MAX_BYTES) {
    if (file.type === 'image/gif') return file;
    const { img, url } = await loadFromFile(file);
    URL.revokeObjectURL(url);
    if (Math.max(img.naturalWidth, img.naturalHeight) <= maxDim) return file;
  }
  const { img, url } = await loadFromFile(file);
  try {
    const s = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * s));
    c.height = Math.max(1, Math.round(img.naturalHeight * s));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    const keepAlpha = file.type === 'image/png' || file.type === 'image/webp';
    let blob = await toBlob(c, keepAlpha ? 'image/png' : 'image/jpeg', 0.92);
    if (!blob || blob.size > MAX_BYTES) blob = await toBlob(c, 'image/jpeg', 0.85);
    if (!blob) throw new Error('사진을 변환하지 못했어요.');
    return new File([blob], (file.name || 'image').replace(/\.[^.]+$/, '') + (blob.type === 'image/png' ? '.png' : '.jpg'), { type: blob.type });
  } finally {
    URL.revokeObjectURL(url);
  }
}
