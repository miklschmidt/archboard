const CODEX_PROTOCOL_VERSION = "0.151.0" as const;
const CODEX_PROTOCOL_BINARY_VERSION = "codex-cli 0.151.0" as const;

function isSupportedCodexUserAgent(userAgent: string): boolean {
	const escapedVersion = CODEX_PROTOCOL_VERSION.replaceAll(".", String.raw`\.`);
	return new RegExp(`(^|[^0-9.])${escapedVersion}($|[^0-9.])`, "u").test(userAgent);
}

export { CODEX_PROTOCOL_BINARY_VERSION, CODEX_PROTOCOL_VERSION, isSupportedCodexUserAgent };
