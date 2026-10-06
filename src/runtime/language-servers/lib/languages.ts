// The languages a language server can resolve candidates for, and what each
// one needs (ADR 0046). This table is the seam the later servers plug into:
// Python and C# (TASK-367.14), C, C++ and Objective-C (TASK-367.15) and Swift
// (TASK-367.16) each add a row.
//
// A row names the files of the language by extension, the `languageId` the
// protocol gives each, and the default server, if the language has one. A
// default runs only a server that reads a project without running any of it.
// A server that evaluates project files, such as MSBuild or `Package.swift`,
// has no default and runs only from an entry in `language-servers.json`.

import path from "node:path";

/** A command that starts a server, as a program and its arguments. */
interface ServerCommand {
	readonly command: string;
	readonly args: readonly string[];
}

/** What one language needs from a language server. */
interface LanguageRow {
	/** The `languageId` of each extension the language's files have. */
	readonly languageIds: Readonly<Record<string, string>>;
	/** The server this language uses with no entry, or why it has none. */
	readonly defaultServer: () => ServerCommand | string;
}

/**
 * The native `tsc` of Archboard's own `typescript` package, which is a
 * language server with `--lsp --stdio` from TypeScript 7. It is resolved from
 * Archboard's install, never from a checkout, so no TypeScript of the checkout
 * runs. The package's `bin/tsc` only finds this program and replaces itself
 * with it, so the check starts the program itself and stops exactly the
 * process it started.
 * @returns The command, or why it cannot be found.
 */
function archboardTypeScript(): ServerCommand | string {
	try {
		const typescript = path.dirname(Bun.resolveSync("typescript/package.json", import.meta.dir));
		const native = `@typescript/typescript-${process.platform}-${process.arch}/package.json`;
		const lib = path.join(path.dirname(Bun.resolveSync(native, typescript)), "lib");
		const program = path.join(lib, process.platform === "win32" ? "tsc.exe" : "tsc");
		return { command: program, args: ["--lsp", "--stdio"] };
	} catch {
		return `Archboard's typescript package has no native tsc for ${process.platform}-${process.arch}`;
	}
}

/** Every language a server can resolve, by its key in `language-servers.json`. */
const LANGUAGE_KEYS = ["typescript"] as const;

/** A language a server can resolve. */
type Language = (typeof LANGUAGE_KEYS)[number];

/** What each language needs. */
const LANGUAGES: Readonly<Record<Language, LanguageRow>> = {
	typescript: {
		languageIds: {
			".ts": "typescript",
			".mts": "typescript",
			".cts": "typescript",
			".tsx": "typescriptreact",
		},
		defaultServer: archboardTypeScript,
	},
};

/**
 * The language of a file, and the `languageId` the protocol gives it.
 * @param file The file.
 * @returns Both, or undefined when no server reads the file's language.
 */
function languageOf(file: string): { language: Language; languageId: string } | undefined {
	const extension = path.extname(file);
	for (const language of LANGUAGE_KEYS) {
		const languageId = LANGUAGES[language].languageIds[extension];
		if (languageId !== undefined) return { language, languageId };
	}
	return undefined;
}

export { type Language, type ServerCommand, LANGUAGES, LANGUAGE_KEYS, languageOf };
