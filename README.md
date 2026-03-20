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
- OpenCode stores the tokens and handles refresh automatically
- Sets the required API headers on Anthropic requests

## Disclaimer

This plugin uses Anthropic's public OAuth client ID to authenticate. Anthropic's Terms of Service (February 2026) state that Claude Pro/Max subscription tokens should only be used with official Anthropic clients. This plugin exists as a community workaround and may stop working if Anthropic changes their OAuth infrastructure. Use at your own discretion.

## License

MIT
