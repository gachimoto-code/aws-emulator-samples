import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { listChats } from "./lib/store";
import { json, error, userIdFromEvent } from "./lib/respond";

// GET /chats — list the caller's conversations, newest first,
// without their messages.
export const handler = async (event: APIGatewayProxyEventV2) => {
  const userId = userIdFromEvent(event);
  if (!userId) return error(401, "unauthorized");

  const chats = await listChats(userId);
  return json(200, { chats });
};
