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
// one line: the bound code that holds the line holds the definition.
//
// One pass opens one resolution. Its servers start on their first question,
// and closing it stops every one, killing them at once when the pass was
// cancelled, and only then answers. It says once for each language with no
// server on this machine, once for each project its server cannot answer
// about yet, such as a Swift package with no index, and once for each
// checkout where a server failed.

import path from "node:path";
import type { Checkout, ReadCheckout } from "@/runtime/code-check/lib/checkouts";
import type { Reference } from "@/runtime/code-facts/index";
import {
	openLanguageServers,
	type LanguageServerSession,
	type LanguageServerTable,
	type UnavailableServer,
} from "@/runtime/language-servers/index";
import type { CodeCheckSkip } from "@/shared/code-check/index";

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
 * How the pass resolves a use through its language servers.
 * @param servers The pass's servers.
 * @returns The resolution.
 */
function resolverOf(servers: LanguageServerSession): Resolve {
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
		if (declares !== "code") return UNKNOWN;
		return { status: "site", path: first.listed, line: first.location.line };
	};
}

/** The resolution of one pass. */
interface PassResolution {
	readonly resolve: Resolve;
	/** Stop every server; then the skips of what could not be asked, by checkout. */
	readonly close: (checkouts: ReadonlyMap<string, Checkout>) => Promise<CodeCheckSkip[]>;
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
		const detail = `${entry.language}: ${entry.detail}`;
		if (entry.reason === "missing") return { reason: "language-server-missing", detail };
		const repo = repoAt.get(entry.root ?? "");
		const reason = `language-server-${entry.reason}` as const;
		return { reason, ...(repo === undefined ? {} : { repo }), detail };
	});
}

/**
 * Open the resolution of one pass.
 * @param servers The server of each language.
 * @param signal The pass's signal.
 * @returns The resolution.
 */
function openResolution(servers: LanguageServerTable, signal: AbortSignal): PassResolution {
	const session = openLanguageServers({ servers, signal });
	return {
		resolve: resolverOf(session),
		/**
		 * Stop every server the pass started.
		 * @param checkouts Each repository's checkout.
		 * @returns What could not be asked, and why.
		 */
		close: async (checkouts) => {
			await session.close();
			return serverSkips(session.unavailable(), checkouts);
		},
	};
}

export { type Resolve, type UseResolution, openResolution };
