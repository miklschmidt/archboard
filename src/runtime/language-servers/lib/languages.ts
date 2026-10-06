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
//
// A row also says what its server needs beyond the protocol: options it must
// start with whatever command runs it, files opened before it answers about
// them, a request that waits until it has loaded what it reads, and the
// project it starts in for a file, with why it cannot answer there yet and
// what it is told when it asks for its configuration, such as the Python
// environment or the .NET solution to read.

import path from "node:path";
import { dotnetProjectOf } from "@/runtime/language-servers/lib/dotnet-solution";
import { pythonProjectOf } from "@/runtime/language-servers/lib/python-environment";
import { swiftPackageOf } from "@/runtime/language-servers/lib/swift-package";

/** A command that starts a server, as a program and its arguments. */
interface ServerCommand {
	readonly command: string;
	readonly args: readonly string[];
}

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
	/** The server this language uses with no entry, or why it has none. */
	readonly defaultServer: () => ServerCommand | string;
	/** Options sent in `initialize`, whatever command runs the server. */
	readonly initializationOptions?: object;
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
	readonly project?: (root: string, file: string, once: Once) => Promise<Project>;
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

/**
 * Why Swift has no default server: sourcekit-lsp evaluates `Package.swift`,
 * which runs code of the checkout.
 * @returns The reason.
 */
function noSourcekitLsp(): string {
	return "sourcekit-lsp evaluates Package.swift, so it runs only from an entry in language-servers.json";
}

/** The Python servers a default looks for on the `PATH`, in order: pyright, then its fork basedpyright. */
const PYRIGHTS = ["pyright-langserver", "basedpyright-langserver"] as const;

/**
 * pyright or basedpyright, which read a project's files and environment
 * without running the project.
 * @returns The first of them on the `PATH`, or why there is none.
 */
function pyright(): ServerCommand | string {
	const command = PYRIGHTS.find((name) => Bun.which(name) !== null);
	return command === undefined
		? `neither ${PYRIGHTS.join(" nor ")} is installed`
		: { command, args: ["--stdio"] };
}

/**
 * Why C# has no default server: csharp-ls and the Roslyn language server
 * evaluate MSBuild files, which can run code of the checkout.
 * @returns The reason.
 */
function noCSharpServer(): string {
	return "csharp-ls evaluates MSBuild files, so it runs only from an entry in language-servers.json";
}

/** Every language a server can resolve, by its key in `language-servers.json`. */
const LANGUAGE_KEYS = ["typescript", "python", "csharp", "swift"] as const;

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
	// Measured with pyright 1.1.412: it answers about a file it has not opened
	// only once it has listed the project's files, and before that answers
	// none; an opened file is answered once it has its configuration.
	python: {
		languageIds: { ".py": "python", ".pyi": "python" },
		defaultServer: pyright,
		opensFiles: true,
		project: pythonProjectOf,
	},
	// Measured with csharp-ls 0.28.0: the first question waits until it has
	// loaded the solution, and it answers about files it has not opened. Its
	// MSBuild evaluation writes design-time files under each project's `obj`.
	csharp: {
		languageIds: { ".cs": "csharp" },
		defaultServer: noCSharpServer,
		project: dotnetProjectOf,
	},
	// sourcekit-lsp evaluates `Package.swift`, which runs code of the
	// checkout. Measured with Swift 6.2.4: it answers only about an open file;
	// with background indexing on, its default from 6.1, it runs `swift build`
	// to prepare targets; with it off, it reads the index a build wrote under
	// `.build`, which `workspace/synchronize` waits for it to load.
	swift: {
		languageIds: { ".swift": "swift" },
		defaultServer: noSourcekitLsp,
		initializationOptions: { backgroundIndexing: false },
		opensFiles: true,
		settle: { method: "workspace/synchronize", params: { index: true } },
		project: swiftPackageOf,
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

export {
	type Language,
	type Once,
	type Project,
	type ServerCommand,
	LANGUAGES,
	LANGUAGE_KEYS,
	languageOf,
};
