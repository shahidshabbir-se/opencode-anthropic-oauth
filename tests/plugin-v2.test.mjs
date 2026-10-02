import test from "node:test"
import assert from "node:assert/strict"
import { v2, tokenResponse, NOW } from "./helpers/offline.mjs"

const URL = "https://custom-model.invalid/v1/messages"
const body = JSON.stringify({ system: [{ type: "text", text: "OpenCode synthetic" },
  { type: "text", text: "Keep", cache_control: { type: "ephemeral" } }],
  tools: [{ name: "read", cache_control: { type: "ephemeral" } }],
  messages: [{ role: "assistant", content: [{ type: "tool_use", name: "bash" }] }] })
const oauthRequest = (options = {}) => new Request(URL, { method: "POST", body,
  headers: { authorization: "Bearer synthetic-access", "anthropic-beta": "custom-beta",
    "cache-control": "no-cache", "content-type": "application/json" }, ...options })

test("V2 registers native OAuth authorization and refresh without credential-file reads", async (t) => {
  const fixture = await v2(t)
  const [method] = fixture.methods
  assert.equal(method.integrationID, "anthropic")
  assert.deepEqual(method.method, { id: "claude-pro-max", type: "oauth", label: "Claude Pro/Max" })
  const auth = await method.authorize({})
  assert.equal(auth.mode, "code")
  fixture.respond = () => tokenResponse()
  const result = await auth.callback("synthetic-code#state")
  assert.deepEqual(result, { type: "oauth", methodID: "claude-pro-max",
    access: "synthetic-fresh-access", refresh: "synthetic-fresh-refresh", expires: NOW + 3_600_000 })
  assert.deepEqual(await method.refresh(result), result)
  assert.equal(fixture.credentialChecks, 0)
  assert.equal(fixture.intervals.length, 0)
  assert.equal(fixture.cost()[0].input, 0)
})

test("V2 Request-only bodies preserve custom endpoint, signal, headers and cache metadata", async (t) => {
  const fixture = await v2(t)
  const controller = new AbortController()
  const original = oauthRequest({ signal: controller.signal })
  const request = await fixture.request(original)
  assert.equal(original.bodyUsed, false)
  assert.equal(request.url, URL)
  assert.equal(request.method, "POST")
  assert.equal(request.headers.get("authorization"), "Bearer synthetic-access")
  assert.equal(request.headers.get("cache-control"), "no-cache")
  assert.equal(request.headers.get("anthropic-beta"), "oauth-test,cache-test,custom-beta")
  assert.equal(request.headers.get("x-app"), "cli")
  const parsed = await request.json()
  assert.equal(parsed.system[0].text, "You are Claude Code, Anthropic's official CLI for Claude.")
  assert.equal(parsed.system[1].text, "Keep")
  assert.deepEqual(parsed.system[1].cache_control, { type: "ephemeral" })
  assert.equal(parsed.tools[0].name, "Read")
  assert.deepEqual(parsed.tools[0].cache_control, { type: "ephemeral" })
  assert.equal(parsed.messages[0].content[0].name, "Bash")
  controller.abort()
  assert.equal(request.signal.aborted, true)
  assert.equal(fixture.credentialChecks, 0)
})

test("V2 API-key and disconnected requests/responses pass through by identity", async (t) => {
  const fixture = await v2(t, { type: "key", key: "synthetic-key" })
  const request = new Request(URL, { method: "POST", body, headers: { "x-api-key": "synthetic-key" } })
  const response = new Response('data: {"name":"Read"}\n\n')
  assert.equal(await fixture.request(request), request)
  assert.equal(await fixture.response(request, response), response)
  assert.equal(fixture.cost()[0].input, 3)
  fixture.connection = undefined
  assert.equal(await fixture.request(request), request)
  assert.equal(fixture.credentialChecks, 0)
})

test("V2 response rewriting follows the dispatched OAuth request across account changes", async (t) => {
  const fixture = await v2(t)
  const request = await fixture.request(oauthRequest())
  fixture.credential = { type: "key", key: "synthetic-key" }
  const text = 'data: {"name":"Read","text":"café"}\n\ndata: {"name":"Bash"}'
  const bytes = new TextEncoder().encode(text)
  const response = new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
    controller.close()
  } }), { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", "content-length": "99" } })
  const rewritten = await fixture.response(request, response)
  assert.equal(rewritten.headers.get("cache-control"), "no-cache")
  assert.equal(rewritten.headers.has("content-length"), false)
  assert.equal(await rewritten.text(), text.replace('"name":"Read"', '"name": "read"').replace('"name":"Bash"', '"name": "bash"'))
  const keyRequest = new Request(URL, { headers: { "x-api-key": "synthetic-key" } })
  assert.equal(await fixture.request(keyRequest), keyRequest)
})

test("V2 stream cancellation reaches the original response reader", async (t) => {
  const fixture = await v2(t)
  const request = await fixture.request(oauthRequest())
  let cancelled
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new TextEncoder().encode('data: {"name":"Read"}\n\n')) },
    cancel(reason) { cancelled = reason },
  }), { headers: { "content-type": "text/event-stream" } })
  const rewritten = await fixture.response(request, response)
  const reader = rewritten.body.getReader()
  await reader.read()
  await reader.cancel("synthetic-stop")
  assert.equal(cancelled, "synthetic-stop")
})

test("V2 ignores mismatched bearer/API-key overrides and cleans its subscription", async (t) => {
  const fixture = await v2(t)
  const request = oauthRequest({ headers: { authorization: "Bearer synthetic-other-account" } })
  assert.equal(await fixture.request(request), request)
  const keyRequest = oauthRequest({ headers: { "x-api-key": "synthetic-key", authorization: "Bearer synthetic-access" } })
  assert.equal(await fixture.request(keyRequest), keyRequest)
  await fixture.cleanup()
  assert.equal(fixture.subscriptionSignal.aborted, true)
  assert.ok(fixture.registrations.every((registration) => registration.disposed))
})

test("V2 account-change events refresh OAuth-only pricing and resolve the selected account", async (t) => {
  const fixture = await v2(t)
  fixture.connection = { type: "credential", id: "synthetic-second", method: "key" }
  fixture.credential = { type: "key", key: "synthetic-key" }
  fixture.deliver({ type: "integration.updated", properties: {} })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(fixture.cost()[0].input, 3)
  assert.ok(fixture.reloads > 0)
  assert.equal(fixture.resolved.at(-1).id, "synthetic-second")
})

test("V2 plugin unload cancels active rewritten response streams", async (t) => {
  const fixture = await v2(t)
  const request = await fixture.request(oauthRequest())
  let cancelled = false
  const response = new Response(new ReadableStream({
    pull(controller) { controller.enqueue(new TextEncoder().encode('data: {"name":"Read"}\n\n')) },
    cancel() { cancelled = true },
  }), { headers: { "content-type": "text/event-stream" } })
  const rewritten = await fixture.response(request, response)
  const reader = rewritten.body.getReader()
  await reader.read()
  await fixture.cleanup()
  assert.equal(cancelled, true)
  await assert.rejects(reader.read(), /aborted|unloaded/i)
})

test("V2 pre-aborted requests stop and non-SSE/error responses stay untouched", async (t) => {
  const fixture = await v2(t)
  const controller = new AbortController()
  controller.abort(new Error("synthetic-aborted"))
  await assert.rejects(fixture.request(oauthRequest({ signal: controller.signal })), /synthetic-aborted/)
  const request = await fixture.request(oauthRequest())
  const error = new Response('synthetic {"name":"Read"}', { status: 400, headers: { "content-type": "text/event-stream" } })
  assert.equal(await fixture.response(request, error), error)
  const json = Response.json({ name: "Read" })
  assert.equal(await fixture.response(request, json), json)
})

test("V2 request cancellation aborts the rewritten response stream", async (t) => {
  const fixture = await v2(t)
  const controller = new AbortController()
  const request = await fixture.request(oauthRequest({ signal: controller.signal }))
  let cancelled = false
  const response = new Response(new ReadableStream({
    pull(stream) { stream.enqueue(new TextEncoder().encode('data: {"name":"Read"}\n\n')) },
    cancel() { cancelled = true },
  }), { headers: { "content-type": "text/event-stream" } })
  const reader = (await fixture.response(request, response)).body.getReader()
  await reader.read()
  controller.abort(new Error("synthetic-request-aborted"))
  await assert.rejects(reader.read(), /synthetic-request-aborted/)
  assert.equal(cancelled, true)
})

test("V2 cancellation interrupts reading a one-shot Request stream", async (t) => {
  const fixture = await v2(t)
  const controller = new AbortController()
  const request = oauthRequest({ signal: controller.signal, duplex: "half",
    body: new ReadableStream({ start(stream) {
      stream.enqueue(new TextEncoder().encode('{"tools":'))
    } }) })
  let rejected
  const pending = fixture.request(request).catch((error) => { rejected = error })
  await new Promise((resolve) => setImmediate(resolve))
  controller.abort(new Error("synthetic-body-aborted"))
  await new Promise((resolve) => setImmediate(resolve))
  assert.match(rejected?.message ?? "still pending", /synthetic-body-aborted/)
  await pending
})
