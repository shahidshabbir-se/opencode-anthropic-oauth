import { randomBytes, createHash } from "node:crypto"

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize"
const TOKEN_URL = "https://console.anthropic.com/v1/oauth/token"
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback"
const SCOPES = "org:create_api_key user:profile user:inference"

const CLI_VERSION = "2.1.80"
const TOKEN_USER_AGENT = "anthropic"
const API_USER_AGENT = `claude-cli/${CLI_VERSION} (external, cli)`

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
  // The callback page may return "code#state" — strip the state suffix
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

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": TOKEN_USER_AGENT,
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

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": TOKEN_USER_AGENT,
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

export { API_USER_AGENT, CLI_VERSION }
