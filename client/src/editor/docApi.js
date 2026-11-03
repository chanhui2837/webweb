// 편집 문서 불러오기/저장 — 메타와 타일을 나눠서 주고받는다.
import { api } from '../lib/api.js';
import { buildDoc, docMeta } from './render.js';

const CHUNK_BYTES = 6 * 1024 * 1024;
const CHUNK_TILES = 40;

/** 서버에서 메타 + 모든 타일을 받아 편집 가능한 문서로 만든다. 빈 문서면 null */
export async function loadDoc(docId, onProgress) {
  const r = await api.get(`/editor-docs/${docId}`);
  if (!r.data) return null;
  const tiles = [];
  let after = null;
  do {
    const page = await api.get(`/editor-docs/${docId}/tiles?limit=30${after ? `&after=${after}` : ''}`);
    tiles.push(...page.tiles);
    after = page.next;
    onProgress?.(tiles.length, r.tileCount);
  } while (after);
  return buildDoc(r.data, tiles);
}

/**
 * 바뀐 타일만 올리고 마지막에 메타를 저장한다.
 * changes: { put: [{ layer, key, canvas }], del: [{ layer, key }] }
 */
export async function saveDoc(docId, doc, changes, onProgress) {
  let batch = [];
  let bytes = 0;
  let sent = 0;
  const total = changes.put.length;
  const flush = async (del = []) => {
    if (!batch.length && !del.length) return;
    await api.post(`/editor-docs/${docId}/tiles`, { put: batch, del });
    sent += batch.length;
    onProgress?.(sent, total);
    batch = [];
    bytes = 0;
  };
  for (const t of changes.put) {
    const d = t.canvas.toDataURL('image/png');
    if (batch.length && (bytes + d.length > CHUNK_BYTES || batch.length >= CHUNK_TILES)) await flush();
    batch.push({ layer: t.layer, key: t.key, d });
    bytes += d.length;
  }
  await flush();
  for (let i = 0; i < changes.del.length; i += 4000) {
    await api.post(`/editor-docs/${docId}/tiles`, { put: [], del: changes.del.slice(i, i + 4000) });
  }
  await api.put(`/editor-docs/${docId}`, { data: docMeta(doc) });
}

/** 문서 전체를 새로 저장 (합치기 결과 등) */
export async function saveDocFull(docId, doc, onProgress) {
  const put = [];
  for (const l of doc.layers) for (const [key, canvas] of l.tiles) put.push({ layer: l.id, key, canvas: canvas.canvas || canvas });
  await saveDoc(docId, doc, { put, del: [] }, onProgress);
}
