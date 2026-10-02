import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import { join } from "node:path"
import { syncBuiltinESMExports } from "node:module"

export const NOW = 1_800_000_000_000
export const TOKEN_URL = "https://oauth.invalid/token"
let moduleId = 0

// Install every boundary before importing the compiled runtime. Tests are
// sequential within each file; Node isolates the test files in separate workers.
export function offline(t) {
  const env = {
    ANTHROPIC_CLIENT_ID: "synthetic-client",
    ANTHROPIC_AUTHORIZE_URL: "https://oauth.invalid/authorize",
    ANTHROPIC_TOKEN_URL: TOKEN_URL,
    ANTHROPIC_REDIRECT_URI: "https://oauth.invalid/callback",
    ANTHROPIC_SCOPES: "user:profile user:inference",
    ANTHROPIC_USER_AGENT: "synthetic-cli/1.0",
    ANTHROPIC_BETA_FLAGS: "oauth-test,cache-test",
  }
  const previous = new Map(Object.keys(env).map((key) => [key, process.env[key]]))
  Object.assign(process.env, env)
  const home = join(process.cwd(), "tests", "synthetic-home-not-on-disk")
  const credentialPath = join(home, ".claude", ".credentials.json")
  const originalRead = fs.readFileSync
  const originalExists = fs.existsSync
  const state = { credentials: null, credentialReads: 0, credentialChecks: 0,
    requests: [], intervals: [], delays: [], respond: null }

  t.mock.method(os, "homedir", () => home)
  t.mock.method(fs, "existsSync", (path) => {
    if (String(path) !== credentialPath) return originalExists(path)
    state.credentialChecks++
    return state.credentials !== null
  })
  t.mock.method(fs, "readFileSync", (path, ...args) => {
    if (String(path) !== credentialPath) return originalRead(path, ...args)
    state.credentialReads++
    if (state.credentials instanceof Error) throw state.credentials
    assert.notEqual(state.credentials, null, "credential read must use a fixture")
    return JSON.stringify(state.credentials)
  })
  syncBuiltinESMExports()
  t.mock.method(Date, "now", () => NOW)
  t.mock.method(globalThis, "fetch", async (input, init) => {
    state.requests.push({ input, init })
    assert.ok(state.respond, "unexpected fetch: real network is disabled")
    return state.respond(input, init)
  })
  t.mock.method(globalThis, "setInterval", (callback, delay) => {
    state.intervals.push({ callback, delay })
    return state.intervals.length
  })
  t.mock.method(globalThis, "setTimeout", (callback, delay) => {
    state.delays.push(delay)
    queueMicrotask(callback)
    return state.delays.length
  })
  t.after(() => {
    t.mock.restoreAll()
    syncBuiltinESMExports()
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  state.import = (name) => import(new URL(`../../dist/${name}.js?fixture=${++moduleId}`, import.meta.url))
  return state
}

export function tokenResponse() {
  return Response.json({ access_token: "synthetic-fresh-access",
    refresh_token: "synthetic-fresh-refresh", expires_in: 3600 })
}

export async function v1(t, auth = {
  type: "oauth", access: "synthetic-access", refresh: "synthetic-refresh",
  expires: NOW + 3_600_000,
}) {
  const state = offline(t)
  state.auth = auth
  state.saved = []
  state.provider = { models: { synthetic: { cost: {
    input: 3, output: 4, cache: { read: 1, write: 2 },
  } } } }
  const { default: plugin } = await state.import("index")
  state.hooks = await plugin({ client: { auth: { set: async (value) => {
    state.saved.push(value)
    state.auth = value.body
  } } } })
  state.load = async () => {
    const loaded = await state.hooks.auth.loader(async () => state.auth, state.provider)
    // Drain the loader's unawaited proactive refresh before mutating auth.
    await new Promise((resolve) => setImmediate(resolve))
    return loaded
  }
  return state
}
