import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from "@aws-sdk/client-cognito-identity-provider";
import { config } from "./config";

// Talks to the emulator's Cognito endpoint directly (GenU uses Amplify
// Auth against the real Cognito endpoint; here the SDK is pointed at
// the emulator instead).
//
// Browser note: the emulator serves HTTPS with its own CA, so a real
// browser must trust that CA before these calls succeed. See README.
const client = new CognitoIdentityProviderClient({
  region: config.region,
  endpoint: config.cognitoEndpoint,
});

const TOKEN_KEY = "genu-id-token";

export function storedToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export async function signIn(email: string, password: string): Promise<void> {
  const res = await client.send(
    new InitiateAuthCommand({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: config.userPoolClientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    })
  );
  const token = res.AuthenticationResult?.IdToken;
  if (!token) throw new Error("サインインに失敗しました");
  localStorage.setItem(TOKEN_KEY, token);
}

export function signOut(): void {
  localStorage.removeItem(TOKEN_KEY);
}
