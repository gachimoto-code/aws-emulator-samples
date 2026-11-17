import { useCallback, useEffect, useState } from "react";
import {
  getQueue,
  enqueue,
  complete,
  purge,
  type PendingMessage,
} from "./api";

export default function App() {
  const [messages, setMessages] = useState<PendingMessage[]>([]);
  const [counts, setCounts] = useState({ visible: 0, inFlight: 0, delayed: 0 });
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const data = await getQueue();
      setMessages(data.messages);
      setCounts(data.counts);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => void reload(), 4000);
    return () => clearInterval(timer);
  }, [reload]);

  async function onEnqueue() {
    if (!title.trim()) return;
    try {
      await enqueue(title.trim(), note.trim());
      setTitle("");
      setNote("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onComplete(receiptHandle: string) {
    try {
      await complete(receiptHandle);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onPurge() {
    if (!confirm("キュー内の全タスクを削除しますか？")) return;
    try {
      await purge();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page">
      <header>
        <h1>タスクキュー</h1>
        <p className="subtitle">
          SQS (AWS Emulator) — 待ち {counts.visible} 件 / 処理中{" "}
          {counts.inFlight} 件 / 遅延 {counts.delayed} 件
        </p>
      </header>

      <section className="enqueue">
        <input
          className="title"
          placeholder="タスク名"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className="note"
          placeholder="メモ (任意)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button onClick={onEnqueue}>キューに追加</button>
        <button className="danger" onClick={onPurge}>
          全件削除
        </button>
      </section>

      {error && <p className="error">{error}</p>}

      {messages.length === 0 ? (
        <p className="empty">待機中のタスクはありません。</p>
      ) : (
        <ul className="task-list">
          {messages.map((m) => (
            <li key={m.messageId}>
              <div className="task-main">
                <span className="task-title">{m.task.title}</span>
                {m.task.note && <span className="task-note">{m.task.note}</span>}
                <span className="task-meta">
                  {m.task.enqueuedAt
                    ? new Date(m.task.enqueuedAt).toLocaleString("ja-JP")
                    : ""}
                </span>
              </div>
              <button onClick={() => onComplete(m.receiptHandle)}>完了</button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        一覧は最大10件の覗き見表示です（件数はキューの概数）。「完了」でそのタスクをキューから削除します。
      </p>
    </div>
  );
}
