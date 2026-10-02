import { BETA_FLAGS, USER_AGENT } from "./oauth.js"

// Claude Code canonical casing; unknown extension tool names stay unchanged.
const CC_TOOLS = [
  "Read", "Write", "Edit", "Bash", "Grep", "Glob",
  "AskUserQuestion", "EnterPlanMode", "ExitPlanMode",
  "KillShell", "NotebookEdit", "Skill", "Task",
  "TaskOutput", "TodoWrite", "WebFetch", "WebSearch",
]
const ccLookup = new Map(CC_TOOLS.map((name) => [name.toLowerCase(), name]))
const toCC = (name: string) => ccLookup.get(name.toLowerCase()) ?? name
const SYSTEM_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude."

export function oauthHeaders(headers: Headers, access: string): void {
  const incoming = (headers.get("anthropic-beta") || "")
    .split(",")
    .map((flag) => flag.trim())
    .filter(Boolean)
  const required = BETA_FLAGS.split(",").map((flag) => flag.trim())
  headers.set("authorization", `Bearer ${access}`)
  headers.set("anthropic-beta", [...new Set([...required, ...incoming])].join(","))
  headers.set("anthropic-dangerous-direct-browser-access", "true")
  headers.set("user-agent", USER_AGENT)
  headers.set("x-app", "cli")
  headers.delete("x-api-key")
}

export function transformBody(body: BodyInit | null | undefined, url: string): BodyInit | null | undefined {
  if (typeof body !== "string") return body
  try {
    const parsed = JSON.parse(body)
    if (url.includes("/v1/messages")) {
      const kept = Array.isArray(parsed.system) ? parsed.system.filter((entry: any) => {
        const text = typeof entry === "string" ? entry : entry?.text ?? ""
        return ![/opencode/i, /anomalyco/i, /open\s*code/i].some((pattern) => pattern.test(text))
      }) : []
      parsed.system = [{ type: "text", text: SYSTEM_IDENTITY }, ...kept]
    }
    if (Array.isArray(parsed.tools)) {
      parsed.tools = parsed.tools.map((tool: any) => ({
        ...tool,
        name: tool.name ? toCC(tool.name) : tool.name,
      }))
    }
    if (Array.isArray(parsed.messages)) {
      parsed.messages = parsed.messages.map((message: any) => {
        if (!Array.isArray(message.content)) return message
        return {
          ...message,
          content: message.content.map((block: any) => {
            if (block.type !== "tool_use" || typeof block.name !== "string") return block
            return { ...block, name: toCC(block.name) }
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
  for (const name of CC_TOOLS) {
    text = text.replace(new RegExp(`"name"\\s*:\\s*"${name}"`, "g"), `"name": "${name.toLowerCase()}"`)
  }
  return text
}

export function transformResponseStream(response: Response, signal?: AbortSignal): Response {
  if (!response.body || !response.ok) return response
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ""
  let cancelled = false
  let abort: (() => void) | undefined
  const release = () => {
    if (abort) signal?.removeEventListener("abort", abort)
    reader.releaseLock()
  }
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      abort = () => {
        cancelled = true
        controller.error(signal?.reason)
        void reader.cancel(signal?.reason).finally(release).catch(() => {})
      }
      signal?.addEventListener("abort", abort, { once: true })
      if (signal?.aborted) abort()
    },
    async pull(controller) {
      try {
        for (;;) {
          const boundary = /\r?\n\r?\n/.exec(buffer)
          if (boundary) {
            const end = boundary.index + boundary[0].length
            const event = buffer.slice(0, end)
            buffer = buffer.slice(end)
            controller.enqueue(encoder.encode(stripCCNames(event)))
            return
          }
          const { done, value } = await reader.read()
          if (cancelled) return
          if (done) {
            buffer += decoder.decode()
            if (buffer) controller.enqueue(encoder.encode(stripCCNames(buffer)))
            controller.close()
            release()
            return
          }
          buffer += decoder.decode(value, { stream: true })
        }
      } catch (error) {
        if (!cancelled) controller.error(error)
        release()
      }
    },
    async cancel(reason) {
      cancelled = true
      try { await reader.cancel(reason) } finally { release() }
    },
  })
  const headers = new Headers(response.headers)
  // Rewritten bytes no longer have the original representation length/encoding.
  headers.delete("content-length")
  headers.delete("content-encoding")
  return new Response(stream, { status: response.status, statusText: response.statusText, headers })
}
