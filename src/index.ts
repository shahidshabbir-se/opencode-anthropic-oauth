import type { Plugin } from "@opencode-ai/plugin"
import {
  createAuthorizationRequest,
  exchangeCodeForTokens,
  API_USER_AGENT,
} from "./oauth.js"

const plugin: Plugin = async () => {
  return {
    auth: {
      provider: "anthropic",
      loader: async () => ({}),
      methods: [
        {
          type: "oauth" as const,
          label: "Claude Pro/Max",
          authorize() {
            const { url, verifier } = createAuthorizationRequest()

            return Promise.resolve({
              url,
              instructions:
                "Open the link above to authenticate with your Claude account. " +
                "After authorizing, you'll receive a code — paste it below.",
              method: "code" as const,
              async callback(code: string) {
                try {
                  const tokens = await exchangeCodeForTokens(code, verifier)
                  return {
                    type: "success" as const,
                    access: tokens.access,
                    refresh: tokens.refresh,
                    expires: tokens.expires,
                  }
                } catch (err) {
                  console.error(
                    "opencode-anthropic-oauth: token exchange failed:",
                    err instanceof Error ? err.message : err,
                  )
                  return { type: "failed" as const }
                }
              },
            })
          },
        },
      ],
    },

    "chat.headers": async (input, output) => {
      if (input.provider?.info?.id !== "anthropic") return

      output.headers["user-agent"] = API_USER_AGENT
      output.headers["anthropic-beta"] =
        "interleaved-thinking-2025-04-14,fine-grained-tool-streaming-2025-05-14,oauth-2025-04-20"
      output.headers["x-app"] = "cli"
    },
  }
}

export default plugin
