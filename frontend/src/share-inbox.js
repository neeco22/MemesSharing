const DB_NAME = 'memeshare-share-inbox';
const STORE_NAME = 'files';

function openInbox() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME, { autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function normalizeSharedFile(record, index) {
  const blob = record.blob;
  const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const ascii = String.fromCharCode(...bytes);
  let extension = '';
  let type = record.type || blob.type || '';
  if (bytes[0] === 0x89 && ascii.slice(1, 4) === 'PNG') { extension = 'png'; type = 'image/png'; }
  else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) { extension = 'jpg'; type = 'image/jpeg'; }
  else if (ascii.startsWith('GIF8')) { extension = 'gif'; type = 'image/gif'; }
  else if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') { extension = 'webp'; type = 'image/webp'; }
  else if (ascii.slice(4, 8) === 'ftyp' && /avif|avis/.test(ascii.slice(8, 16))) { extension = 'avif'; type = 'image/avif'; }
  else if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) { extension = 'webm'; type = 'video/webm'; }
  const originalName = record.name || `shared-${Date.now()}-${index}`;
  const hasKnownExtension = /\.(jpe?g|png|gif|webp|webm|avif)$/i.test(originalName);
  const name = hasKnownExtension || !extension ? originalName : `${originalName.replace(/\.[^.]+$/, '')}.${extension}`;
  return new File([blob], name, { type: type || 'application/octet-stream', lastModified: record.lastModified || Date.now() });
}

export async function takeSharedFiles() {
  if (!('indexedDB' in window)) return [];
  const db = await openInbox();
  const records = await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => { const values = request.result; store.clear(); resolve(values); };
    request.onerror = () => reject(request.error);
  });
  db.close();
  return Promise.all(records.map(normalizeSharedFile));
}
