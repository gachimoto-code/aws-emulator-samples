import { useCallback, useEffect, useRef, useState } from "react";
import {
  listFiles,
  uploadFile,
  downloadUrl,
  deleteFile,
  type FileEntry,
} from "./api";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function App() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [totalBytes, setTotalBytes] = useState(0);
  const [prefix, setPrefix] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      const data = await listFiles();
      setFiles(data.files);
      setTotalBytes(data.totalBytes);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onUpload() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await uploadFile(file, prefix.trim());
      if (fileInput.current) fileInput.current.value = "";
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(key: string) {
    if (!confirm(`削除しますか？\n${key}`)) return;
    try {
      await deleteFile(key);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const visible = files.filter((f) =>
    f.key.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="page">
      <header>
        <h1>ファイル管理</h1>
        <p className="subtitle">
          S3 (AWS Emulator) — {files.length} 件 / 合計{" "}
          {formatSize(totalBytes)}
        </p>
      </header>

      <section className="upload">
        <input ref={fileInput} type="file" />
        <input
          className="prefix"
          placeholder="フォルダ (任意, 例: docs)"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
        />
        <button onClick={onUpload} disabled={busy}>
          アップロード
        </button>
      </section>

      <input
        className="filter"
        placeholder="ファイル名で絞り込み"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {error && <p className="error">{error}</p>}

      {visible.length === 0 ? (
        <p className="empty">ファイルがありません。</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>キー (ファイル名)</th>
              <th>サイズ</th>
              <th>更新日時</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((f) => (
              <tr key={f.key}>
                <td className="key">{f.key}</td>
                <td>{formatSize(f.size)}</td>
                <td>
                  {f.lastModified
                    ? new Date(f.lastModified).toLocaleString("ja-JP")
                    : "-"}
                </td>
                <td className="row-actions">
                  <a href={downloadUrl(f.key)}>ダウンロード</a>
                  <button className="danger" onClick={() => onDelete(f.key)}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
