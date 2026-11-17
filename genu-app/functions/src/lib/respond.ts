import type { APIGatewayProxyEventV2 } from "aws-lambda";

export function json(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function error(statusCode: number, message: string) {
  return json(statusCode, { message });
}

// Extracts the caller's user id (the `sub` claim) from the Cognito ID
// token in the Authorization header.
//
// NOTE (local simplification): GenU on real AWS puts a Cognito JWT
// authorizer on API Gateway, which verifies the token before the
// function runs. Here the function only decodes the token to identify
// the caller and does not verify the signature — acceptable for a
// local emulator reproduction, not for production.
export function userIdFromEvent(event: APIGatewayProxyEventV2): string | null {
  const header =
    event.headers?.authorization ?? event.headers?.Authorization ?? "";
  const token = header.replace(/^Bearer\s+/i, "");
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export function bodyJson<T>(event: APIGatewayProxyEventV2): T {
  if (!event.body) return {} as T;
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  return JSON.parse(raw) as T;
}
