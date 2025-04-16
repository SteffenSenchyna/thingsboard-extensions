import { Client, createClient } from "@1password/sdk";

interface ServiceAccountSecrets {
  credential: string;
  username: string;
  url: string;
}

interface TbClient {
  token: string;
  baseUrl: string;
  request: (path: string, options?: RequestInit) => Promise<Response>;
}

async function initOpClient(): Promise<Client> {
  const token = process.env.OP_SERVICE_ACCOUNT_TOKEN;
  if (!token) {
    throw new Error(
      "OP_SERVICE_ACCOUNT_TOKEN is not set in environment variables"
    );
  }
  return await createClient({
    auth: token,
    integrationName: "production",
    integrationVersion: "v1.0.0",
  });
}

async function getServiceAccountSecrets(): Promise<ServiceAccountSecrets> {
  const client = await initOpClient();
  const account: string = "sys_admin";

  // Helper function to generate the secret path based on the account
  const secretPath = (secretType: string): string =>
    `op://thingsboard/${account}/${secretType}`;

  const [credential, username, url] = await Promise.all([
    client.secrets.resolve(secretPath("credential")),
    client.secrets.resolve(secretPath("username")),
    client.secrets.resolve(secretPath("url")),
  ]);

  return { credential, username, url };
}

function getTbClient(token: string, baseUrl: string): TbClient {
  return {
    token,
    baseUrl,
    request: async (path: string, options: RequestInit = {}) => {
      // Use baseUrl if the provided path is relative.
      const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
      const headers = new Headers(options.headers);
      headers.set("X-Authorization", `Bearer ${token}`);
      const updatedOptions = { ...options, headers };
      return await fetch(url, updatedOptions);
    },
  };
}

async function tbClient(): Promise<TbClient> {
  const secrets = await getServiceAccountSecrets();

  const myHeaders: Headers = new Headers();
  myHeaders.append("Content-Type", "application/json");
  myHeaders.append("Accept", "application/json");

  // Use the URL from the secrets as the login endpoint.
  const loginUrl: string = secrets.url;
  const body: string = JSON.stringify({
    username: secrets.username,
    password: secrets.credential,
  });

  const requestOptions: RequestInit = {
    method: "POST",
    headers: myHeaders,
    body,
    redirect: "follow",
  };

  const response = await fetch(loginUrl, requestOptions);
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  const jwtToken: string = result.token;
  if (!jwtToken) {
    throw new Error("JWT token not found in login response");
  }

  // Fixed hostname for all subsequent requests.
  const baseUrl = "https://things-board.cloudadc.biz";

  return getTbClient(jwtToken, baseUrl);
}

export { tbClient };
