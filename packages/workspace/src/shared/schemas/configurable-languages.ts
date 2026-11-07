// The languages an agent can configure a server for (ADR 0046, TASK-433). Browser safe: the
// code-check answer names these, and the validation of a command (node:path) is in
// runtime/store/language-servers.ts.

/**
 * The languages whose server a checkout can configure. `c` is the whole C family:
 * C, C++ and Objective-C, which one clangd reads. TypeScript has a default server
 * (the checkout's own TypeScript 7, else Archboard's in a checkout), and a
 * configured one wins over it.
 */
const CONFIGURABLE_LANGUAGES = [
	"typescript",
	"python",
	"csharp",
	"swift",
	"c",
	"rust",
	"go",
] as const;

/** A language whose server an agent configures. */
type ConfigurableLanguage = (typeof CONFIGURABLE_LANGUAGES)[number];

export { type ConfigurableLanguage, CONFIGURABLE_LANGUAGES };
