const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4001";

export type FileEntry = {
  key: string;
  size: number;
  lastModified: string | null;
};

export type FileList = {
  files: FileEntry[];
  count: number;
  totalBytes: number;
};

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function listFiles(): Promise<FileList> {
  return handle(await fetch(`${BASE}/api/files`));
}

export async function uploadFile(
  file: File,
  prefix: string
): Promise<{ key: string; size: number }> {
  const form = new FormData();
  form.append("file", file);
  if (prefix) form.append("prefix", prefix);
  return handle(
    await fetch(`${BASE}/api/files`, { method: "POST", body: form })
  );
}

export function downloadUrl(key: string): string {
  return `${BASE}/api/files/download?key=${encodeURIComponent(key)}`;
}

export async function deleteFile(key: string): Promise<void> {
  const res = await fetch(
    `${BASE}/api/files?key=${encodeURIComponent(key)}`,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
}
