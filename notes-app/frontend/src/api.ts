export interface Attachment {
  key: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface Note {
  id: string;
  title: string;
  body: string;
  attachment: Attachment | null;
  createdAt: string;
  updatedAt: string;
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listNotes: () => fetch(`${BASE}/api/notes`).then((r) => json<Note[]>(r)),
  createNote: (title: string, body: string) =>
    fetch(`${BASE}/api/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    }).then((r) => json<Note>(r)),
  updateNote: (id: string, title: string, body: string) =>
    fetch(`${BASE}/api/notes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    }).then((r) => json<Note>(r)),
  deleteNote: async (id: string) => {
    const res = await fetch(`${BASE}/api/notes/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(`${res.status}`);
  },
  uploadAttachment: (id: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return fetch(`${BASE}/api/notes/${id}/attachment`, {
      method: "POST",
      body: form,
    }).then((r) => json<Note>(r));
  },
  deleteAttachment: (id: string) =>
    fetch(`${BASE}/api/notes/${id}/attachment`, { method: "DELETE" }).then(
      (r) => json<Note>(r)
    ),
  attachmentUrl: (id: string) => `${BASE}/api/notes/${id}/attachment`,
};
