import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { randomUUID } from "node:crypto";
import { putChat, type Chat } from "./lib/store";
import { json, error, userIdFromEvent } from "./lib/respond";

// POST /chats — create a new (empty) conversation.
export const handler = async (event: APIGatewayProxyEventV2) => {
  const userId = userIdFromEvent(event);
  if (!userId) return error(401, "unauthorized");

  const now = Date.now();
  const chat: Chat = {
    id: randomUUID(),
    userId,
    title: "新しいチャット",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  await putChat(chat);
  return json(201, { chat });
};
