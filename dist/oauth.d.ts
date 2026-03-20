declare const CLI_VERSION = "2.1.80";
declare const API_USER_AGENT = "claude-cli/2.1.80 (external, cli)";
export interface OAuthTokens {
    access: string;
    refresh: string;
    expires: number;
}
export declare function createAuthorizationRequest(): {
    url: string;
    verifier: string;
};
export declare function parseAuthCode(raw: string): string;
export declare function exchangeCodeForTokens(rawCode: string, verifier: string): Promise<OAuthTokens>;
export declare function refreshTokens(refreshToken: string): Promise<OAuthTokens>;
export { API_USER_AGENT, CLI_VERSION };
