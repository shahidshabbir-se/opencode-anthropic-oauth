import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { offline, NOW, TOKEN_URL, tokenResponse } from "./helpers/offline.mjs"

test("authorization uses PKCE S256, matching state, and configured public endpoints", async (t) => {
  const fixture = offline(t)
  const oauth = await fixture.import("oauth")
  const { url, verifier } = oauth.createAuthorizationRequest()
  const parsed = new URL(url)
  assert.equal(parsed.origin + parsed.pathname, "https://oauth.invalid/authorize")
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(parsed.searchParams.get("code_challenge"),
    createHash("sha256").update(verifier).digest("base64url"))
  assert.equal(parsed.searchParams.get("code_challenge_method"), "S256")
  assert.equal(parsed.searchParams.get("state"), verifier)
  assert.equal(parsed.searchParams.get("client_id"), "synthetic-client")
  assert.equal(parsed.searchParams.get("redirect_uri"), "https://oauth.invalid/callback")
  assert.equal(parsed.searchParams.get("scope"), "user:profile user:inference")
  assert.equal(parsed.searchParams.get("response_type"), "code")
  assert.equal(parsed.searchParams.get("code"), "true")
  assert.equal(fixture.requests.length, 0)
})

test("code parser removes only the hash suffix", async (t) => {
  const fixture = offline(t)
  const { parseAuthCode } = await fixture.import("oauth")
  assert.equal(parseAuthCode("synthetic-code#state#suffix"), "synthetic-code")
  assert.equal(parseAuthCode("synthetic-code"), "synthetic-code")
  assert.equal(parseAuthCode("#state"), "")
})

test("code exchange trims input and posts form data with deterministic expiry", async (t) => {
  const fixture = offline(t)
  fixture.respond = () => tokenResponse()
  const { exchangeCodeForTokens } = await fixture.import("oauth")
  assert.deepEqual(await exchangeCodeForTokens(" synthetic-code#state \n", "synthetic-verifier"), {
    access: "synthetic-fresh-access", refresh: "synthetic-fresh-refresh", expires: NOW + 3_600_000,
  })
  const [{ input, init }] = fixture.requests
  assert.equal(input, TOKEN_URL)
  assert.equal(init.method, "POST")
  assert.equal(new Headers(init.headers).get("content-type"), "application/x-www-form-urlencoded")
  assert.equal(new Headers(init.headers).get("user-agent"), "synthetic-cli/1.0")
  assert.deepEqual(Object.fromEntries(new URLSearchParams(init.body)), {
    grant_type: "authorization_code", code: "synthetic-code", code_verifier: "synthetic-verifier",
    client_id: "synthetic-client", redirect_uri: "https://oauth.invalid/callback", state: "synthetic-verifier",
  })
})

test("refresh posts the synthetic refresh token and maps the response", async (t) => {
  const fixture = offline(t)
  fixture.respond = () => tokenResponse()
  const { refreshTokens } = await fixture.import("oauth")
  assert.deepEqual(await refreshTokens("synthetic-refresh"), {
    access: "synthetic-fresh-access", refresh: "synthetic-fresh-refresh", expires: NOW + 3_600_000,
  })
  assert.equal(fixture.requests[0].input, TOKEN_URL)
  assert.deepEqual(Object.fromEntries(new URLSearchParams(fixture.requests[0].init.body)), {
    grant_type: "refresh_token", refresh_token: "synthetic-refresh", client_id: "synthetic-client",
  })
})

test("OAuth 429 retries use virtual delays and stop after three attempts", async (t) => {
  const fixture = offline(t)
  fixture.respond = () => new Response("synthetic rate limit", { status: 429 })
  const { refreshTokens } = await fixture.import("oauth")
  await assert.rejects(refreshTokens("synthetic-refresh"), /Token refresh failed: 429.*synthetic rate limit/)
  assert.equal(fixture.requests.length, 3)
  assert.deepEqual(fixture.delays, [2000, 4000])
})

test("exchange and refresh errors retain status and safe fixture diagnostics", async (t) => {
  const fixture = offline(t)
  fixture.respond = () => new Response("synthetic denial", { status: 400, statusText: "Bad Request" })
  const oauth = await fixture.import("oauth")
  await assert.rejects(oauth.exchangeCodeForTokens("synthetic-code", "synthetic-verifier"),
    /Token exchange failed: 400 Bad Request — synthetic denial/)
  await assert.rejects(oauth.refreshTokens("synthetic-refresh"),
    /Token refresh failed: 400 Bad Request — synthetic denial/)
  assert.equal(fixture.requests.length, 2)
  assert.deepEqual(fixture.delays, [])
})
