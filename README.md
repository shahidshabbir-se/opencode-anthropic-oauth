
<div align="right">
  <details>
    <summary >🌐 Language</summary>
    <div>
      <div align="center">
        <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=en">English</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=zh-CN">简体中文</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=zh-TW">繁體中文</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=ja">日本語</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=ko">한국어</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=hi">हिन्दी</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=th">ไทย</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=fr">Français</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=de">Deutsch</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=es">Español</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=it">Italiano</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=ru">Русский</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=pt">Português</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=nl">Nederlands</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=pl">Polski</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=ar">العربية</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=fa">فارسی</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=tr">Türkçe</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=vi">Tiếng Việt</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=id">Bahasa Indonesia</a>
        | <a href="https://openaitx.github.io/view.html?user=shahidshabbir-se&project=opencode-anthropic-oauth&lang=as">অসমীয়া</
      </div>
    </div>
  </details>
</div>

# opencode-anthropic-oauth

> **Archived — use OpenCode V2's built-in Claude Agent provider instead.**
>
> This plugin is no longer maintained. OpenCode **2.2.3** restored a built-in way to use a Claude subscription through Claude Code, so this standalone OAuth workaround is being retired. The source and legacy instructions below are preserved for reference only.

## Why this repository is archived

- **V1:** On March 19, 2026, OpenCode merged [“anthropic legal requests” (#18186)](https://github.com/anomalyco/opencode/pull/18186), removing its bundled Anthropic authentication plugin. This community plugin provided a direct Claude Pro/Max OAuth workaround.
- **V2:** On October 30, 2026, [OpenCode 2.2.3](https://github.com/anomalyco/opencode/releases/tag/v2.2.3) introduced the built-in **Claude Agent** provider ([#58782](https://github.com/anomalyco/opencode/pull/58782)). It uses Claude Code through Anthropic's Agent SDK rather than restoring the old direct OAuth integration.
- **Now:** Use the upstream integration instead of this unmaintained plugin. This repository will not receive further fixes or compatibility updates.

## Use Claude with OpenCode V2

1. Install or update to [OpenCode V2](https://opencode.ai/v2/docs/) **2.2.3 or later**.
2. Remove `opencode-anthropic-oauth` from your OpenCode plugin configuration.
3. Install [Claude Code](https://code.claude.com/docs/en/overview), then sign in with your Claude subscription:

   ```bash
   claude auth login
   ```

4. In OpenCode, run `/connect` and select **Claude Agent** — not the ordinary Anthropic API-key provider.
5. Run `/models` and choose a Claude Agent model.

Unlike this plugin, the built-in provider **requires Claude Code**. Follow the [upstream release instructions](https://github.com/anomalyco/opencode/releases/tag/v2.2.3) for setup.

**Policy note:** Built-in OpenCode support is not a claim of Anthropic approval. Anthropic's terms and [Agent SDK authentication policy](https://code.claude.com/docs/en/agent-sdk/overview) still apply; availability may change. [Contemporary web coverage](https://cellcog.ai/blog/opencode-claude-subscription/) explains the technical change and the unresolved approval question.

## Legacy plugin documentation (unmaintained)

The following describes the historical V1 plugin, not the recommended V2 setup.

<details>
<summary>Show legacy installation, usage, and changelog</summary>

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

All OAuth parameters could be overridden via environment variables. These historical overrides are not maintained or guaranteed to work:

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

## Disclaimer

This plugin uses Anthropic's public OAuth client ID to authenticate. Anthropic's Terms of Service (February 2026) state that Claude Pro/Max subscription tokens should only be used with official Anthropic clients. This plugin exists as a community workaround and may stop working if Anthropic changes their OAuth infrastructure. Use at your own discretion.

</details>

## License

MIT
