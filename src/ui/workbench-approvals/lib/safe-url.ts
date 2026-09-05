// The one URL check the surface makes: only http and https may be linked or
// accepted. Nothing here opens a URL.

const SAFE_PROTOCOLS: ReadonlySet<string> = new Set(["http:", "https:"]);

/**
 * A URL this surface may link to, or null.
 * @param value The candidate.
 * @returns The normalized href, or null for anything but http and https.
 */
function safeHttpUrl(value: string): string | null {
	if (!URL.canParse(value)) {
		return null;
	}
	const parsed = new URL(value);
	return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.href : null;
}

export { safeHttpUrl };
