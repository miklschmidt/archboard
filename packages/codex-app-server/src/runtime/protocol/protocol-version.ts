const CODEX_PROTOCOL_VERSION = "0.160.0" as const;
const CODEX_PROTOCOL_BINARY_VERSION = "codex-cli 0.160.0" as const;

/**
 * Checks that a server user agent names the bound Codex version as a whole token, so
 * 0.160.0 does not match 10.160.0 or 0.160.01.
 * @param userAgent - The user agent string from the initialize response.
 * @returns Whether the bound protocol version appears in it.
 */
function isSupportedCodexUserAgent(userAgent: string): boolean {
	const escapedVersion = CODEX_PROTOCOL_VERSION.replaceAll(".", String.raw`\.`);
	return new RegExp(`(^|[^0-9.])${escapedVersion}($|[^0-9.])`, "u").test(userAgent);
}

export { CODEX_PROTOCOL_BINARY_VERSION, CODEX_PROTOCOL_VERSION, isSupportedCodexUserAgent };
