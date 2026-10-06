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
// Each server is a separate program that a machine may not have, named for
// this machine in `language-servers.json` in Archboard's state directory.
// TypeScript needs nothing more: it runs the `tsc --lsp` of Archboard's own
// `typescript` package, never the TypeScript of a checkout. A pass starts each
// server it needs once, and stops every one before it returns.

export {
	type LanguageServer,
	type LanguageServerTable,
	languageServersFile,
	readLanguageServers,
} from "@/runtime/language-servers/lib/configuration";
export { type Language } from "@/runtime/language-servers/lib/languages";
export { type DefinitionLocation } from "@/runtime/language-servers/lib/server";
export {
	type DefinitionAnswer,
	type DefinitionQuestion,
	type LanguageServerSession,
	type SessionOptions,
	type UnavailableServer,
	openLanguageServers,
} from "@/runtime/language-servers/lib/session";
