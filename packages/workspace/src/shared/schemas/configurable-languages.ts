// The languages an agent can configure a server for (ADR 0046, TASK-433). Browser safe: the
// code-check answer names these, and the validation of a command (node:path) is in
// runtime/store/language-servers.ts.

/**
 * The languages with no server of Archboard's own. `c` is the whole C family:
 * C, C++ and Objective-C, which one clangd reads. TypeScript is not here: its
 * server needs no configuration.
 */
const CONFIGURABLE_LANGUAGES = ["python", "csharp", "swift", "c", "rust"] as const;

/** A language whose server an agent configures. */
type ConfigurableLanguage = (typeof CONFIGURABLE_LANGUAGES)[number];

export { type ConfigurableLanguage, CONFIGURABLE_LANGUAGES };
