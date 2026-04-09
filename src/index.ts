import type { Plugin } from "@opencode-ai/plugin"
import { readFileSync, existsSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  createAuthorizationRequest,
  exchangeCodeForTokens,
  refreshTokens,
  USER_AGENT,
  BETA_FLAGS,
} from "./oauth.js"

// Claude Code 2.x canonical tool names (from pi-mono/cchistory)
const CC_TOOLS = [
  "Read", "Write", "Edit", "Bash", "Grep", "Glob",
  "AskUserQuestion", "EnterPlanMode", "ExitPlanMode",
  "KillShell", "NotebookEdit", "Skill", "Task",
  "TaskOutput", "TodoWrite", "WebFetch", "WebSearch",
]
const ccLookup = new Map(CC_TOOLS.map((t) => [t.toLowerCase(), t]))
const toCC = (name: string) => ccLookup.get(name.toLowerCase()) ?? name
const fromCC = (name: string) => {
  // Reverse: if name matches a CC canonical name, return lowercase
  if (ccLookup.has(name.toLowerCase()) && name !== name.toLowerCase()) {
    return name.toLowerCase()
  }
  return name
}

function transformBody(body: BodyInit | null | undefined): BodyInit | null | undefined {
  if (typeof body !== "string") return body
  try {
    const parsed = JSON.parse(body) as {
      tools?: Array<{ name?: string } & Record<string, unknown>>
      messages?: Array<{ content?: Array<Record<string, unknown>> }>
    }
    // Rename tools to CC canonical casing
    if (Array.isArray(parsed.tools)) {
      parsed.tools = parsed.tools.map((tool) => ({
        ...tool,
        name: tool.name ? toCC(tool.name) : tool.name,
      }))
    }
    // Rename tool_use blocks in messages
    if (Array.isArray(parsed.messages)) {
      parsed.messages = parsed.messages.map((message) => {
        if (!Array.isArray(message.content)) return message
        return {
          ...message,
          content: message.content.map((block) => {
            if (block.type !== "tool_use" || typeof block.name !== "string") return block
            return { ...block, name: toCC(block.name as string) }
          }),
        }
      })
    }
    return JSON.stringify(parsed)
  } catch {
    return body
  }
}

function stripCCNames(text: string): string {
  // Reverse CC canonical names back to original in response stream
  for (const ccName of CC_TOOLS) {
    const re = new RegExp(`"name"\\s*:\\s*"${ccName}"`, "g")
    text = text.replace(re, `"name": "${ccName.toLowerCase()}"`)
  }
  return text
}

function transformResponseStream(response: Response): Response {
  if (!response.body) return response

  // Don't transform error responses
  if (!response.ok) return response

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  const stream = new ReadableStream({
    async pull(controller) {
      for (;;) {
        const boundary = buffer.indexOf("\n\n")
        if (boundary !== -1) {
          const completeEvent = buffer.slice(0, boundary + 2)
          buffer = buffer.slice(boundary + 2)
          controller.enqueue(encoder.encode(stripCCNames(completeEvent)))
          return
        }
        const { done, value } = await reader.read()
        if (done) {
          if (buffer) {
            controller.enqueue(encoder.encode(stripCCNames(buffer)))
            buffer = ""
          }
          controller.close()
          return
        }
        buffer += decoder.decode(value, { stream: true })
      }
    },
  })
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

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

let cachedCliCreds: CliCredentials | null = null

async function getCliAccessToken(): Promise<string | null> {
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

// --- Constants ---
const REFRESH_INTERVAL = 5 * 60 * 1000
const REFRESH_BUFFER = 10 * 60 * 1000
const SYSTEM_IDENTITY =
  "You are Claude Code, Anthropic's official CLI for Claude."

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

// --- System prompt scrubbing (strips OpenCode references that trigger extra usage billing) ---
const OPENCODE_PATTERNS = [
  /opencode/i,
  /anomalyco/i,
  /open\s*code/i,
]

function containsOpencode(text: string): boolean {
  return OPENCODE_PATTERNS.some((p) => p.test(text))
}

function scrubText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s]*(?:opencode|anomalyco)[^\s]*/gi, "")
    .replace(/\bOpenCode\b/g, "Claude Code")
    .replace(/\bopencode\b/gi, "")
}

// --- Plugin ---
const plugin: Plugin = async ({ client }) => {
  let _getAuth: (() => Promise<any>) | null = null

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

  setInterval(() => proactiveRefresh(), REFRESH_INTERVAL)

  return {
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

            // Merge beta flags
            const incoming = (headers.get("anthropic-beta") || "")
              .split(",")
              .map((b) => b.trim())
              .filter(Boolean)
            const required = BETA_FLAGS.split(",").map((b) => b.trim())
            const merged = [...new Set([...required, ...incoming])].join(",")

            headers.set("authorization", `Bearer ${access}`)
            headers.set("anthropic-beta", merged)
            headers.set("anthropic-dangerous-direct-browser-access", "true")
            headers.set("user-agent", USER_AGENT)
            headers.set("x-app", "cli")
            headers.delete("x-api-key")
            // No x-anthropic-billing-header (pi-mono doesn't send it)

            const url = input instanceof Request ? input.url : input.toString()
            // No ?beta=true (pi-mono doesn't add it)

            // Transform body: remove OpenCode system entries, keep other plugins'.
            // Anthropic fingerprints the system prompt and routes non-Claude-Code
            // prompts to extra usage billing. We remove OpenCode's entries and
            // prepend the Claude Code identity. Other plugins' entries are preserved.
            let body = init?.body
            if (typeof body === "string" && url.includes("/v1/messages")) {
              try {
                const parsed = JSON.parse(body)
                if (Array.isArray(parsed.system)) {
                  // Remove OpenCode entries, keep other plugins'
                  const kept = parsed.system.filter((entry: any) => {
                    const text =
                      typeof entry === "string" ? entry : entry?.text ?? ""
                    return !containsOpencode(text)
                  })
                  parsed.system = [
                    { type: "text", text: SYSTEM_IDENTITY },
                    ...kept,
                  ]
                } else {
                  parsed.system = [{ type: "text", text: SYSTEM_IDENTITY }]
                }
                body = JSON.stringify(parsed)
              } catch {
                // leave body as-is
              }
            }

            // Rename tools to CC canonical casing (pi-mono approach)
            body = transformBody(body) ?? body

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
