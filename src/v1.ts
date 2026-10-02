import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  createAuthorizationRequest,
  exchangeCodeForTokens,
  refreshTokens,
} from "./oauth.js"
import { oauthHeaders, transformBody, transformResponseStream } from "./transport.js"

// --- Claude CLI credential reader ---
interface CliCredentials {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

const OAUTH_TOKEN_URL = "https://claude.ai/v1/oauth/token"
const OAUTH_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"

function readCliCredentials(): CliCredentials | null {
  try {
    const credPath = join(homedir(), ".claude", ".credentials.json")
    if (!existsSync(credPath)) return null
    const raw = readFileSync(credPath, "utf-8")
    const parsed = JSON.parse(raw)
    const data = parsed.claudeAiOauth ?? parsed
    if (
      typeof data.accessToken === "string" &&
      typeof data.refreshToken === "string" &&
      typeof data.expiresAt === "number"
    ) {
      return data as CliCredentials
    }
    return null
  } catch {
    return null
  }
}

async function refreshCliToken(refreshToken: string): Promise<CliCredentials | null> {
  try {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: OAUTH_CLIENT_ID,
      refresh_token: refreshToken,
    })
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
    }
    if (!data.access_token) return null
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: Date.now() + (data.expires_in ?? 36000) * 1000,
    }
  } catch {
    return null
  }
}

function cliAccessTokenReader() {
  let cachedCliCreds: CliCredentials | null = null
  return async function getCliAccessToken(): Promise<string | null> {
    if (cachedCliCreds && cachedCliCreds.expiresAt > Date.now() + 60_000) {
      return cachedCliCreds.accessToken
    }
    const fileCreds = readCliCredentials()
    if (!fileCreds) return null
    if (fileCreds.expiresAt > Date.now() + 60_000) {
      cachedCliCreds = fileCreds
      return fileCreds.accessToken
    }
    const fresh = await refreshCliToken(fileCreds.refreshToken)
    if (fresh) {
      cachedCliCreds = fresh
      return fresh.accessToken
    }
    return null
  }
}

// --- Constants ---
const REFRESH_INTERVAL = 5 * 60 * 1000
const REFRESH_BUFFER = 10 * 60 * 1000

const MAX_RETRY_DELAY_S = 20

async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  retries = 3,
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(input, init)
    if ((res.status === 429 || res.status === 529) && i < retries - 1) {
      const retryAfter = res.headers.get("retry-after")
      const parsed = retryAfter ? Number.parseInt(retryAfter, 10) : Number.NaN
      const delay = Number.isNaN(parsed)
        ? (i + 1) * 2000
        : Math.min(parsed, MAX_RETRY_DELAY_S) * 1000
      await new Promise((r) => setTimeout(r, delay))
      continue
    }
    return res
  }
  return fetch(input, init)
}

// --- Plugin ---
const plugin: Plugin = async ({ client }) => {
  let _getAuth: (() => Promise<any>) | null = null
  const getCliAccessToken = cliAccessTokenReader()

  async function proactiveRefresh() {
    if (!_getAuth) return
    try {
      const auth = await _getAuth()
      if (!auth || auth.type !== "oauth" || !auth.refresh) return
      if (auth.expires > Date.now() + REFRESH_BUFFER) return
      const fresh = await refreshTokens(auth.refresh)
      await client.auth.set({
        path: { id: "anthropic" },
        body: {
          type: "oauth",
          refresh: fresh.refresh,
          access: fresh.access,
          expires: fresh.expires,
        },
      })
    } catch {
      // Non-fatal
    }
  }

  const timer = setInterval(() => proactiveRefresh(), REFRESH_INTERVAL)

  return {
    dispose: async () => { clearInterval(timer); _getAuth = null },
    auth: {
      provider: "anthropic",
      async loader(getAuth, provider) {
        const auth = await getAuth()
        if ((auth as any).type !== "oauth") return {}

        _getAuth = getAuth
        proactiveRefresh()

        // Zero out cost for Pro/Max subscription
        for (const model of Object.values(provider.models)) {
          ;(model as any).cost = {
            input: 0,
            output: 0,
            cache: { read: 0, write: 0 },
          }
        }

        return {
          apiKey: "",
          async fetch(input: RequestInfo | URL, init?: RequestInit) {
            const auth = (await getAuth()) as any
            if (auth.type !== "oauth") return fetch(input, init)

            // Prefer Claude CLI credentials (first-party, Max plan)
            let access = await getCliAccessToken()

            // Fallback to plugin's own OAuth tokens
            if (!access) {
              access = auth.access as string
              if (!access || auth.expires < Date.now()) {
                try {
                  const fresh = await refreshTokens(auth.refresh)
                  await client.auth.set({
                    path: { id: "anthropic" },
                    body: {
                      type: "oauth",
                      refresh: fresh.refresh,
                      access: fresh.access,
                      expires: fresh.expires,
                    },
                  })
                  access = fresh.access
                } catch (err) {
                  throw new Error(
                    `Token refresh failed: ${err instanceof Error ? err.message : err}`,
                  )
                }
              }
            }

            // Build headers (pi-mono style: minimal, no billing header)
            const headers = new Headers()
            if (input instanceof Request) {
              input.headers.forEach((v, k) => { headers.set(k, v) })
            }
            if (init?.headers) {
              const h = init.headers
              if (h instanceof Headers) {
                h.forEach((v, k) => { headers.set(k, v) })
              } else if (Array.isArray(h)) {
                for (const [k, v] of h) {
                  if (v !== undefined) headers.set(k, String(v))
                }
              } else {
                for (const [k, v] of Object.entries(h)) {
                  if (v !== undefined) headers.set(k, String(v))
                }
              }
            }

            oauthHeaders(headers, access)
            // No x-anthropic-billing-header (pi-mono doesn't send it)

            const url = input instanceof Request ? input.url : input.toString()
            // No ?beta=true (pi-mono doesn't add it)

            const body = transformBody(init?.body, url)

            const response = await fetchWithRetry(url, {
              method: init?.method ?? "POST",
              headers,
              body,
              signal: init?.signal,
            })

            // (debug logging removed)

            return transformResponseStream(response)
          },
        }
      },
      methods: [
        {
          type: "oauth" as const,
          label: "Claude Pro/Max",
          authorize() {
            const { url, verifier } = createAuthorizationRequest()

            return Promise.resolve({
              url,
              instructions:
                "Open the link above to authenticate with your Claude account. " +
                "After authorizing, you'll receive a code — paste it below.",
              method: "code" as const,
              async callback(code: string) {
                try {
                  const tokens = await exchangeCodeForTokens(code, verifier)
                  return {
                    type: "success" as const,
                    access: tokens.access,
                    refresh: tokens.refresh,
                    expires: tokens.expires,
                  }
                } catch (err) {
                  console.error(
                    "opencode-anthropic-oauth: token exchange failed:",
                    err instanceof Error ? err.message : err,
                  )
                  return { type: "failed" as const }
                }
              },
            })
          },
        },
      ],
    },
  }
}

export default plugin
