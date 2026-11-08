// Which command starts the server of a language in a checkout (ADR 0046,
// TASK-433, TASK-599).
//
// A server runs where a file names it: the checkout's own
// `.archboard/language-servers.json`, else the global `language-servers.json`
// beside the registry. Then it runs as an editor runs it: that command, those
// arguments, the environment of the Archboard server. A bare command is looked
// up on the `PATH`; a path names the program itself. A language that no file
// names has no server, and the pass says so once for the checkout.
//
// TypeScript has a default, which runs the checkout's own TypeScript, because
// the checkout installed it for its own editor. A server that a file names
// wins. Otherwise the rule reads the checkout's own `node_modules/typescript`,
// inside the checkout once its links resolve (TASK-579.13):
// - version 7 or later with the native program for this machine: its
//   `tsc --lsp --stdio`.
// - a TypeScript before 7, which has no `--lsp` but holds `lib/tsserver.js`:
//   typescript-language-server, from the checkout's `node_modules/.bin` and
//   otherwise from the `PATH` of the Archboard server, told to run that
//   `tsserver.js`.
// - otherwise a checkout of Archboard (not a release, which ships no
//   TypeScript, ADR 0076) falls back to Archboard's own `tsc`.
// The rule reads the checkout's root only, so a monorepo whose packages
// install different versions uses the version installed at its root.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Language } from "#runtime/language-servers/operations/languages.ts";
import type { ServerTypescript } from "#shared/protocol/code-check.ts";
import type { passServers } from "@archboard/workspace/checkouts";
import { installation } from "@archboard/workspace/installation";

/** The server one language uses in a checkout, or why it has none. */
type LanguageServer =
	| {
			readonly status: "command";
			readonly argv: readonly [string, ...string[]];
			/** The `initializationOptions` of its `initialize` request. */
			readonly initializationOptions?: Readonly<Record<string, unknown>>;
			/** The TypeScript it reads, where the check chose it. */
			readonly typescript?: ServerTypescript;
	  }
	| { readonly status: "missing"; readonly detail: string };

/** What the language server files of a checkout say about one language. */
type ServerChoice = ReturnType<ReturnType<typeof passServers>>;

/** The first TypeScript that is a language server, with `tsc --lsp --stdio`. */
const FIRST_NATIVE_TYPESCRIPT = 7;

/** The wrapper around the `tsserver` of a TypeScript before 7. */
const TYPESCRIPT_LANGUAGE_SERVER = "typescript-language-server";

/**
 * What every TypeScript server is told. typescript-language-server otherwise
 * answers from a syntax server until its semantic server has loaded the
 * project, and that names the import of a name instead of its declaration
 * (measured with typescript-language-server 5.1.3 and 6.0.3, TypeScript 5.9.3).
 * `tsc --lsp` ignores the option.
 */
const TYPESCRIPT_OPTIONS = { tsserver: { useSyntaxServer: "never" } } as const;

/** A `typescript` package: its directory, with its links resolved, and its version. */
interface TypescriptPackage {
	readonly directory: string;
	readonly version: string;
}

/**
 * Whether a path, with its links resolved, is inside a directory.
 * @param directory The directory, resolved.
 * @param file The path, resolved.
 * @returns True when it is.
 */
function isInside(directory: string, file: string): boolean {
	const relative = path.relative(directory, file);
	return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/**
 * The native `tsc` that goes with a `typescript` package: the program of the
 * platform's package, beside the `typescript` package or inside it. The
 * package's own `bin/tsc` only finds this program and replaces itself with
 * it, so the check starts the program itself and stops exactly the process it
 * started.
 * @param typescript The package's directory, with its links resolved.
 * @returns The program, or undefined when the package has none for this machine.
 */
function nativeTsc(typescript: string): string | undefined {
	const native = path.join("@typescript", `typescript-${process.platform}-${process.arch}`);
	const program = process.platform === "win32" ? "tsc.exe" : "tsc";
	return [path.join(typescript, "node_modules", native), path.join(typescript, "..", native)]
		.map((directory) => path.join(directory, "lib", program))
		.find((file) => fs.existsSync(file));
}

/** What a `typescript` package's manifest says about which version it is. */
const ManifestSchema = z.object({ version: z.string() });

/**
 * A `typescript` package, where its manifest names its version.
 * @param directory The package's directory, with its links resolved.
 * @returns The package, or undefined when the manifest names no version.
 */
function typescriptPackage(directory: string): TypescriptPackage | undefined {
	const manifest = ManifestSchema.safeParse(
		JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8")),
	);
	return manifest.success ? { directory, version: manifest.data.version } : undefined;
}

/**
 * Whether a TypeScript is version 7 or later. A version that starts with no
 * number is not.
 * @param typescript The package.
 * @returns True when it is.
 */
function isNative(typescript: TypescriptPackage): boolean {
	return Number.parseInt(typescript.version, 10) >= FIRST_NATIVE_TYPESCRIPT;
}

/**
 * A file of the checkout, once its links resolve.
 * @param checkout The checkout, resolved.
 * @param file The file.
 * @returns The file, or undefined when it does not exist or its links lead out of the checkout.
 */
function insideCheckout(checkout: string, file: string | null | undefined): string | undefined {
	if (file === null || file === undefined) return undefined;
	try {
		return isInside(checkout, fs.realpathSync(file)) ? file : undefined;
	} catch {
		return undefined;
	}
}

/** A checkout and the `typescript` package it installs at its root. */
interface CheckoutTypescript {
	readonly checkout: string;
	readonly typescript: TypescriptPackage;
}

/**
 * The checkout's own `typescript` package. The package must be in the
 * checkout once its links resolve, so a link that leads out of it never makes
 * the check run a program that the checkout does not hold.
 * @param root The checkout, absolute.
 * @returns The package, or undefined when the checkout installs none.
 */
function checkoutTypescript(root: string): CheckoutTypescript | undefined {
	try {
		const checkout = fs.realpathSync(root);
		const directory = fs.realpathSync(path.join(root, "node_modules", "typescript"));
		if (!isInside(checkout, directory)) return undefined;
		const typescript = typescriptPackage(directory);
		return typescript === undefined ? undefined : { checkout, typescript };
	} catch {
		return undefined;
	}
}

/**
 * The native `tsc --lsp` of a checkout's own TypeScript 7 or later.
 * @param own The checkout and its package.
 * @returns The server, or undefined when the checkout holds no native program for this machine.
 */
function nativeServer(own: CheckoutTypescript): LanguageServer | undefined {
	const { checkout, typescript } = own;
	const program = insideCheckout(checkout, nativeTsc(typescript.directory));
	if (program === undefined) return undefined;
	const from = { version: typescript.version, from: "checkout" } as const;
	return {
		status: "command",
		argv: [program, "--lsp", "--stdio"],
		initializationOptions: TYPESCRIPT_OPTIONS,
		typescript: from,
	};
}

/**
 * typescript-language-server for the `tsserver.js` of a checkout's own
 * TypeScript before 7: the checkout's own, else one on the `PATH`.
 * @param own The checkout and its package.
 * @returns The server, or undefined when there is no `tsserver.js` or no wrapper.
 */
function wrapperServer(own: CheckoutTypescript): LanguageServer | undefined {
	const { checkout, typescript } = own;
	const tsserver = insideCheckout(checkout, path.join(typescript.directory, "lib", "tsserver.js"));
	const local = Bun.which(TYPESCRIPT_LANGUAGE_SERVER, {
		PATH: path.join(checkout, "node_modules", ".bin"),
	});
	const wrapper =
		insideCheckout(checkout, local) ??
		Bun.which(TYPESCRIPT_LANGUAGE_SERVER, { PATH: process.env["PATH"] ?? "" });
	if (tsserver === undefined || wrapper === null) return undefined;
	return {
		status: "command",
		argv: [wrapper, "--stdio"],
		// Automatic type acquisition runs npm to download type packages.
		initializationOptions: {
			tsserver: { ...TYPESCRIPT_OPTIONS.tsserver, path: tsserver },
			disableAutomaticTypingAcquisition: true,
		},
		typescript: { version: typescript.version, from: "checkout" },
	};
}

/**
 * The server of a checkout's own TypeScript.
 * @param own The checkout and its package.
 * @returns The server, or undefined when the checkout's TypeScript has none.
 */
function checkoutServer(own: CheckoutTypescript): LanguageServer | undefined {
	return isNative(own.typescript) ? nativeServer(own) : wrapperServer(own);
}

/**
 * The server of Archboard's own `typescript` package.
 * @returns The server, or undefined when it has no native `tsc` for this machine.
 */
function archboardServer(): LanguageServer | undefined {
	try {
		const manifest = Bun.resolveSync("typescript/package.json", import.meta.dir);
		const typescript = typescriptPackage(path.dirname(fs.realpathSync(manifest)));
		if (typescript === undefined) return undefined;
		const program = nativeTsc(typescript.directory);
		if (program === undefined) return undefined;
		const from = { version: typescript.version, from: "archboard" } as const;
		return {
			status: "command",
			argv: [program, "--lsp", "--stdio"],
			initializationOptions: TYPESCRIPT_OPTIONS,
			typescript: from,
		};
	} catch {
		return undefined;
	}
}

/**
 * Why a checkout has no TypeScript server of its own.
 * @param own The checkout's TypeScript, if it installs one.
 * @returns The reason.
 */
function noCheckoutServer(own: CheckoutTypescript | undefined): string {
	const machine = `${process.platform}-${process.arch}`;
	if (own === undefined) return "the checkout installs no typescript package";
	const { version } = own.typescript;
	if (isNative(own.typescript))
		return `the checkout's TypeScript ${version} has no native tsc for ${machine}`;
	if (
		insideCheckout(own.checkout, path.join(own.typescript.directory, "lib", "tsserver.js")) ===
		undefined
	)
		return `the checkout's TypeScript ${version} has no lib/tsserver.js inside the checkout; reinstall typescript in the checkout`;
	return `the checkout's TypeScript ${version} has no tsc --lsp, and ${TYPESCRIPT_LANGUAGE_SERVER} is neither in the checkout's node_modules nor on the PATH of the Archboard server; install it in either`;
}

/**
 * The default TypeScript server of a checkout: its own TypeScript, and
 * Archboard's own TypeScript after it where Archboard has one.
 * @param root The checkout, absolute.
 * @param fallback Whether Archboard has a TypeScript of its own: a checkout of
 * Archboard does, and a release does not.
 * @returns The server.
 */
function defaultTypescriptServer(root: string, fallback: boolean): LanguageServer {
	const own = checkoutTypescript(root);
	const server =
		(own === undefined ? undefined : checkoutServer(own)) ??
		(fallback ? archboardServer() : undefined);
	if (server !== undefined) return server;
	return {
		status: "missing",
		detail: `${noCheckoutServer(own)}${fallback ? ", and Archboard has no native tsc of its own" : ""}`,
	};
}

/**
 * The server of a language that no file names: TypeScript's default, and
 * none for any other language.
 * @param language The language.
 * @param root The checkout, absolute.
 * @returns The server, or why there is none.
 */
function unnamedServer(language: Language, root: string): LanguageServer {
	if (language === "typescript") {
		return defaultTypescriptServer(root, installation().mode === "checkout");
	}
	return {
		status: "missing",
		detail:
			"neither the checkout's .archboard/language-servers.json nor the global language-servers.json names a server",
	};
}

/**
 * The server one language uses in a checkout.
 * @param language The language.
 * @param root The checkout, absolute.
 * @param configured What the checkout's files say about the language.
 * @returns The server, or why there is none.
 */
function languageServerOf(
	language: Language,
	root: string,
	configured: ServerChoice,
): LanguageServer {
	if (configured === undefined) return unnamedServer(language, root);
	if ("problem" in configured) return { status: "missing", detail: configured.problem };
	const program = Bun.which(configured.command);
	if (program === null) {
		// A name is looked up on the `PATH` this process started with, which a
		// server that already runs keeps, whatever the agent's shell has since.
		const where = path.isAbsolute(configured.command)
			? "is not an executable file"
			: "is not on the PATH of the Archboard server";
		return {
			status: "missing",
			detail: `${configured.command} (named for ${language} in ${configured.file}) ${where}`,
		};
	}
	return {
		status: "command",
		argv: [program, ...configured.args],
		...(language === "typescript" ? { initializationOptions: TYPESCRIPT_OPTIONS } : {}),
	};
}

export { FIRST_NATIVE_TYPESCRIPT, type LanguageServer, defaultTypescriptServer, languageServerOf };
