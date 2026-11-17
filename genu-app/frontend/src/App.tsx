import { useCallback, useEffect, useRef, useState } from "react";
import { MODELS } from "./lib/config";
import { signIn, signOut, storedToken } from "./lib/auth";
import {
  createChat,
  deleteChat,
  getChat,
  listChats,
  sendMessage,
  type Chat,
  type ChatSummary,
} from "./lib/api";

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("Demo1234!");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <h1>GenU風チャット</h1>
        <p className="login-sub">AWS Emulator版（Cognito認証）</p>
        <label>
          メールアドレス
          <input value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          パスワード
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "サインイン中..." : "サインイン"}
        </button>
        <p className="login-note">
          デモユーザーは deploy.mjs が作成します（demo@example.com / Demo1234!）。
        </p>
      </form>
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState<boolean>(!!storedToken());
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [current, setCurrent] = useState<Chat | null>(null);
  const [modelId, setModelId] = useState(MODELS[0].id);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async () => {
    try {
      setChats(await listChats());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    if (authed) void refreshList();
  }, [authed, refreshList]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [current?.messages.length]);

  if (!authed) return <Login onDone={() => setAuthed(true)} />;

  const openChat = async (id: string) => {
    setError("");
    try {
      setCurrent(await getChat(id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const newChat = async () => {
    setError("");
    try {
      const chat = await createChat();
      setCurrent(chat);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const removeChat = async (id: string) => {
    await deleteChat(id);
    if (current?.id === id) setCurrent(null);
    await refreshList();
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      let chat = current;
      if (!chat) {
        chat = await createChat();
        setCurrent(chat);
      }
      setInput("");
      const updated = await sendMessage(chat.id, text, modelId);
      setCurrent(updated);
      await refreshList();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">GenU風チャット</div>
        <button className="new-chat" onClick={newChat}>
          ＋ 新しいチャット
        </button>
        <label className="model-label">
          モデル
          <select value={modelId} onChange={(e) => setModelId(e.target.value)}>
            {MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <nav className="chat-list">
          {chats.map((c) => (
            <div
              key={c.id}
              className={`chat-item ${current?.id === c.id ? "active" : ""}`}
              onClick={() => openChat(c.id)}
            >
              <span className="chat-title">{c.title}</span>
              <button
                className="chat-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  void removeChat(c.id);
                }}
                title="削除"
              >
                ×
              </button>
            </div>
          ))}
        </nav>
        <button
          className="signout"
          onClick={() => {
            signOut();
            setAuthed(false);
          }}
        >
          サインアウト
        </button>
      </aside>

      <main className="main">
        {error && <p className="error banner">{error}</p>}
        <div className="messages">
          {!current && (
            <div className="empty">
              <p>左の「＋ 新しいチャット」から始めるか、下の欄にそのまま入力してください。</p>
              <p className="empty-note">
                ※ 推論はエミュレータ上のBedrock（ダミー応答）です。構成の再現が目的です。
              </p>
            </div>
          )}
          {current?.messages.map((m, i) => (
            <div key={i} className={`message ${m.role}`}>
              <div className="message-role">
                {m.role === "user" ? "あなた" : "アシスタント"}
              </div>
              <div className="message-body">{m.content}</div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className="composer">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="メッセージを入力（Enterで送信）"
            rows={3}
          />
          <button onClick={send} disabled={sending || !input.trim()}>
            {sending ? "送信中..." : "送信"}
          </button>
        </div>
      </main>
    </div>
  );
}
