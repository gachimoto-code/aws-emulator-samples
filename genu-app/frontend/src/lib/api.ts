import { config } from "./config";
import { storedToken } from "./auth";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

export interface Chat {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
}

export type ChatSummary = Omit<Chat, "messages">;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = storedToken();
  const res = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return (await res.json()) as T;
}

export async function createChat(): Promise<Chat> {
  const res = await request<{ chat: Chat }>("/chats", { method: "POST", body: "{}" });
  return res.chat;
}

export async function listChats(): Promise<ChatSummary[]> {
  const res = await request<{ chats: ChatSummary[] }>("/chats");
  return res.chats;
}

export async function getChat(id: string): Promise<Chat> {
  const res = await request<{ chat: Chat }>(`/chats/${id}`);
  return res.chat;
}

export async function deleteChat(id: string): Promise<void> {
  await request(`/chats/${id}`, { method: "DELETE" });
}

export async function sendMessage(
  id: string,
  text: string,
  modelId: string
): Promise<Chat> {
  const res = await request<{ chat: Chat }>(`/chats/${id}/messages`, {
    method: "POST",
    body: JSON.stringify({ text, modelId }),
  });
  return res.chat;
}
