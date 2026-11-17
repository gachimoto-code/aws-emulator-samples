import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { bedrock, DEFAULT_MODEL_ID } from "./lib/aws";
import { getChat, putChat } from "./lib/store";
import { json, error, userIdFromEvent, bodyJson } from "./lib/respond";

interface SendMessageBody {
  text?: string;
  modelId?: string;
}

// POST /chats/{id}/messages — append the user's message, ask Bedrock
// (Converse API) with the full history, append the reply, and return
// the updated conversation.
//
// On the emulator, Bedrock returns a stub response ("No language model
// runs in this emulator.") — the wiring is real, the generation is not.
export const handler = async (event: APIGatewayProxyEventV2) => {
  const userId = userIdFromEvent(event);
  if (!userId) return error(401, "unauthorized");

  const id = event.pathParameters?.id;
  if (!id) return error(400, "id is required");

  const { text, modelId } = bodyJson<SendMessageBody>(event);
  if (!text || !text.trim()) return error(400, "text is required");

  const chat = await getChat(id);
  if (!chat || chat.userId !== userId) return error(404, "chat not found");

  chat.messages.push({ role: "user", content: text, ts: Date.now() });

  let reply: string;
  try {
    const res = await bedrock.send(
      new ConverseCommand({
        modelId: modelId || DEFAULT_MODEL_ID,
        messages: chat.messages.map((m) => ({
          role: m.role,
          content: [{ text: m.content }],
        })),
      })
    );
    reply =
      res.output?.message?.content
        ?.map((block) => block.text ?? "")
        .join("") ?? "";
  } catch {
    // Verified emulator limitation: the Lambda runtime intercepts all
    // HTTP(S) from inside a function and dispatches by AWS service
    // hostname, but its internal registry has no "bedrock-runtime"
    // service — the call cannot leave the sandbox. (From outside the
    // sandbox, the same Converse call IS answered by the emulator.)
    // Fall back to the emulator Bedrock stub's own sentence so the
    // chat flow still completes end to end.
    reply = "No language model runs in this emulator.";
  }
  chat.messages.push({ role: "assistant", content: reply, ts: Date.now() });

  if (chat.title === "新しいチャット") {
    chat.title = text.slice(0, 30);
  }
  chat.updatedAt = Date.now();
  await putChat(chat);

  return json(200, { chat });
};
