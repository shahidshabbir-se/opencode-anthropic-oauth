import type { Credential, Plugin } from "@opencode/plugin"
import { createAuthorizationRequest, exchangeCodeForTokens, refreshTokens } from "./oauth.js"
import { oauthHeaders, transformBody, transformResponseStream } from "./transport.js"

const METHOD_ID = "claude-pro-max"

async function requestBody(request: Request, signal: AbortSignal): Promise<string | undefined> {
  if (signal.aborted) throw signal.reason
  if (!request.body) return undefined
  const reader = request.clone().body!.getReader()
  const decoder = new TextDecoder()
  let text = ""
  const abort = () => {
    // A cloned Request is a tee: cancellation can wait for the untouched branch.
    // Do not await it, but cancel the pending read and release our branch's lock.
    void reader.cancel(signal.reason).catch(() => {})
  }
  signal.addEventListener("abort", abort, { once: true })
  if (signal.aborted) abort()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (signal.aborted) throw signal.reason
      if (done) return text + decoder.decode()
      text += decoder.decode(value, { stream: true })
    }
  } finally {
    signal.removeEventListener("abort", abort)
    reader.releaseLock()
  }
}

export const setup: Plugin.Plugin["setup"] = async (ctx) => {
  const controller = new AbortController()
  const registrations: Array<{ dispose(): Promise<void> }> = []
  const requests = new WeakSet<Request>()
  let oauth = false
  let revision = 0
  let subscription: Promise<void> | undefined
  let closed = false

  const cleanup = async () => {
    if (closed) return
    closed = true
    controller.abort(new DOMException("Plugin unloaded", "AbortError"))
    await subscription
    await Promise.all(registrations.map((registration) => registration.dispose()))
  }

  // The host owns selection, refresh and persistence. Never read CLI credentials here.
  const credential = async () => {
    const current = ++revision
    const connection = await ctx.integration.connection.active("anthropic")
    const value = connection ? await ctx.integration.connection.resolve(connection) : undefined
    if (!closed && current === revision && oauth !== (value?.type === "oauth")) {
      oauth = value?.type === "oauth"
      await ctx.model.reload()
    }
    return value
  }

  try {
    registrations.push(await ctx.integration.transform((editor) => {
      editor.method.update({
        integrationID: "anthropic",
        method: { id: METHOD_ID, type: "oauth", label: "Claude Pro/Max" },
        async authorize() {
          const { url, verifier } = createAuthorizationRequest()
          return {
            url,
            instructions: "Open the link to authenticate with your Claude account, then paste the authorization code.",
            mode: "code",
            async callback(code) {
              return {
                type: "oauth",
                methodID: METHOD_ID as Credential.OAuth["methodID"],
                ...await exchangeCodeForTokens(code, verifier),
              }
            },
          }
        },
        async refresh(value) {
          return { ...value, ...await refreshTokens(value.refresh) }
        },
      })
    }))

    await credential()
    registrations.push(await ctx.model.transform((editor) => {
      if (!oauth) return
      for (const model of editor.list("anthropic")) {
        editor.update(String(model.providerID), String(model.id), (draft) => {
          for (const tier of draft.cost) {
            // The editor DeepMutable type expands the schema's branded numbers.
            // Zero is valid in every price unit; keep the assertion at this boundary.
            tier.input = 0 as unknown as typeof tier.input
            tier.output = 0 as unknown as typeof tier.output
            tier.cache.read = 0 as unknown as typeof tier.cache.read
            tier.cache.write = 0 as unknown as typeof tier.cache.write
          }
        })
      }
    }))

    registrations.push(await ctx.session.hook("http.request", async (event) => {
      const value = await credential()
      const original = event.request
      // Native ModelResolver supplies authToken. Match that request's account rather
      // than replacing API-key requests or stale requests from a switched account.
      if (value?.type !== "oauth" || original.headers.has("x-api-key") ||
          original.headers.get("authorization") !== `Bearer ${value.access}`) return
      const signal = AbortSignal.any([controller.signal, original.signal])
      const body = await requestBody(original, signal)
      if (signal.aborted) throw signal.reason
      const headers = new Headers(original.headers)
      oauthHeaders(headers, value.access)
      headers.delete("content-length")
      event.request = new Request(original, { headers, body: transformBody(body, original.url) })
      requests.add(event.request)
    }, { providerID: "anthropic" }))

    registrations.push(await ctx.session.hook("http.response", (event) => {
      if (!requests.has(event.request)) return
      const contentType = event.response.headers.get("content-type") ?? ""
      if (!contentType.includes("text/event-stream")) return
      event.response = transformResponseStream(event.response,
        AbortSignal.any([controller.signal, event.request.signal]))
    }, { providerID: "anthropic" }))

    subscription = (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (event.type === "integration.updated" || event.type === "credential.updated" ||
              event.type === "credential.switched") await credential()
        }
      } catch {
        if (!controller.signal.aborted) console.error("opencode-anthropic-oauth: account subscription stopped")
      }
    })()
    return cleanup
  } catch (error) {
    await cleanup()
    throw error
  }
}
