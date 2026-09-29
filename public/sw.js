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

async function storeSharedFiles(files) {
  const db = await openInbox();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    files.forEach((file) => store.add({ blob: file, name: file.name, type: file.type, lastModified: file.lastModified }));
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith((async () => {
      try {
        const form = await event.request.formData();
        const files = form.getAll('images').filter((value) => value instanceof File);
        if (files.length) await storeSharedFiles(files);
        return Response.redirect(`/upload.html?shared=${files.length || 0}`, 303);
      } catch {
        return Response.redirect('/upload.html?shareError=1', 303);
      }
    })());
  }
});
