import test from "node:test"
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { tmpdir } from "node:os"
import { offline } from "./helpers/offline.mjs"

test("packed package imports by package name without either host SDK at runtime", async (t) => {
  const fixture = offline(t)
  const base = join(tmpdir(), "opencode")
  mkdirSync(base, { recursive: true })
  const temp = mkdtempSync(join(base, "anthropic-oauth-package-"))
  t.after(() => rmSync(temp, { recursive: true, force: true }))
  const userConfig = join(temp, "user.npmrc")
  const globalConfig = join(temp, "global.npmrc")
  writeFileSync(userConfig, "")
  writeFileSync(globalConfig, "")
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(npm_config_|npm_token$|node_auth_token$)/i.test(key)))
  Object.assign(env, { NPM_CONFIG_USERCONFIG: userConfig, NPM_CONFIG_GLOBALCONFIG: globalConfig,
    NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/" })
  const args = ["pack", "--json", "--ignore-scripts", "--pack-destination", temp]
  const packed = process.platform === "win32"
    ? execFileSync("cmd.exe", ["/d", "/s", "/c", `npm pack --json --ignore-scripts --pack-destination "${temp}"`],
      { env, encoding: "utf8", windowsVerbatimArguments: true })
    : execFileSync("npm", args, { env, encoding: "utf8" })
  const [artifact] = JSON.parse(packed)
  assert.ok(artifact.files.some((file) => file.path === "dist/v1.js"))
  assert.ok(artifact.files.some((file) => file.path === "dist/v2.js"))
  assert.ok(!artifact.files.some((file) => file.path.startsWith("tests/")))
  const target = join(temp, "node_modules", "opencode-anthropic-oauth")
  mkdirSync(target, { recursive: true })
  execFileSync("tar", ["-xzf", join(temp, artifact.filename), "-C", target, "--strip-components=1"])
  const consumer = join(temp, "consumer.mjs")
  writeFileSync(consumer, 'export { default } from "opencode-anthropic-oauth"\n')
  const { default: plugin } = await import(pathToFileURL(consumer).href)
  assert.equal(plugin.id, "opencode-anthropic-oauth")
  assert.equal(typeof plugin.server, "function")
  assert.equal(typeof plugin.setup, "function")
  const hooks = await plugin.server({ client: { auth: { set: async () => {} } } })
  assert.equal(hooks.auth.provider, "anthropic")
  await hooks.dispose()
  const registered = []
  const registration = { dispose: async () => {} }
  const cleanup = await plugin.setup({
    integration: {
      transform: async (callback) => {
        callback({ method: { update: (method) => assert.equal(method.integrationID, "anthropic") } })
        return registration
      },
      connection: { active: async () => undefined },
    },
    model: { transform: async () => registration, reload: async () => {} },
    session: { hook: async (name, _callback, scope) => {
      registered.push(name)
      assert.deepEqual(scope, { providerID: "anthropic" })
      return registration
    } },
    event: { subscribe: () => ({ async *[Symbol.asyncIterator]() {} }) },
  })
  assert.deepEqual(registered, ["http.request", "http.response"])
  await cleanup()
  const metadata = JSON.parse(readFileSync(join(target, "package.json"), "utf8"))
  assert.equal(metadata.peerDependencies["@opencode/plugin"], "2.0.22")
  assert.equal(metadata.peerDependenciesMeta["@opencode/plugin"].optional, true)
  assert.equal(metadata.peerDependenciesMeta["@opencode-ai/plugin"].optional, true)
  assert.equal(fixture.credentialChecks, 0)
  assert.deepEqual(fixture.requests, [])
})
