export const CODEX_PROTOCOL_VERSION = "0.151.0" as const;
export const CODEX_PROTOCOL_BINARY_VERSION = "codex-cli 0.151.0" as const;

export function isSupportedCodexUserAgent(userAgent: string): boolean {
	return new RegExp(`(^|[^0-9.])${CODEX_PROTOCOL_VERSION.replaceAll(".", "\\.")}($|[^0-9.])`).test(
		userAgent,
	);
}
