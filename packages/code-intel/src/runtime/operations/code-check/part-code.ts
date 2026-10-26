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
// A .NET project file stands for its project (TASK-367.11): a part bound to
// `Shop.Core.csproj` binds the directory of the project, as a part bound to
// that directory does, so it owns the project's code, what it declares and
// what it uses, and a part bound to a folder inside is narrower.
//
// A definition that a tool merges from several blocks, such as a compose
// service and its block in an override file or a later YAML document, is the
// part's in every one of them (TASK-367.20).
//
// A part bound to a ref its checkout does not have out is read from that ref's
// tree in Git (ref-code.ts), so its code is the ref's, not the working tree's.
//
// A part the pass cannot read says why where the reason is the board's or this
// machine's to fix: a repository this machine has not registered, a ref its
// checkout cannot resolve, a path Git ignores or one the pass never reads.
// A checkout that is unavailable is said once for the whole checkout, a bound
// path that is not there is the semantics check's to report, and a bound symbol
// that is not there is a finding of its own, so those parts are only unread.

import path from "node:path";
import { otherRefOf, readableOf, type Checkout } from "#runtime/operations/code-check/checkouts.ts";
import {
	heldInFiles,
	terraformRootOfTarget,
	type Search,
} from "#runtime/operations/code-check/claims/symbols.ts";
import { mergedDefinitions } from "#runtime/operations/code-facts/compose/compose-merged.ts";
import { type Definition } from "#runtime/operations/code-facts/facts.ts";
import {
	codeFor,
	targetIn,
	type RefCodes,
	type RepoCheckout,
} from "#runtime/operations/code-check/ref-code.ts";
import type { CheckoutSnapshot, LocalCodeTarget } from "@archboard/code-binding/resolution";
import type { CodeCheckSkip } from "#shared/protocol/code-check.ts";
import { bindingPathOf, type CodeBinding } from "@archboard/code-binding/bindings";
import type { SemanticNode } from "@archboard/board/content";

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

/** How narrow a binding is: a symbol, a file, or a directory with its depth. */
type Grain =
	| {
			readonly kind: "symbol";
			readonly file: string;
			readonly definition: Definition;
			/**
			 * The other blocks of the definition that its tool merges with it,
			 * such as a compose service's block in an override file.
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
	/** The Terraform root module its bound path names, whose address its symbol is. */
	readonly root?: string;
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
	/** The refs read from Git where a checkout has another one out. */
	readonly refs: RefCodes;
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
			/**
			 * The path relative to the checkout, where its links lead; the
			 * directory of a .NET project file.
			 */
			readonly where: string;
			/** Whether it binds one file or a directory, as a project file binds its project. */
			readonly kind: "file" | "directory";
	  }
	| Omit<SkippedPart, "node">
	| { readonly status: "unread" };

/**
 * Where a bound path is in its checkout, once the checkout is read and has the
 * binding's ref out, or in the tree of the ref read from Git.
 * @param binding The binding.
 * @param checkout The code the binding is read in.
 * @param reading The pass.
 * @returns The files the pass may read, or why it reads none.
 */
function locateTarget(binding: CodeBinding, checkout: RepoCheckout, reading: PartReading): Located {
	const target = targetIn(binding, checkout, reading);
	if (!target.ok) return { status: "unread" };
	const readable = readableOf(target, checkout.files, true);
	if (readable.status === "files") {
		return { status: "located", checkout, target, files: readable.files, ...boundAt(target) };
	}
	const reason = readable.status === "ignored" ? "path-ignored" : "path-never-read";
	return { status: "skipped", skip: { reason, repo: checkout.repo, detail: binding.path } };
}

/**
 * What a resolved bound path binds: its file or directory, or the project's
 * directory for a .NET project file.
 * @param target The resolved path.
 * @returns The path relative to the checkout, and whether it is a file or a directory.
 */
function boundAt(
	target: LocalCodeTarget,
): Pick<Extract<Located, { status: "located" }>, "where" | "kind"> {
	const real = relativeTo(target.root, target.target);
	const where = target.kind === "file" ? bindingPathOf(real) : real;
	return { where, kind: where === real ? target.kind : "directory" };
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
	const code = codeFor(reading.refs, checkout, repo, ref);
	if (code !== undefined) return locateTarget(binding, code, reading);
	return { status: "skipped", skip: { reason: "ref-not-checked-out", repo, ref } };
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
	const { kind, files, where } = located;
	if (kind === "file") return { grain: { kind: "file", file: where }, files };
	const run = isTestPath(`${where}/`) ? files : files.filter((file) => !isTestPath(file));
	return { grain: { kind: "directory", directory: where }, files: run };
}

/**
 * How narrow a located binding is, and the files of its code: the definition
 * its symbol names, else the whole file or directory.
 * @param symbol The binding's symbol, if any.
 * @param located Where its path is.
 * @param reading The pass.
 * @param root The Terraform root module its path names, if any.
 * @returns The grain and the files, or undefined when the symbol is not defined there.
 */
async function grainOf(
	symbol: string | undefined,
	located: Extract<Located, { status: "located" }>,
	reading: PartReading,
	root: string | undefined,
): Promise<Pick<ReadPart, "grain" | "files"> | undefined> {
	if (symbol === undefined) return wholeGrainOf(located);
	const search = reading.searchOf(located.checkout);
	const held = await heldInFiles(search, located.files, symbol, "definition", root);
	if (held.status !== "found" || held.definition === undefined) return undefined;
	const { file, definition } = held;
	const merged = await mergedDefinitions(search.facts, search.checkout, file, definition.symbol);
	const grain: Grain = { kind: "symbol", file, definition, merged };
	return { grain, files: [...new Set([file, ...merged.map((each) => each.path)])] };
}

/**
 * A symbol-bound part's definitions in one file: its own, and each block a
 * tool merges into it there.
 * @param part The part.
 * @param file The file.
 * @returns The definitions; none when the part's symbol has none there.
 */
function definitionsIn(part: ReadPart, file: string): Definition[] {
	const { grain } = part;
	if (grain.kind !== "symbol") return [];
	const merged = grain.merged.filter((each) => each.path === file).map((each) => each.definition);
	return grain.file === file ? [grain.definition, ...merged] : merged;
}

/**
 * Why two read parts of one repository have no one code to be judged against:
 * a ref and another, or a ref and the files on disk (TASK-493).
 * @param start One part.
 * @param end The other.
 * @returns The skip, which names what each is read at, or undefined when they are read at the same code.
 */
function differingCode(
	start: ReadPart,
	end: ReadPart,
): Pick<CodeCheckSkip, "reason" | "repo" | "detail"> | undefined {
	if (start.checkout.repo !== end.checkout.repo || start.checkout.root === end.checkout.root) {
		return undefined;
	}
	const detail = [start, end]
		.map((part) => `${part.node.name} is read at ${part.checkout.ref ?? "the checkout's files"}`)
		.join("; ");
	return { reason: "refs-differ", repo: start.checkout.repo, detail };
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
	const root = terraformRootOfTarget(located.target, located.checkout.files);
	const code = await grainOf(binding.symbol, located, reading, root);
	if (code === undefined) return { status: "unread", node };
	const key = `${binding.repo}\0${located.where}\0${binding.symbol ?? ""}`;
	const read = { status: "read", node, checkout: located.checkout, key, ...code } as const;
	return root === undefined ? read : { ...read, root };
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
	definitionsIn,
	differingCode,
	isTestPath,
	pairsOf,
	partCodesOf,
};
