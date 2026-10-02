import test from "node:test"
import assert from "node:assert/strict"
import { offline } from "./helpers/offline.mjs"

test("default export exposes stable V1 server and V2 setup contracts", async (t) => {
  const fixture = offline(t)
  const { default: plugin } = await fixture.import("index")
  assert.equal(typeof plugin, "object")
  assert.equal(plugin.id, "opencode-anthropic-oauth")
  assert.equal(typeof plugin.server, "function")
  assert.equal(typeof plugin.setup, "function")
  assert.deepEqual(fixture.requests, [])
  assert.equal(fixture.credentialChecks, 0)
})
