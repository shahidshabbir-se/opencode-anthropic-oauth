import test from "node:test"
import assert from "node:assert/strict"
import { v1, NOW, TOKEN_URL, tokenResponse } from "./helpers/offline.mjs"

const MODEL_URL = "https://model.invalid/v1/messages"

test("V1 API-key loader leaves models and auth untouched with an inert interval", async (t) => {
  const fixture = await v1(t, { type: "api", key: "synthetic-api-key" })
  assert.equal(fixture.hooks.auth.provider, "anthropic")
  assert.deepEqual(await fixture.load(), {})
  assert.equal(fixture.provider.models.synthetic.cost.input, 3)
  assert.equal(fixture.intervals.length, 1)
  assert.equal(fixture.intervals[0].delay, 300_000)
  await fixture.intervals[0].callback()
  assert.deepEqual(fixture.requests, [])
  assert.deepEqual(fixture.saved, [])
  assert.equal(fixture.credentialChecks, 0)
})

test("OAuth loader zeroes subscription costs and keeps valid tokens unchanged", async (t) => {
  const fixture = await v1(t)
  const loaded = await fixture.load()
  assert.equal(loaded.apiKey, "")
  assert.deepEqual(fixture.provider.models.synthetic.cost, {
    input: 0, output: 0, cache: { read: 0, write: 0 },
  })
  await fixture.intervals[0].callback()
  assert.deepEqual(fixture.saved, [])
  assert.deepEqual(fixture.requests, [])
})

test("OAuth request merges headers, preserves cache metadata and signal, and maps tools", async (t) => {
  const fixture = await v1(t)
  const loaded = await fixture.load()
  fixture.respond = () => new Response(null, { status: 204 })
  const signal = new AbortController().signal
  const cache = { type: "ephemeral", ttl: "1h" }
  const kept = { type: "text", text: "Synthetic extension instructions", cache_control: cache }
  const input = new Request(MODEL_URL, { headers: {
    "x-request-only": "keep", "x-override": "original", "x-api-key": "synthetic-old-key",
  } })
  await loaded.fetch(input, { method: "POST", signal, headers: new Headers({
    "x-override": "new", "anthropic-beta": "custom-beta,oauth-test",
    "anthropic-version": "2023-06-01", "cache-control": "no-cache",
  }), body: JSON.stringify({ system: [
    { type: "text", text: "OpenCode synthetic instructions" }, kept,
  ], tools: [{ name: "read", input_schema: {}, cache_control: cache }, { name: "custom_tool" }],
  messages: [{ role: "assistant", content: [
    { type: "tool_use", name: "bash", id: "synthetic-id", input: {} },
    { type: "text", text: "unchanged", cache_control: cache },
  ] }] }) })
  const [{ input: url, init }] = fixture.requests
  assert.equal(url, MODEL_URL)
  assert.equal(init.signal, signal)
  assert.equal(init.method, "POST")
  assert.equal(init.headers.get("x-request-only"), "keep")
  assert.equal(init.headers.get("x-override"), "new")
  assert.equal(init.headers.get("cache-control"), "no-cache")
  assert.equal(init.headers.get("anthropic-version"), "2023-06-01")
  assert.equal(init.headers.get("authorization"), "Bearer synthetic-access")
  assert.equal(init.headers.has("x-api-key"), false)
  assert.equal(init.headers.get("anthropic-beta"), "oauth-test,cache-test,custom-beta")
  assert.equal(init.headers.get("user-agent"), "synthetic-cli/1.0")
  assert.equal(init.headers.get("x-app"), "cli")
  assert.equal(init.headers.get("anthropic-dangerous-direct-browser-access"), "true")
  const body = JSON.parse(init.body)
  assert.deepEqual(body.system, [
    { type: "text", text: "You are Claude Code, Anthropic's official CLI for Claude." }, kept,
  ])
  assert.equal(body.tools[0].name, "Read")
  assert.deepEqual(body.tools[0].cache_control, cache)
  assert.equal(body.tools[1].name, "custom_tool")
  assert.equal(body.messages[0].content[0].name, "Bash")
  assert.deepEqual(body.messages[0].content[1].cache_control, cache)
  assert.equal(fixture.credentialChecks, 1)
  assert.equal(fixture.credentialReads, 0)
})

test("tuple and object request headers survive OAuth rewriting", async (t) => {
  const fixture = await v1(t)
  const loaded = await fixture.load()
  fixture.respond = () => new Response(null, { status: 204 })
  for (const headers of [[ ["x-synthetic", "tuple"] ], { "x-synthetic": "object" }]) {
    await loaded.fetch(MODEL_URL, { headers })
  }
  assert.equal(fixture.requests[0].init.headers.get("x-synthetic"), "tuple")
  assert.equal(fixture.requests[1].init.headers.get("x-synthetic"), "object")
})

test("a switch away from OAuth passes input, init and response through verbatim", async (t) => {
  const fixture = await v1(t)
  const loaded = await fixture.load()
  fixture.auth = { type: "api", key: "synthetic-api-key" }
  const response = new Response("synthetic passthrough")
  fixture.respond = () => response
  const input = new Request(MODEL_URL)
  const init = { method: "GET", headers: { "x-synthetic": "unchanged" } }
  assert.equal(await loaded.fetch(input, init), response)
  assert.equal(fixture.requests[0].input, input)
  assert.equal(fixture.requests[0].init, init)
  assert.equal(fixture.credentialChecks, 0)
})

test("expired plugin tokens refresh and persist before the model request", async (t) => {
  const fixture = await v1(t)
  const loaded = await fixture.load()
  fixture.auth = { ...fixture.auth, expires: NOW - 1 }
  fixture.respond = (url) => url === TOKEN_URL ? tokenResponse() : new Response(null, { status: 204 })
  await loaded.fetch(MODEL_URL)
  assert.equal(fixture.requests.length, 2)
  assert.equal(fixture.requests[0].input, TOKEN_URL)
  assert.equal(fixture.requests[1].init.headers.get("authorization"), "Bearer synthetic-fresh-access")
  assert.deepEqual(fixture.saved, [{ path: { id: "anthropic" }, body: {
    type: "oauth", access: "synthetic-fresh-access", refresh: "synthetic-fresh-refresh", expires: NOW + 3_600_000,
  } }])
})

test("background refresh failure is nonfatal; request refresh failure stops dispatch", async (t) => {
  const fixture = await v1(t)
  const loaded = await fixture.load()
  fixture.auth = { ...fixture.auth, expires: NOW - 1 }
  fixture.respond = () => new Response("synthetic denial", { status: 400 })
  await fixture.intervals[0].callback()
  await assert.rejects(loaded.fetch(MODEL_URL), /Token refresh failed: Token refresh failed: 400/)
  assert.equal(fixture.requests.length, 2)
  assert.ok(fixture.requests.every(({ input }) => input === TOKEN_URL))
  assert.deepEqual(fixture.saved, [])
})

test("synthetic CLI fallback tokens are cached without accessing an actual home", async (t) => {
  const fixture = await v1(t)
  const loaded = await fixture.load()
  fixture.auth = { ...fixture.auth, access: "" }
  fixture.credentials = { claudeAiOauth: {
    accessToken: "synthetic-cli-access", refreshToken: "synthetic-cli-refresh", expiresAt: NOW + 3_600_000,
  } }
  fixture.respond = () => new Response(null, { status: 204 })
  await loaded.fetch(MODEL_URL)
  await loaded.fetch(MODEL_URL)
  assert.equal(fixture.credentialReads, 1)
  assert.ok(fixture.requests.every(({ init }) => init.headers.get("authorization") === "Bearer synthetic-cli-access"))
})

test("synthetic expired CLI credentials refresh entirely through mocked HTTP", async (t) => {
  const fixture = await v1(t)
  const loaded = await fixture.load()
  fixture.auth = { ...fixture.auth, access: "" }
  fixture.credentials = { accessToken: "synthetic-expired-cli", refreshToken: "synthetic-cli-refresh", expiresAt: NOW - 1 }
  fixture.respond = (url) => url === "https://claude.ai/v1/oauth/token"
    ? tokenResponse() : new Response(null, { status: 204 })
  await loaded.fetch(MODEL_URL)
  assert.equal(fixture.credentialReads, 1)
  assert.equal(new URLSearchParams(fixture.requests[0].init.body).get("refresh_token"), "synthetic-cli-refresh")
  assert.equal(fixture.requests[1].init.headers.get("authorization"), "Bearer synthetic-fresh-access")
})

test("credential read errors fall back to synthetic plugin auth", async (t) => {
  const fixture = await v1(t)
  const loaded = await fixture.load()
  fixture.credentials = new Error("synthetic read failure")
  fixture.respond = () => new Response(null, { status: 204 })
  await loaded.fetch(MODEL_URL)
  assert.equal(fixture.credentialReads, 1)
  assert.equal(fixture.requests[0].init.headers.get("authorization"), "Bearer synthetic-access")
})

test("SSE tool names survive split chunks, UTF-8 boundaries and unterminated tails", async (t) => {
  const fixture = await v1(t)
  const loaded = await fixture.load()
  const text = 'data: {"name":"Read","text":"café"}\n\ndata: {"name":"custom_tool"}\n\ndata: {"name":"Bash"}'
  const bytes = new TextEncoder().encode(text)
  fixture.respond = () => new Response(new ReadableStream({ start(controller) {
    // One byte per chunk splits names, event delimiters, and multibyte text.
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
    controller.close()
  } }), { status: 200, statusText: "Synthetic OK", headers: { "content-type": "text/event-stream", "x-synthetic": "kept" } })
  const response = await loaded.fetch(MODEL_URL)
  assert.equal(response.status, 200)
  assert.equal(response.statusText, "Synthetic OK")
  assert.equal(response.headers.get("x-synthetic"), "kept")
  assert.equal(await response.text(), text.replace('"name":"Read"', '"name": "read"').replace('"name":"Bash"', '"name": "bash"'))
})

test("error responses remain identical and malformed request bodies pass through", async (t) => {
  const fixture = await v1(t)
  const loaded = await fixture.load()
  const error = new Response('synthetic {"name":"Read"}', { status: 400 })
  fixture.respond = () => error
  assert.equal(await loaded.fetch(MODEL_URL, { body: "{synthetic invalid JSON" }), error)
  assert.equal(fixture.requests[0].init.body, "{synthetic invalid JSON")
  assert.equal(await error.text(), 'synthetic {"name":"Read"}')
})

test("model retries cap retry-after delays and stop at three attempts", async (t) => {
  const fixture = await v1(t)
  const loaded = await fixture.load()
  fixture.respond = () => new Response("synthetic overloaded", { status: 529, headers: { "retry-after": "99" } })
  assert.equal((await loaded.fetch(MODEL_URL)).status, 529)
  assert.equal(fixture.requests.length, 3)
  assert.deepEqual(fixture.delays, [20_000, 20_000])
})

test("V1 authorization callback maps synthetic exchange success and failure", async (t) => {
  const fixture = await v1(t)
  const [method] = fixture.hooks.auth.methods
  assert.equal(method.type, "oauth")
  const authorization = await method.authorize()
  assert.equal(authorization.method, "code")
  assert.equal(new URL(authorization.url).hostname, "oauth.invalid")
  fixture.respond = () => tokenResponse()
  assert.deepEqual(await authorization.callback("synthetic-code#state"), {
    type: "success", access: "synthetic-fresh-access", refresh: "synthetic-fresh-refresh", expires: NOW + 3_600_000,
  })
  const errors = []
  t.mock.method(console, "error", (...args) => errors.push(args))
  fixture.respond = () => new Response("synthetic denial", { status: 400 })
  assert.deepEqual(await authorization.callback("synthetic-code"), { type: "failed" })
  assert.equal(errors.length, 1)
})
