// Language servers (ADR 0046, TASK-367.13): where a name that a file uses is
// defined, as the language server of its language says, for one pass of the
// code check.
//
// Code facts match a use to a definition by name, which makes a candidate,
// and cannot follow a use through a value, such as `ledger.post()`. A
// language server resolves both. The code check asks a question in the terms
// of code facts, a file, a line and a spelling, and gets locations back; it
// never sees the protocol, a process or a position.
//
// Each server is a separate program that a machine may not have, and one that
// can run code of a checkout runs only where the agent that works in that
// repository configured it, on the checkout's registration (`archboard repo
// language-server`), and then as an editor runs it. TypeScript needs no
// configuration: it runs the native `tsc --lsp` of the checkout's own
// `typescript` package from TypeScript 7 on, and Archboard's own before that.
// A pass starts each server it needs once, and stops every one before it
// returns.

export {
	type LanguageServer,
	languageServerOf,
} from "@/runtime/language-servers/lib/server-command";
export { type Language } from "@/runtime/language-servers/lib/languages";
export { type Declaration } from "@/runtime/language-servers/lib/outline";
export { type DefinitionLocation } from "@/runtime/language-servers/lib/server";
export {
	type DefinitionAnswer,
	type DefinitionQuestion,
	type LanguageServerSession,
	type SessionOptions,
	type UnavailableServer,
	openLanguageServers,
} from "@/runtime/language-servers/lib/session";
