// The bound code of each part on one board, as the code pass reads it
// (ADR 0046).
//
// The bound code of a part is the definition its symbol names, else the whole
// file, or every file below the directory. Where the bound code of two parts
// overlaps, it belongs to the part with the narrower binding: a symbol is
// narrower than its file, a file narrower than a directory that holds it, and
// a deeper directory narrower than one above it. Code that two parts bind in
// the same way belongs to both. The tests below a bound directory exercise
// its code and are not its code at run time, so they are left out, unless the
// directory is itself one of tests.
//
// A C or C++ file comes with its pair (TASK-367.09): a part bound to
// `ledger.c` also owns `ledger.h`, and one bound to the header also owns the
// source file, where no part binds that file itself.
//
// A definition that a tool merges from several files, such as a compose
// service and its block in an override file, is the part's in every one of
// them (TASK-367.20).
//
// A part the pass cannot read says why where the reason is the board's or this
// machine's to fix: a repository this machine has not registered, a ref its
// checkout does not have out, a path Git ignores or one the pass never reads.
// A checkout that is unavailable is said once for the whole checkout, a bound
// path that is not there is the plain check's to report, and a bound symbol
// that is not there is a finding of its own, so those parts are only unread.

import path from "node:path";
import {
	otherRefOf,
	readableOf,
	type Checkout,
	type ReadCheckout,
} from "@/runtime/code-check/lib/checkouts";
import { heldInFiles, type Search } from "@/runtime/code-check/lib/symbols";
import { mergedDefinitions, type Definition } from "@/runtime/code-facts/index";
import {
	resolveLocalCodeTarget,
	type CheckoutSnapshot,
	type LocalCodeTarget,
} from "@/runtime/code-target/index";
import type { CodeCheckSkip } from "@/shared/code-check/index";
import type { CodeBinding } from "@/shared/code-target/index";
import type { SemanticNode } from "@/shared/semantic-board/index";

/**
 * A directory that holds tests, by the conventions of common languages: `test`,
 * `tests`, `__tests__`, `spec` or `specs` in any case, alone or after a
 * separator (`Tests` of a Swift package, `e2e-tests`, `Payments.Tests` of a
 * .NET solution).
 */
const TEST_DIRECTORY = /^(?:.*[._-])?(?:tests?|__tests__|specs?)$/iu;
/** A test target named in camel case, as Xcode names one: `AFNetworkingTests`. */
const TEST_TARGET = /[\p{Ll}\d]Tests$/u;
/** A file of tests: `x.test.ts`, `x.spec.ts`, `x_test.go`, `test_x.py`. */
const TEST_FILE = /\.(?:test|spec)\.[^.]+$|_test\.[^.]+$|^test_[^/]+$/u;

/**
 * Whether a path is test code: a file of tests, or one below a directory of tests.
 * @param file A repository-relative path.
 * @returns True when it is.
 */
function isTestPath(file: string): boolean {
	const names = file.split("/");
	const last = names.at(-1) ?? "";
	const directories = names.slice(0, -1);
	return (
		TEST_FILE.test(last) ||
		directories.some((name) => TEST_DIRECTORY.test(name) || TEST_TARGET.test(name))
	);
}

/** A registered checkout the pass reads, with the repository it is. */
type RepoCheckout = ReadCheckout & { readonly repo: string };

/** How narrow a binding is: a symbol, a file, or a directory with its depth. */
type Grain =
	| {
			readonly kind: "symbol";
			readonly file: string;
			readonly definition: Definition;
			/**
			 * The same definition in each other file its tool merges with the
			 * file, such as a compose service's block in an override file.
			 */
			readonly merged: readonly { readonly path: string; readonly definition: Definition }[];
	  }
	| { readonly kind: "file"; readonly file: string }
	| { readonly kind: "directory"; readonly directory: string };

/** The code of one part the pass reads. */
interface ReadPart {
	readonly status: "read";
	readonly node: SemanticNode;
	readonly checkout: RepoCheckout;
	/** Every file its binding names that the pass may read, relative to the checkout. */
	readonly files: readonly string[];
	readonly grain: Grain;
	/** The binding as one value: two parts with the same key bind the same code. */
	readonly key: string;
}

/** A part the pass does not read, and the reason the answer gives. */
interface SkippedPart {
	readonly status: "skipped";
	readonly node: SemanticNode;
	readonly skip: Pick<CodeCheckSkip, "reason" | "repo" | "ref" | "detail">;
}

/** A part with no binding, or one whose reason the pass says elsewhere. */
interface UnreadPart {
	readonly status: "unbound" | "unread";
	readonly node: SemanticNode;
}

type PartCode = ReadPart | SkippedPart | UnreadPart;

/** What reading the bound code of parts needs. */
interface PartReading {
	readonly snapshot: CheckoutSnapshot;
	readonly checkouts: ReadonlyMap<string, Checkout>;
	/**
	 * How a search reads the files of one checkout.
	 * @param checkout The checkout.
	 * @returns The search.
	 */
	readonly searchOf: (checkout: RepoCheckout) => Search;
}

/**
 * A repository-relative path with `/` between names and no trailing `/`.
 * @param root The checkout.
 * @param absolute A path inside it.
 * @returns The path; the empty string is the whole checkout.
 */
function relativeTo(root: string, absolute: string): string {
	return path.relative(root, absolute).split(path.sep).join("/");
}

/** Where a bound path is in its checkout, or why the pass does not read it. */
type Located =
	| {
			readonly status: "located";
			readonly checkout: RepoCheckout;
			readonly target: LocalCodeTarget;
			readonly files: readonly string[];
			/** The path relative to the checkout, where its links lead. */
			readonly where: string;
	  }
	| Omit<SkippedPart, "node">
	| { readonly status: "unread" };

/**
 * Where a bound path is in its checkout, once the checkout is read and has the
 * binding's ref out.
 * @param binding The binding.
 * @param checkout Its checkout.
 * @param snapshot The registered checkouts.
 * @returns The files the pass may read, or why it reads none.
 */
function locateTarget(
	binding: CodeBinding,
	checkout: RepoCheckout,
	snapshot: CheckoutSnapshot,
): Located {
	const target = resolveLocalCodeTarget(binding, snapshot);
	if (!target.ok) return { status: "unread" };
	const readable = readableOf(target, checkout.files, true);
	if (readable.status === "files") {
		const where = relativeTo(target.root, target.target);
		return { status: "located", checkout, target, files: readable.files, where };
	}
	const reason = readable.status === "ignored" ? "path-ignored" : "path-never-read";
	return { status: "skipped", skip: { reason, repo: checkout.repo, detail: binding.path } };
}

/**
 * Where a bound path is in its checkout.
 * @param binding The binding.
 * @param reading The pass.
 * @returns The files the pass may read, or why it reads none.
 */
function locate(binding: CodeBinding, reading: PartReading): Located {
	const { repo } = binding;
	const checkout = reading.checkouts.get(repo);
	if (checkout?.status === "unregistered") {
		return { status: "skipped", skip: { reason: "repository-unregistered", repo } };
	}
	if (checkout?.status !== "read") return { status: "unread" };
	const ref = otherRefOf(binding, reading.snapshot);
	if (ref !== undefined) {
		return { status: "skipped", skip: { reason: "ref-not-checked-out", repo, ref } };
	}
	return locateTarget(binding, { ...checkout, repo }, reading.snapshot);
}

/**
 * The code of a binding with no symbol: the whole file, or every file below
 * the directory but the tests, which exercise its code and are not its code
 * at run time, unless the directory is itself one of tests.
 * @param located Where its path is.
 * @returns The grain and the files.
 */
function wholeGrainOf(
	located: Extract<Located, { status: "located" }>,
): Pick<ReadPart, "grain" | "files"> {
	const { target, files, where } = located;
	if (target.kind === "file") return { grain: { kind: "file", file: where }, files };
	const run = isTestPath(`${where}/`) ? files : files.filter((file) => !isTestPath(file));
	return { grain: { kind: "directory", directory: where }, files: run };
}

/**
 * How narrow a located binding is, and the files of its code: the definition
 * its symbol names, else the whole file or directory.
 * @param symbol The binding's symbol, if any.
 * @param located Where its path is.
 * @param reading The pass.
 * @returns The grain and the files, or undefined when the symbol is not defined there.
 */
async function grainOf(
	symbol: string | undefined,
	located: Extract<Located, { status: "located" }>,
	reading: PartReading,
): Promise<Pick<ReadPart, "grain" | "files"> | undefined> {
	if (symbol === undefined) return wholeGrainOf(located);
	const search = reading.searchOf(located.checkout);
	const held = await heldInFiles(search, located.files, symbol, "definition");
	if (held.status !== "found" || held.definition === undefined) return undefined;
	const { file, definition } = held;
	const merged = await mergedDefinitions(search.facts, search.checkout, file, definition.symbol);
	const grain: Grain = { kind: "symbol", file, definition, merged };
	return { grain, files: [file, ...merged.map((each) => each.path)] };
}

/**
 * A symbol-bound part's definition in one file: its own, or the block a tool
 * merges into it there.
 * @param part The part.
 * @param file The file.
 * @returns The definition, or undefined when the part's symbol has none there.
 */
function definitionIn(part: ReadPart, file: string): Definition | undefined {
	const { grain } = part;
	if (grain.kind !== "symbol") return undefined;
	if (grain.file === file) return grain.definition;
	return grain.merged.find((each) => each.path === file)?.definition;
}

/**
 * The bound code of one part.
 * @param node The part.
 * @param reading The pass.
 * @returns Its code, or why the pass does not read it.
 */
async function partCodeOf(node: SemanticNode, reading: PartReading): Promise<PartCode> {
	const { binding } = node;
	if (binding === undefined) return { status: "unbound", node };
	const located = locate(binding, reading);
	if (located.status !== "located") return { ...located, node };
	const code = await grainOf(binding.symbol, located, reading);
	if (code === undefined) return { status: "unread", node };
	const key = `${binding.repo}\0${located.where}\0${binding.symbol ?? ""}`;
	return { status: "read", node, checkout: located.checkout, key, ...code };
}

/**
 * The parts bound to a C or C++ file, by each file of its pair, which they own
 * where no part binds that file itself.
 * @param parts The parts.
 * @returns The parts, by the files of their pairs.
 */
function pairsOf(parts: readonly ReadPart[]): Map<string, ReadPart[]> {
	const pairs = new Map<string, ReadPart[]>();
	for (const part of parts) {
		const { grain } = part;
		const pair = grain.kind === "file" ? part.files.filter((file) => file !== grain.file) : [];
		for (const file of pair) pairs.set(file, [...(pairs.get(file) ?? []), part]);
	}
	return pairs;
}

/**
 * The bound code of every part of one board.
 * @param nodes The board's parts.
 * @param reading The pass.
 * @returns Each part's code, by its id.
 */
async function partCodesOf(
	nodes: readonly SemanticNode[],
	reading: PartReading,
): Promise<Map<string, PartCode>> {
	const codes = new Map<string, PartCode>();
	for (const node of nodes) {
		// oxlint-disable-next-line no-await-in-loop -- one part at a time keeps the pass's reads in board order, and a file one part reads is cached for the next
		codes.set(node.id, await partCodeOf(node, reading));
	}
	return codes;
}

export {
	type Grain,
	type PartCode,
	type PartReading,
	type ReadPart,
	type RepoCheckout,
	type SkippedPart,
	definitionIn,
	isTestPath,
	pairsOf,
	partCodesOf,
};
