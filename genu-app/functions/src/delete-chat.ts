import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { getChat, deleteChat } from "./lib/store";
import { json, error, userIdFromEvent } from "./lib/respond";

// DELETE /chats/{id} — delete one of the caller's conversations.
export const handler = async (event: APIGatewayProxyEventV2) => {
  const userId = userIdFromEvent(event);
  if (!userId) return error(401, "unauthorized");

  const id = event.pathParameters?.id;
  if (!id) return error(400, "id is required");

  const chat = await getChat(id);
  if (!chat || chat.userId !== userId) return error(404, "chat not found");

  await deleteChat(id);
  return json(200, { deleted: id });
};
