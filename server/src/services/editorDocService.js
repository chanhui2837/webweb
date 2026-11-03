import { EditorDoc, EditorTile } from '../models/index.js';

/** 편집 문서와 그 타일을 함께 삭제 */
export async function deleteEditorDocs(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
  if (!list.length) return;
  await EditorTile.deleteMany({ doc: { $in: list } });
  await EditorDoc.deleteMany({ _id: { $in: list } });
}

/** 편집 문서를 타일까지 통째로 복제 (서버 안에서 복사하므로 브라우저 전송 없음) */
export async function copyEditorDoc(sourceId, owner, kind = 'episodePage') {
  const src = sourceId ? await EditorDoc.findById(sourceId).lean() : null;
  const doc = await EditorDoc.create({ owner, kind, data: src?.data ?? null, byteSize: src?.byteSize ?? 0 });
  if (src) {
    let batch = [];
    for await (const t of EditorTile.find({ doc: src._id }).lean().cursor()) {
      batch.push({ doc: doc._id, layer: t.layer, key: t.key, data: t.data });
      if (batch.length >= 50) { await EditorTile.insertMany(batch, { ordered: false }); batch = []; }
    }
    if (batch.length) await EditorTile.insertMany(batch, { ordered: false });
  }
  return doc;
}
