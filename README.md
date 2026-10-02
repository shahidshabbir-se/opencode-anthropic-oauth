# opencode-anthropic-oauth

OpenCode plugin for Anthropic Claude Pro/Max OAuth login — no Claude Code needed.

## What it does

Lets you authenticate with your Claude Pro/Max subscription directly in OpenCode via browser OAuth. No need to install Claude Code or manage credentials files.

## Installation

```bash
npm install -g opencode-anthropic-oauth
```

Then add to your `opencode.json`:

```json
{
  "plugin": ["opencode-anthropic-oauth"]
}
```

## Usage

1. Run `/connect` in OpenCode (or `oc auth login` from CLI)
2. Select **Anthropic** > **Claude Pro/Max**
3. Open the link in your browser and authorize
4. Paste the code back into OpenCode
5. Done — all Anthropic models are now available

## How it works

- Implements the OAuth PKCE flow directly against Anthropic's auth endpoints
- Opens your browser for authentication — you log in with your Claude account
- Exchanges the authorization code for access + refresh tokens
- **Auto-refreshes tokens** when they expire — no manual re-auth needed
- Sets the required API headers on Anthropic requests
- **Preserves prompt caching** for efficient token usage

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

Before importing the V1 runtime, `tests/helpers/offline.mjs` replaces `fetch`,
the home-directory lookup, credential-file existence/read operations, the clock,
and timers. Credentials are synthetic in-memory fixtures at a fake home path;
the tests never read actual Claude credentials. Unexpected fetches fail instead
of reaching the network. Intervals are captured without scheduling them, retry
delays run virtually, and mocks/environment overrides are restored after each
test. Test files run in isolated Node workers; keep tests sequential within a
file because the fixture replaces process-wide boundaries.

Coverage characterizes OAuth PKCE/exchange/refresh, the V1 loader and callbacks,
valid/expired synthetic tokens, header and prompt-cache preservation, API-key
passthrough, tool mapping, split SSE chunks, and retry/error handling. These are
baseline characterization tests, not migration RED/GREEN evidence or proof of
Anthropic service compatibility.

V2 loading, installed-package host smoke tests, stream cancellation propagation,
and Request-only body/method/signal handling remain outside this baseline.
Synthetic CLI tests do not endorse ambient credential precedence; account
selection and custom endpoint policy require a separate decision before migration.

## Disclaimer

This plugin uses Anthropic's public OAuth client ID to authenticate. Anthropic's Terms of Service (February 2026) state that Claude Pro/Max subscription tokens should only be used with official Anthropic clients. This plugin exists as a community workaround and may stop working if Anthropic changes their OAuth infrastructure. Use at your own discretion.

## License

MIT
