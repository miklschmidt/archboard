// The code of a ref that a checkout does not have out, read from Git
// (TASK-493).
//
// A part bound to a branch or a commit, and an anchor on a relationship whose
// end is so bound, describe that ref's code. Where the checkout has the ref
// out, the pass reads the files on disk. Where it has another one out, the pass
// reads the ref from Git without checking it out or touching the working tree:
// the tree of its commit, and the texts of the bound and anchored paths, read
// through the same code facts as a checkout's files (history lens
// `sourceAt`). Every check that judges a part then reads that one code: its
// bound path and symbol, its anchors, the evidence between parts and the
// interface of a module.
//
// Each ref is a tree of its own, named by a root that is no directory on disk:
// the checkout's root and the commit. Everything the pass keys by checkout
// keys by that root, so the files on disk and the trees of two refs of one
// repository are never mixed. A ref the checkout cannot resolve has no tree,
// and its parts are skipped with the ref named.
//
// What a tree cannot give is a language server, which reads the files on
// disk. A use in a tree that no import resolves stays as code facts read it,
// and the pass says so once for each repository and ref.
//
// Only the bound and anchored paths, Terraform files and the like that
// `sourceAt` selects are read as text, so a file beside them that only a
// resolver reads, such as a `tsconfig.json` in another directory, is not.

import path from "node:path";
import {
	normalized,
	otherRefOf,
	type Checkout,
	type ReadCheckout,
} from "@/runtime/code-check/lib/checkouts";
import type { AnchorClaim, Claim } from "@/runtime/code-check/lib/claims";
import type { Resolve } from "@/runtime/code-check/lib/resolution";
import { createSourceFacts, type FactsPass } from "@/runtime/code-facts/index";
import {
	resolveLocalCodeTarget,
	type CheckoutSnapshot,
	type LocalCodeTargetResult,
	type OtherRef,
} from "@/runtime/code-target/index";
import { sourceAt } from "@/runtime/history-lens/index";
import type { CodeCheckSkip } from "@/shared/code-check/index";
import type { CodeBinding } from "@/shared/code-target/index";

/** The code one ref names in one repository, read from Git. */
interface RefCode {
	readonly repo: string;
	/** The ref as the binding names it, and what the checkout has out instead. */
	readonly ref: OtherRef;
	readonly commit: string;
	/** The tree; its root names the checkout and the commit and is no directory on disk. */
	readonly checkout: ReadCheckout;
	/** The checkout's own root, for words to a person. */
	readonly checkoutRoot: string;
	readonly facts: FactsPass;
	/** Every directory that holds a file of the tree. */
	readonly directories: ReadonlySet<string>;
}

/** The refs a pass read, by repository and ref, and by the root of their trees. */
interface RefCodes {
	readonly byRef: ReadonlyMap<string, RefCode>;
	readonly byRoot: ReadonlyMap<string, RefCode>;
}

/**
 * A checkout the pass reads, with the repository it is: its files on disk, or
 * the tree of a ref read from Git, which names the ref.
 */
type RepoCheckout = ReadCheckout & { readonly repo: string; readonly ref?: string };

/** A path a binding or an anchor reads at a ref that its checkout does not have out. */
interface RefRead {
	readonly repo: string;
	readonly ref: OtherRef;
	readonly path: string;
}

/** The skip of a use no language server was asked about, said once for each repository and ref. */
const NO_SERVER_DETAIL =
	"Language servers read the files on disk, and this ref is read from Git, so a use that no " +
	"import resolves stays as code facts read it.";

/**
 * What a ref is keyed by.
 * @param repo The repository.
 * @param named The ref.
 * @returns The key.
 */
function keyOf(repo: string, named: string): string {
	return `${repo}\0${named}`;
}

/**
 * The ref a claim's code is pinned to, when its checkout has another one out:
 * a binding's own pin, or the pin of a part at an anchor's end that binds the
 * anchor's repository, since the files on disk are then not that ref's.
 * @param claim The claim.
 * @param snapshot The registered checkouts.
 * @returns The two refs, and for an anchor the end that is pinned, or nothing.
 */
function pinOf(claim: Claim, snapshot: CheckoutSnapshot): Pick<CodeCheckSkip, "ref" | "detail"> {
	if (claim.kind === "binding") return { ref: otherRefOf(claim.binding, snapshot) };
	const pins = claim.ends.flatMap((end) => {
		const ref =
			end.binding?.repo === claim.anchor.repo ? otherRefOf(end.binding, snapshot) : undefined;
		return ref === undefined ? [] : [{ ref, detail: `${end.name} is pinned to ${ref.named}` }];
	});
	return pins[0] ?? {};
}

/**
 * Every path the claims and the bound parts read at a ref their checkouts lack.
 * @param claims The claims.
 * @param bound The binding of every bound part.
 * @param snapshot The registered checkouts.
 * @returns The reads.
 */
function refReadsOf(
	claims: readonly Claim[],
	bound: readonly CodeBinding[],
	snapshot: CheckoutSnapshot,
): RefRead[] {
	const parts = bound.flatMap((binding) => {
		const ref = otherRefOf(binding, snapshot);
		return ref === undefined ? [] : [{ repo: binding.repo, ref, path: binding.path }];
	});
	const anchors = claims
		.filter((claim): claim is AnchorClaim => claim.kind === "anchor")
		.flatMap((claim) => {
			const { ref } = pinOf(claim, snapshot);
			return ref === undefined ? [] : [{ repo: claim.anchor.repo, ref, path: claim.anchor.path }];
		});
	return [...parts, ...anchors];
}

/**
 * The directories that hold the files of a tree.
 * @param files The files.
 * @returns Each directory, with the root as the empty string.
 */
function directoriesOf(files: ReadonlySet<string>): Set<string> {
	const directories = new Set([""]);
	for (const file of files) {
		for (let at = path.posix.dirname(file); at !== "." && !directories.has(at);) {
			directories.add(at);
			at = path.posix.dirname(at);
		}
	}
	return directories;
}

/**
 * Read one ref of one checkout from Git.
 * @param read The ref, its repository and every path read there.
 * @param read.repo The repository.
 * @param read.ref The ref.
 * @param read.paths The paths.
 * @param checkout The repository's checkout.
 * @param signal Cancels the reading.
 * @returns The code, or undefined when the checkout cannot resolve the ref.
 */
async function readRef(
	read: { readonly repo: string; readonly ref: OtherRef; readonly paths: ReadonlySet<string> },
	checkout: ReadCheckout,
	signal: AbortSignal,
): Promise<RefCode | undefined> {
	const source = await sourceAt(checkout.root, read.ref.named, [...read.paths], { signal });
	if (source === undefined) return undefined;
	const root = `${checkout.root}@${read.ref.named}`;
	const { files } = source.checkout;
	const facts = createSourceFacts().pass({ root, files }, source.sources, signal);
	return {
		repo: read.repo,
		ref: read.ref,
		commit: source.commit,
		checkout: { status: "read", root, files },
		checkoutRoot: checkout.root,
		facts,
		directories: directoriesOf(files),
	};
}

/**
 * Read from Git each ref that a binding or an anchor names and its checkout
 * does not have out.
 * @param reads Every path read at such a ref.
 * @param checkouts Each repository's checkout.
 * @param signal Cancels the reading.
 * @returns The refs the checkouts could resolve.
 */
async function readRefCodes(
	reads: readonly RefRead[],
	checkouts: ReadonlyMap<string, Checkout>,
	signal: AbortSignal,
): Promise<RefCodes> {
	const wanted = new Map<
		string,
		{ repo: string; ref: OtherRef; paths: Set<string>; checkout: ReadCheckout }
	>();
	for (const { repo, ref, path: bound } of reads) {
		const checkout = checkouts.get(repo);
		if (checkout?.status !== "read") continue;
		const key = keyOf(repo, ref.named);
		const held = wanted.get(key) ?? { repo, ref, paths: new Set<string>(), checkout };
		held.paths.add(bound);
		wanted.set(key, held);
	}
	const read = await Promise.all(
		[...wanted].map(async ([key, one]) => [key, await readRef(one, one.checkout, signal)] as const),
	);
	const byRef = new Map(read.flatMap(([key, code]) => (code === undefined ? [] : [[key, code]])));
	return { byRef, byRoot: new Map([...byRef.values()].map((code) => [code.checkout.root, code])) };
}

/**
 * The code a ref names in a repository.
 * @param refs The refs read from Git.
 * @param repo The repository.
 * @param named The ref as a binding names it.
 * @returns Its code, or undefined when the checkout cannot resolve it.
 */
function refOf(refs: RefCodes, repo: string, named: string): RefCode | undefined {
	return refs.byRef.get(keyOf(repo, named));
}

/**
 * The ref a checkout of the pass is the tree of.
 * @param refs The refs read from Git.
 * @param checkout The checkout.
 * @returns The code, or undefined for the files on disk.
 */
function refAt(refs: RefCodes, checkout: Pick<ReadCheckout, "root">): RefCode | undefined {
	return refs.byRoot.get(checkout.root);
}

/**
 * The code to read for a pin: the checkout's files where nothing is pinned
 * away from them, else the tree of the ref.
 * @param refs The refs read from Git.
 * @param checkout The repository's checkout.
 * @param repo The repository.
 * @param pin The ref the checkout lacks out, if the binding or anchor is pinned to one.
 * @returns The code, or undefined when the checkout cannot resolve the ref.
 */
function codeFor(
	refs: RefCodes,
	checkout: ReadCheckout,
	repo: string,
	pin: OtherRef | undefined,
): RepoCheckout | undefined {
	if (pin === undefined) return { ...checkout, repo };
	const code = refOf(refs, repo, pin.named);
	return code === undefined ? undefined : { ...code.checkout, repo, ref: pin.named };
}

/**
 * Whether a binding is read at the code a checkout of the pass is: both on
 * disk, or both at one ref.
 * @param binding The binding.
 * @param checkout The checkout the pass reads.
 * @param reading The refs and the registered checkouts.
 * @param reading.refs The refs read from Git.
 * @param reading.snapshot The registered checkouts.
 * @returns True when they are.
 */
function readsSameCode(
	binding: CodeBinding,
	checkout: Pick<ReadCheckout, "root">,
	reading: { readonly refs: RefCodes; readonly snapshot: CheckoutSnapshot },
): boolean {
	return otherRefOf(binding, reading.snapshot)?.named === refAt(reading.refs, checkout)?.ref.named;
}

/**
 * Facts that read each tree as its source does and every other checkout as
 * the pass does.
 * @param refs The refs read from Git.
 * @param disk The pass's facts of the files on disk.
 * @returns The facts.
 */
function routedFacts(refs: RefCodes, disk: FactsPass): FactsPass {
	return {
		...disk,
		/**
		 * The facts of one file, read from the source its checkout is.
		 * @param checkout The checkout or tree.
		 * @param relative The file.
		 * @returns Its facts, or undefined.
		 */
		read: (checkout, relative) => (refAt(refs, checkout)?.facts ?? disk).read(checkout, relative),
	};
}

/**
 * What a path is in a tree, as the files on disk would say it.
 * @param binding The binding or anchor.
 * @param code The tree's code.
 * @returns The target the pass reads, or why the tree has none.
 */
function treeTarget(
	binding: Pick<CodeBinding, "repo" | "path">,
	code: RefCode,
): LocalCodeTargetResult {
	const relative = normalized(binding.path);
	const kind = code.checkout.files.has(relative)
		? "file"
		: code.directories.has(relative)
			? "directory"
			: undefined;
	if (kind === undefined) {
		return {
			ok: false,
			code: "TARGET_UNAVAILABLE",
			error: `The bound target is not in ${JSON.stringify(code.ref.named)}.`,
		};
	}
	const { root } = code.checkout;
	return {
		ok: true,
		repository: binding.repo,
		root,
		target: path.join(root, relative),
		path: binding.path,
		kind,
	};
}

/**
 * Where a bound or anchored path is in the code a pass reads for it: on disk,
 * or in the tree of a ref.
 * @param binding The binding or anchor.
 * @param checkout The checkout the pass reads for it.
 * @param reading The refs and the registered checkouts.
 * @param reading.refs The refs read from Git.
 * @param reading.snapshot The registered checkouts.
 * @returns The target, or why the code has none.
 */
function targetIn(
	binding: Pick<CodeBinding, "repo" | "path">,
	checkout: Pick<ReadCheckout, "root">,
	reading: { readonly refs: RefCodes; readonly snapshot: CheckoutSnapshot },
): LocalCodeTargetResult {
	const code = refAt(reading.refs, checkout);
	return code === undefined
		? resolveLocalCodeTarget(binding, reading.snapshot)
		: treeTarget(binding, code);
}

/**
 * The words that name the code a claim read, for a finding that says it is not there.
 * @param checkout The checkout the pass read.
 * @param refs The refs read from Git.
 * @returns A noun phrase.
 */
function whereIn(checkout: ReadCheckout, refs: RefCodes): string {
	const code = refAt(refs, checkout);
	return code === undefined
		? `the checkout at ${JSON.stringify(checkout.root)}`
		: `${JSON.stringify(code.ref.named)} in the checkout at ${JSON.stringify(code.checkoutRoot)}`;
}

/**
 * A resolution that asks no language server about a tree of a ref, and notes
 * the repository and ref it was not asked about.
 * @param resolve The pass's resolution of the files on disk.
 * @param refs The refs read from Git.
 * @param asked The refs a use was not resolved in, which this adds to.
 * @returns The resolution.
 */
function resolveOnDisk(resolve: Resolve, refs: RefCodes, asked: Set<RefCode>): Resolve {
	return (checkout, file, use) => {
		const code = refAt(refs, checkout);
		if (code === undefined) return resolve(checkout, file, use);
		asked.add(code);
		return Promise.resolve({ status: "unknown" });
	};
}

/**
 * The skip for the refs whose uses were not resolved, once for each.
 * @param asked The refs.
 * @returns The skips.
 */
function noServerSkips(asked: ReadonlySet<RefCode>): CodeCheckSkip[] {
	return [...asked].map((code) => ({
		reason: "ref-without-language-server",
		repo: code.repo,
		ref: code.ref,
		detail: NO_SERVER_DETAIL,
	}));
}

export {
	type RefCode,
	type RefCodes,
	type RepoCheckout,
	codeFor,
	noServerSkips,
	pinOf,
	readRefCodes,
	readsSameCode,
	refReadsOf,
	resolveOnDisk,
	routedFacts,
	targetIn,
	whereIn,
};
