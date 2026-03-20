import { randomBytes, createHash } from "node:crypto"

// Defaults — updated via npm publish. Override with env vars if needed.
const CLIENT_ID =
  process.env.ANTHROPIC_CLIENT_ID || "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
const AUTHORIZE_URL =
  process.env.ANTHROPIC_AUTHORIZE_URL || "https://claude.ai/oauth/authorize"
const TOKEN_URL =
  process.env.ANTHROPIC_TOKEN_URL ||
  "https://console.anthropic.com/v1/oauth/token"
const REDIRECT_URI =
  process.env.ANTHROPIC_REDIRECT_URI ||
  "https://console.anthropic.com/oauth/code/callback"
const SCOPES =
  process.env.ANTHROPIC_SCOPES ||
  "org:create_api_key user:profile user:inference"

const CLI_VERSION = process.env.ANTHROPIC_CLI_VERSION || "2.1.80"
const USER_AGENT =
  process.env.ANTHROPIC_USER_AGENT ||
  `claude-cli/${CLI_VERSION} (external, cli)`
const BETA_FLAGS =
  process.env.ANTHROPIC_BETA_FLAGS ||
  "interleaved-thinking-2025-04-14,fine-grained-tool-streaming-2025-05-14,oauth-2025-04-20"

export { USER_AGENT, BETA_FLAGS }

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  retries = 3,
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, init)
    if (res.status === 429 && i < retries - 1) {
      const delay = (i + 1) * 2000 // 2s, 4s, 6s
      await new Promise((r) => setTimeout(r, delay))
      continue
    }
    return res
  }
  return fetch(url, init)
}

export interface OAuthTokens {
  access: string
  refresh: string
  expires: number
}

function base64url(buf: Buffer): string {
  return buf.toString("base64url").replace(/=+$/, "")
}

function generateVerifier(): string {
  return base64url(randomBytes(32))
}

function generateChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest())
}

export function createAuthorizationRequest(): {
  url: string
  verifier: string
} {
  const verifier = generateVerifier()
  const challenge = generateChallenge(verifier)

  const params = new URLSearchParams({
    code: "true",
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state: verifier,
  })

  return {
    url: `${AUTHORIZE_URL}?${params}`,
    verifier,
  }
}

export function parseAuthCode(raw: string): string {
  const hashIdx = raw.indexOf("#")
  return hashIdx >= 0 ? raw.slice(0, hashIdx) : raw
}

export async function exchangeCodeForTokens(
  rawCode: string,
  verifier: string,
): Promise<OAuthTokens> {
  const code = parseAuthCode(rawCode.trim())

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    state: verifier,
  })

  const res = await fetchWithRetry(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(
      `Token exchange failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`,
    )
  }

  const data = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expires: Date.now() + data.expires_in * 1000,
  }
}

export async function refreshTokens(
  refreshToken: string,
): Promise<OAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  })

  const res = await fetchWithRetry(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": USER_AGENT,
    },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(
      `Token refresh failed: ${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`,
    )
  }

  const data = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  return {
    access: data.access_token,
    refresh: data.refresh_token,
    expires: Date.now() + data.expires_in * 1000,
  }
}
