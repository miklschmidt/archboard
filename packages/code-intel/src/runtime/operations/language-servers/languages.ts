// The languages a language server can resolve candidates for, and what each
// one needs (ADR 0046). This table is the seam the later servers plug into:
// each language adds a row.
//
// A row names the files of the language by extension and the `languageId` the
// protocol gives each. It also says what its server needs beyond the protocol:
// options it must start with whatever command runs it, files opened before it
// answers about them, a request or an index that it is waited for until it has
// loaded what it reads, and the project it starts in for a file, with why it
// cannot answer there yet and what it is told when it asks for its
// configuration, such as the Python environment or the .NET solution to read.
// Which command runs the server is no part of a row (server-command.ts).

import path from "node:path";
import { cargoWorkspaceOf } from "#runtime/operations/language-servers/cargo-workspace.ts";
import { compileDatabaseOf } from "#runtime/operations/language-servers/compile-database.ts";
import { dotnetProjectOf } from "#runtime/operations/language-servers/dotnet-solution.ts";
import { pythonProjectOf } from "#runtime/operations/language-servers/python-environment.ts";
import { swiftPackageOf } from "#runtime/operations/language-servers/swift-package.ts";
import { CONFIGURABLE_LANGUAGES } from "@archboard/workspace/languages";

/** The project a server answers about for a file. */
interface Project {
	/** The directory the server starts in, absolute. */
	readonly root: string;
	/** Why the server cannot answer about the project's files, when it cannot. */
	readonly unready?: string;
	/**
	 * What the server is told when it asks for its configuration
	 * (`workspace/configuration`), by section: `python` answers a question
	 * about the section `python`, and `python.pythonPath` one about that key.
	 */
	readonly settings?: Readonly<Record<string, unknown>>;
}

/** A request, as its method and its params. */
interface Request {
	readonly method: string;
	readonly params: object;
}

/**
 * A look at a project that a pass does once for a key: the first call looks,
 * and every later call in the pass with that key gets its answer.
 */
type Once = (key: string, look: () => Promise<Project>) => Promise<Project>;

/** What one language needs from a language server. */
interface LanguageRow {
	/** The `languageId` of each extension the language's files have. */
	readonly languageIds: Readonly<Record<string, string>>;
	/**
	 * The token of the work-done progress by which the server reports the index
	 * it builds once it has opened its first file. The client waits for that
	 * progress to end before it asks about any file.
	 */
	readonly indexProgress?: string;
	/** The server answers only about a file the client opened. */
	readonly opensFiles?: boolean;
	/**
	 * Asked once after the start; it answers when the server has loaded what
	 * it reads. A server that does not know the request only refuses it.
	 */
	readonly settle?: Request;
	/**
	 * The project of a file of a checkout; with none, the checkout. It looks
	 * at a project through `once`, so the directories of one project share
	 * one look in a pass.
	 */
	readonly project?: (
		root: string,
		file: string,
		once: Once,
		signal: AbortSignal,
	) => Promise<Project>;
}

/**
 * Every language a server can resolve, by its key: TypeScript, whose server
 * needs no configuration, and each language an agent configures one for.
 */
const LANGUAGE_KEYS = ["typescript", ...CONFIGURABLE_LANGUAGES] as const;

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
	},
	// Measured with pyright 1.1.412: it answers about a file it has not opened
	// only once it has listed the project's files, and before that answers
	// none; an opened file is answered once it has its configuration.
	python: {
		languageIds: { ".py": "python", ".pyi": "python" },
		opensFiles: true,
		project: pythonProjectOf,
	},
	// Measured with csharp-ls 0.28.0: the first question waits until it has
	// loaded the solution, and it answers about files it has not opened. Its
	// MSBuild evaluation writes design-time files under each project's `obj`.
	csharp: {
		languageIds: { ".cs": "csharp" },
		project: dotnetProjectOf,
	},
	// SourceKit-LSP owns its background index and package preparation.
	// workspace/synchronize with index=true waits for its up-to-date build
	// graph and index (Swift 6.2.4 Workspace.swift, TASK-436.01).
	swift: {
		languageIds: { ".swift": "swift" },
		opensFiles: true,
		settle: { method: "workspace/synchronize", params: { index: true } },
		project: swiftPackageOf,
	},
	// Measured with clangd 21.1.8: it refuses a question about a file it has
	// not opened, and answers one about an opened file once it has parsed it.
	// It takes a file's language from its compile command, not from the
	// `languageId`, so a `.h` is read as the command of its sources says. Its
	// background index of every file the database lists is what names a
	// definition in another file; it ends its progress
	// `backgroundIndexProgress`. Objective-C++ (`.mm`) stays text (ADR 0046).
	c: {
		languageIds: {
			".c": "c",
			".h": "c",
			".cc": "cpp",
			".cpp": "cpp",
			".cxx": "cpp",
			".hh": "cpp",
			".hpp": "cpp",
			".hxx": "cpp",
			".m": "objective-c",
		},
		opensFiles: true,
		indexProgress: "backgroundIndexProgress",
		project: compileDatabaseOf,
	},
	// Measured with the rust-analyzer release 2026-10-12: before it has loaded the Cargo
	// workspace it answers a definition with none, and while it reloads with
	// its procedural macros it refuses one as `content modified`. It begins
	// the progress `rustAnalyzer/cachePriming` once the workspace, its build
	// scripts and its procedural macros are loaded, and ends it once every
	// crate is indexed (TASK-540).
	rust: {
		languageIds: { ".rs": "rust" },
		opensFiles: true,
		indexProgress: "rustAnalyzer/cachePriming",
		project: cargoWorkspaceOf,
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

export { type Language, type Once, type Project, LANGUAGES, languageOf };
