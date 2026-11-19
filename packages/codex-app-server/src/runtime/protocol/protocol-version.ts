const CODEX_PROTOCOL_VERSION = "0.166.0" as const;

/**
 * The Codex version that this protocol is built for, and that the package pins.
 * @returns The version, such as 0.166.0.
 */
function codexProtocolVersion(): typeof CODEX_PROTOCOL_VERSION {
	return CODEX_PROTOCOL_VERSION;
}

/**
 * Checks that a server user agent names the bound Codex version as a whole token, so
 * 0.166.0 does not match 10.166.0 or 0.166.01.
 * @param userAgent - The user agent string from the initialize response.
 * @returns Whether the bound protocol version appears in it.
 */
function isSupportedCodexUserAgent(userAgent: string): boolean {
	const escapedVersion = CODEX_PROTOCOL_VERSION.replaceAll(".", String.raw`\.`);
	return new RegExp(`(^|[^0-9.])${escapedVersion}($|[^0-9.])`, "u").test(userAgent);
}

export { codexProtocolVersion, isSupportedCodexUserAgent };
