const BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4002";

export type Task = {
  id: string;
  title: string;
  note: string;
  enqueuedAt: string;
};

export type PendingMessage = {
  messageId: string;
  receiptHandle: string;
  task: Task;
};

export type QueueState = {
  counts: { visible: number; inFlight: number; delayed: number };
  messages: PendingMessage[];
};

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getQueue(): Promise<QueueState> {
  return handle(await fetch(`${BASE}/api/tasks`));
}

export async function enqueue(
  title: string,
  note: string
): Promise<{ messageId: string; task: Task }> {
  return handle(
    await fetch(`${BASE}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, note }),
    })
  );
}

export async function complete(receiptHandle: string): Promise<void> {
  const res = await fetch(`${BASE}/api/tasks/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receiptHandle }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
}

export async function purge(): Promise<void> {
  const res = await fetch(`${BASE}/api/tasks/purge`, { method: "POST" });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
}
