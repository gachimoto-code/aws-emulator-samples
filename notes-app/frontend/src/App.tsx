import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Note } from "./api";

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  const reload = useCallback(async () => {
    try {
      const list = await api.listNotes();
      setNotes(list);
      setError(null);
    } catch (e) {
      setError(
        `バックエンドに接続できません: ${e instanceof Error ? e.message : e}`
      );
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setTitle(selected?.title ?? "");
    setBody(selected?.body ?? "");
  }, [selectedId, selected?.id]);

  async function handleNew() {
    const note = await api.createNote("無題のノート", "");
    await reload();
    setSelectedId(note.id);
  }

  async function handleSave() {
    if (!selected) return;
    const updated = await api.updateNote(selected.id, title, body);
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }

  async function handleDelete() {
    if (!selected) return;
    await api.deleteNote(selected.id);
    setSelectedId(null);
    await reload();
  }

  async function handleUpload(file: File) {
    if (!selected) return;
    const updated = await api.uploadAttachment(selected.id, file);
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }

  async function handleDeleteAttachment() {
    if (!selected) return;
    const updated = await api.deleteAttachment(selected.id);
    setNotes((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>ノート</h1>
        <p className="subtitle">DynamoDB + S3 (AWS Emulator)</p>
        <button onClick={handleNew}>+ 新規ノート</button>
        {error && <p className="error">{error}</p>}
        <ul className="note-list">
          {notes.map((n) => (
            <li
              key={n.id}
              className={n.id === selectedId ? "active" : ""}
              onClick={() => setSelectedId(n.id)}
            >
              <div className="note-title">{n.title}</div>
              <div className="note-meta">
                {new Date(n.updatedAt).toLocaleString("ja-JP")}
                {n.attachment ? " · 📎" : ""}
              </div>
            </li>
          ))}
        </ul>
      </aside>
      <main className="editor">
        {selected ? (
          <>
            <input
              className="title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="タイトル"
            />
            <textarea
              className="body-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="本文"
            />
            <div className="actions">
              <button onClick={handleSave}>保存</button>
              <button className="danger" onClick={handleDelete}>
                ノートを削除
              </button>
            </div>
            <section className="attachment">
              <h2>添付ファイル (S3)</h2>
              {selected.attachment ? (
                <p>
                  <a href={api.attachmentUrl(selected.id)}>
                    {selected.attachment.filename}
                  </a>{" "}
                  ({selected.attachment.size} bytes){" "}
                  <button onClick={handleDeleteAttachment}>削除</button>
                </p>
              ) : (
                <p>添付なし</p>
              )}
              <input
                ref={fileRef}
                type="file"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                  e.target.value = "";
                }}
              />
            </section>
          </>
        ) : (
          <p className="empty">
            左のリストからノートを選ぶか、「+ 新規ノート」で作成してください。
          </p>
        )}
      </main>
    </div>
  );
}
