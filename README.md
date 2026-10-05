# opencode-anthropic-oauth

OpenCode plugin for Anthropic Claude Pro/Max OAuth login — no Claude Code needed.

## What it does

Lets you authenticate with your Claude Pro/Max subscription directly in OpenCode via browser OAuth. No need to install Claude Code or manage credentials files.

## Installation

The dual-host adapter targets **OpenCode V1 >= 1.18.29** and **V2 2.0.22**.
Older V1 releases cannot load the object entrypoint. V2 declarations are pinned
to `@opencode/plugin@2.0.22`; other V2 releases have not been verified.

For V2, add the package to `opencode.json` using the plural `plugins` key:

```json
{
  "plugins": ["opencode-anthropic-oauth"]
}
```

For V1, use the singular `plugin` key:

```json
{
  "plugin": ["opencode-anthropic-oauth"]
}
```

OpenCode installs configured package plugins; a global npm installation is not
required. Before this adapter is published, build the checkout with `npm run
build` and replace the package name in the config with its absolute directory
path. Do not expect an older published artifact to contain these changes.

## Usage

1. Run `/connect` in OpenCode
2. Select **Anthropic** > **Claude Pro/Max**
3. Open the link in your browser and authorize
4. Paste the code back into OpenCode
5. Select an Anthropic model with `/models`

## How it works

- Implements the OAuth PKCE flow directly against Anthropic's auth endpoints
- Opens your browser for authentication — you log in with your Claude account
- Exchanges the authorization code for access + refresh tokens
- **Auto-refreshes tokens** when they expire — no manual re-auth needed
- Sets the required API headers on Anthropic requests
- **Preserves prompt caching** for efficient token usage

### Host and credential behavior

| Host | Credential selection and lifetime |
|---|---|
| V1 | Retains the existing Claude CLI credential preference, then plugin OAuth fallback. Its proactive refresh timer stops on plugin disposal. |
| V2 | Uses the active native Anthropic integration account. OpenCode resolves, refreshes, and persists that account's OAuth tokens; the adapter does not read Claude CLI credential files or copy V1 credentials. Native transport and retry policy stay host-owned. |

The V2 adapter adds **Claude Pro/Max** as an integration OAuth method without
replacing API-key methods. Anthropic-scoped HTTP hooks apply only when the
outgoing bearer matches the currently resolved OAuth account and no API key is
present. API-key requests, disconnected accounts, and non-SSE/error responses
pass through. Model pricing is zeroed only while an OAuth account is active;
account events reload that policy. Response rewriting follows the dispatched
request, not whichever account is selected when the response arrives.

Both adapters share header, system-prompt, tool-casing and streaming utilities.
Cache metadata is preserved. V2 preserves Request-only bodies/methods/signals,
and cancels rewritten response readers on request cancellation or plugin unload.
The V1 CLI token cache is owned by its plugin instance rather than shared across
all instances in the module.

**Custom endpoint policy is unchanged:** configured Anthropic endpoints can
receive OAuth bearer credentials. There is no origin allowlist or new opt-in.
Only configure endpoints you trust; origin hardening has been explicitly deferred.

## Changelog

### 0.4.1
- **Fixed high token consumption** — removed `cache_control` stripping that was disabling prompt caching
- Added `x-anthropic-billing-header` for proper token tracking
- Aligned beta flags with official Claude CLI plugin

### 0.4.0
- Added `?beta=true` URL parameter for OAuth compatibility
- Injected system identity prefix for claude-code beta
- Stripped `cache_control` (now removed in 0.4.1)

### 0.3.0
- Added auto token refresh via loader hook
- Background proactive refresh timer (5min intervals)

## Environment variable overrides

All OAuth parameters can be overridden via environment variables. If Anthropic changes something before we publish an update, set an env var and keep working:

| Variable | Description |
|---|---|
| `ANTHROPIC_CLIENT_ID` | OAuth client ID |
| `ANTHROPIC_CLI_VERSION` | Claude CLI version for User-Agent |
| `ANTHROPIC_USER_AGENT` | Full User-Agent string (overrides version) |
| `ANTHROPIC_AUTHORIZE_URL` | OAuth authorization endpoint |
| `ANTHROPIC_TOKEN_URL` | OAuth token endpoint |
| `ANTHROPIC_REDIRECT_URI` | OAuth redirect URI |
| `ANTHROPIC_SCOPES` | OAuth scopes |
| `ANTHROPIC_BETA_FLAGS` | Anthropic beta feature flags |

Example:

```bash
export ANTHROPIC_CLI_VERSION=2.2.0
```

## Development: offline regression tests

Install the locked dependencies from the public npm registry, then run the suite:

```bash
npm ci --ignore-scripts --no-audit --no-fund --registry=https://registry.npmjs.org/
npm test
```

`npm test` builds TypeScript and runs `node --test tests/*.test.mjs` against
`dist`. The harness was verified with Node 26.9.0 and npm 11.19.1; no additional
test dependencies or experimental Node flags are required. `npm run build`
checks compilation independently.

### Isolation and scope

Before importing either runtime, `tests/helpers/offline.mjs` replaces `fetch`,
the home-directory lookup, credential-file existence/read operations, the clock,
and timers. Credentials are synthetic in-memory fixtures at a fake home path;
the tests never read actual Claude credentials. Unexpected fetches fail instead
of reaching the network. Intervals are captured without scheduling them, retry
delays run virtually, and mocks/environment overrides are restored after each
test. Test files run in isolated Node workers; keep tests sequential within a
file because the fixture replaces process-wide boundaries.

Coverage includes OAuth exchange/refresh, V1 characterization, the dual default
entrypoint, V2 method/hook registration, selected-account changes, OAuth-only
pricing, API-key passthrough, cache metadata, Request-only bodies, split UTF-8/SSE,
stream cancellation, and cleanup. A package test runs `npm pack --ignore-scripts`
with isolated empty npm configs, extracts the tarball into a disposable consumer,
and resolves/imports its default entrypoint without either host SDK installed.
That test requires npm and `tar` on PATH. Host imports are type-only at runtime;
both SDK peers are optional so one host does not require the other SDK.

Compilation uses exact V2 2.0.22 declarations. Offline tests were run on Node
26.9.0; no additional Node-version range has been exercised. The V2 host must
provide standard Fetch APIs and `AbortSignal.any` for combined cancellation.

Real V1/V2 host loading, login, and requests against Anthropic were checked
manually. The offline suite does not cover those behaviors: mocked hooks,
packed-package import, and compilation alone do not prove them.

## Disclaimer

This plugin uses Anthropic's public OAuth client ID to authenticate. Anthropic's Terms of Service (February 2026) state that Claude Pro/Max subscription tokens should only be used with official Anthropic clients. This plugin exists as a community workaround and may stop working if Anthropic changes their OAuth infrastructure. Use at your own discretion.

## License

MIT
