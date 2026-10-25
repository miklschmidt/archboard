// What a language server says a use reaches, in the checkout the pass reads
// (ADR 0046, TASK-367.13).
//
// Code facts resolve a use that reaches its name through an import, because
// the import path names the file. A use of a name the same file defines is
// matched by name only, a candidate, and a use through a value, such as
// `ledger.post()`, reaches nothing code facts can name. The pass asks the
// language server of the file where such a use is defined, but only where the
// answer can change a finding: a candidate that joins two parts (evidence.ts)
// and the use an anchor names (anchor-kind.ts, support.ts). A definition in
// a file Git lists in the checkout is a site, and evidence that reaches it is
// resolved. A definition only outside the checkout, such as in a library or in
// the language's own declarations, reaches no part. A use the server was not
// asked about, or one it knows no definition of, stays as code facts read it.
//
// A use at run time is call evidence only where it reaches code that runs. A
// use through a value often resolves to a member of the value's type, such as
// `entry.name` to a field of an interface, or `memory.remember()` to the
// method an interface declares rather than the one that runs. The outline of
// the definition's file says what it declares (`declaration`), and a use at
// run time whose definition is not code stays as code facts read it. A use
// only as a type counts wherever its definition is.
//
// A server names the line of a definition, not its extent, so a site is that
// one line: the bound code that holds the line holds the definition. A line
// that code facts read as a declaration, such as a C prototype in a header,
// names code that is elsewhere: the site is the definition in the header's
// pair, as an include leads (definition-site.ts), and where the pair defines
// nothing of the name the use stays as code facts read it.
//
// One pass opens one resolution. Its servers start on their first question,
// and closing it stops every one, killing them at once when the pass was
// cancelled, and only then answers. It says once for each checkout and language
// with no server, naming the command that configures one, once for each
// project its server cannot answer about yet, such as a Swift file with no
// package or a C file with no `compile_commands.json`, and once for each
// checkout where a server failed.

import path from "node:path";
import type { Checkout, ReadCheckout } from "#runtime/operations/code-check/checkouts.ts";
import { codeSiteOf } from "#runtime/operations/code-facts/definition-site.ts";
import { type Definition, type Reference } from "#runtime/operations/code-facts/facts.ts";
import { type FactsPass } from "#runtime/services/code-facts/reader.ts";
import { languageServerOf } from "#runtime/operations/language-servers/server-command.ts";
import {
	openLanguageServers,
	type LanguageServerSession,
	type ServerOf,
	type UnavailableServer,
} from "#runtime/services/language-servers/session.ts";
import type { CheckTiming, CodeCheckSkip } from "#shared/protocol/code-check.ts";
import type { z } from "zod";
import { configureCommand, type LanguageServersSchema } from "@archboard/workspace/checkouts";

/** Where a server says a use is defined, as the pass reads the checkout. */
type UseResolution =
	| {
			readonly status: "site";
			/** The file, relative to the checkout. */
			readonly path: string;
			readonly line: number;
	  }
	| { readonly status: "elsewhere" }
	| { readonly status: "unknown" };

/** Where a use in a file of a checkout is defined, as the pass's servers say. */
type Resolve = (
	checkout: ReadCheckout,
	file: string,
	use: Pick<Reference, "line" | "symbol" | "kind">,
) => Promise<UseResolution>;

/** The answer of a use no server resolved. */
const UNKNOWN: UseResolution = { status: "unknown" };

/**
 * A file a server names, as the pass reads its checkout.
 * @param checkout The checkout.
 * @param file The file, absolute.
 * @returns It relative to the checkout, or undefined when Git does not list it there.
 */
function listedIn(checkout: ReadCheckout, file: string): string | undefined {
	const relative = path.relative(checkout.root, file).split(path.sep).join("/");
	return checkout.files.has(relative) ? relative : undefined;
}

/**
 * The definition code facts read innermost at a line of a file.
 * @param definitions The file's definitions.
 * @param line The line.
 * @returns The definition, or undefined when none holds the line.
 */
function innermostAt(definitions: readonly Definition[], line: number): Definition | undefined {
	return definitions
		.filter((each) => each.start <= line && line <= each.end)
		.toSorted((left, right) => left.end - left.start - (right.end - right.start))[0];
}

/**
 * The line of the code a server's site names: the site itself, or for a
 * declaration, the definition its pair passes on.
 * @param facts The pass's code facts.
 * @param checkout The checkout.
 * @param file The site's file, relative to the checkout.
 * @param line The site's line.
 * @returns The file and line of the code, or undefined for a declaration
 * whose code is in no file the check can name.
 */
async function codeAt(
	facts: FactsPass,
	checkout: ReadCheckout,
	file: string,
	line: number,
): Promise<{ path: string; line: number } | undefined> {
	const read = await facts.read(checkout, file);
	const definitions = read === undefined || read.adapter === "text" ? [] : read.definitions;
	const definition = innermostAt(definitions, line);
	if (definition?.declaration !== true) return { path: file, line };
	const code = await codeSiteOf(facts, checkout, { path: file, definition, via: [] });
	return code.definition.declaration === true
		? undefined
		: { path: code.path, line: code.definition.start };
}

/**
 * How the pass resolves a use through its language servers.
 * @param servers The pass's servers.
 * @param facts The pass's code facts.
 * @returns The resolution.
 */
function resolverOf(servers: LanguageServerSession, facts: FactsPass): Resolve {
	return async (checkout, file, use) => {
		const question = { root: checkout.root, file, line: use.line, symbol: use.symbol };
		const answer = await servers.definition(question);
		if (answer.status === "unasked" || answer.locations.length === 0) return UNKNOWN;
		const inCheckout = answer.locations.flatMap((location) => {
			const listed = listedIn(checkout, location.path);
			return listed === undefined ? [] : [{ location, listed }];
		});
		const [first] = inCheckout;
		if (first === undefined) return { status: "elsewhere" };
		const declares =
			use.kind === "call" ? await servers.declaration(checkout.root, first.location) : "code";
		return declares === "code"
			? siteAt(facts, checkout, first.listed, first.location.line)
			: UNKNOWN;
	};
}

/**
 * The site of the code a server named, as code facts read its line.
 * @param facts The pass's code facts.
 * @param checkout The checkout.
 * @param file The named file, relative to the checkout.
 * @param line The named line.
 * @returns The site, or unknown for a declaration whose code no file the check can name holds.
 */
async function siteAt(
	facts: FactsPass,
	checkout: ReadCheckout,
	file: string,
	line: number,
): Promise<UseResolution> {
	const code = await codeAt(facts, checkout, file, line);
	return code === undefined ? UNKNOWN : { status: "site", ...code };
}

/** The resolution of one pass. */
interface PassResolution {
	readonly resolve: Resolve;
	/** Stop every server; then the skips of what could not be asked, by checkout. */
	readonly close: () => Promise<CodeCheckSkip[]>;
	readonly timings: () => CheckTiming[];
}

/**
 * The skips of what the servers could not answer.
 * @param unavailable Each language and why.
 * @param checkouts Each repository's checkout, to name the repository of a root.
 * @returns The skips.
 */
function serverSkips(
	unavailable: readonly UnavailableServer[],
	checkouts: ReadonlyMap<string, Checkout>,
): CodeCheckSkip[] {
	const repoAt = new Map(
		[...checkouts].flatMap(([repo, checkout]) =>
			checkout.status === "read" ? [[checkout.root, repo] as const] : [],
		),
	);
	return unavailable.map((entry): CodeCheckSkip => {
		const repo = repoAt.get(entry.root ?? "");
		const reason = `language-server-${entry.reason}` as const;
		const configure =
			entry.language === "typescript" || entry.reason === "unready"
				? ""
				: `. Configure ${entry.reason === "missing" ? "one" : "another command"} with \`${configureCommand(entry.language, repo)}\``;
		return {
			reason,
			...(repo === undefined ? {} : { repo }),
			detail: `${entry.language}: ${entry.detail}${configure}`,
		};
	});
}

/**
 * Open the resolution of one pass.
 * @param servers The servers configured for each repository's checkout.
 * @param signal The pass's signal.
 * @param facts The pass's code facts, which say whether a site declares or defines.
 * @param checkouts Each repository's checkout, which says where its servers run.
 * @param serverOf The server of a language in a checkout, where an owner fixes
 * it; by default the registration's own (`languageServerOf`).
 * @returns The resolution.
 */
function openResolution(
	servers: ReadonlyMap<string, z.infer<typeof LanguageServersSchema>>,
	signal: AbortSignal,
	facts: FactsPass,
	checkouts: ReadonlyMap<string, Checkout>,
	serverOf?: ServerOf,
): PassResolution {
	const byRoot = new Map(
		[...checkouts].flatMap(([repo, checkout]) =>
			checkout.status === "read" ? [[checkout.root, servers.get(repo) ?? {}] as const] : [],
		),
	);
	const session = openLanguageServers({
		servers:
			serverOf ?? ((language, root) => languageServerOf(language, root, byRoot.get(root) ?? {})),
		signal,
	});
	return {
		resolve: resolverOf(session, facts),
		/**
		 * Timings of the servers, with repository identities instead of machine roots.
		 * @returns Timings in server start order.
		 */
		timings: () =>
			session.timings().map(({ root, ...timing }) => ({
				check: "language-server",
				...timing,
				repo: [...checkouts].find(
					([, checkout]) => checkout.status === "read" && checkout.root === root,
				)?.[0],
			})),
		/**
		 * Stop every server the pass started.
		 * @returns What could not be asked, and why.
		 */
		close: async () => {
			await session.close();
			return serverSkips(session.unavailable(), checkouts);
		},
	};
}

export { type Resolve, type UseResolution, openResolution };
