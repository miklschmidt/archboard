// A reviewed document is imported `with { type: "text" }`, so that Bun embeds it in a compiled
// executable and the package build inlines it, and nothing reads it by path (ADR 0075).
// TypeScript types a JSON module as its parsed value whatever its attributes, so a caller hands
// the import here, which proves at run time that it is the text.

/**
 * The text of a document imported `with { type: "text" }`.
 * @param module The default import.
 * @param label The document name for diagnostics.
 * @returns The text.
 * @throws {TypeError} When the import gave anything but text.
 */
function embeddedText(module: unknown, label: string): string {
	if (typeof module !== "string") {
		throw new TypeError(`${label} was not imported as text.`);
	}
	return module;
}

export { embeddedText };
