import { GetCommand, PutCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE_NAME } from "./aws";

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

export async function putChat(chat: Chat): Promise<void> {
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: chat }));
}

export async function getChat(id: string): Promise<Chat | undefined> {
  const res = await ddb.send(
    new GetCommand({ TableName: TABLE_NAME, Key: { id } })
  );
  return res.Item as Chat | undefined;
}

export async function deleteChat(id: string): Promise<void> {
  await ddb.send(new DeleteCommand({ TableName: TABLE_NAME, Key: { id } }));
}

export async function listChats(
  userId: string
): Promise<Omit<Chat, "messages">[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "byUser",
      KeyConditionExpression: "userId = :u",
      ExpressionAttributeValues: { ":u": userId },
      ScanIndexForward: false, // newest first (by updatedAt)
    })
  );
  return (res.Items ?? []).map((item) => {
    const { messages: _messages, ...summary } = item as Chat;
    return summary;
  });
}
