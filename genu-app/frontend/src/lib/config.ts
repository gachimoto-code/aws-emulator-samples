// Values written by ../deploy.mjs into .env.local at deploy time.
export const config = {
  apiUrl: import.meta.env.VITE_API_URL as string,
  cognitoEndpoint: import.meta.env.VITE_COGNITO_ENDPOINT as string,
  userPoolId: import.meta.env.VITE_USER_POOL_ID as string,
  userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID as string,
  region: (import.meta.env.VITE_AWS_REGION as string) ?? "us-east-1",
};

export const MODELS = [
  { id: "anthropic.claude-3-5-sonnet-20241022-v2:0", label: "Claude 3.5 Sonnet" },
  { id: "anthropic.claude-3-haiku-20240307-v1:0", label: "Claude 3 Haiku" },
  { id: "amazon.titan-text-premier-v1:0", label: "Amazon Titan Text Premier" },
];
