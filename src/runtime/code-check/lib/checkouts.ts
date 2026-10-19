// The registered checkouts one pass reads, and the files in each that it may
// read (ADR 0046).
//
// A repository this machine has not registered stays silent: its subjects get
// no finding and are listed as skipped. A registered checkout that is gone, is
// no longer a Git checkout or no longer identifies as its repository is said
// once, with no subject, because the reason holds for the whole checkout. Every
// path is resolved through the code opener's rules, so it stays inside its
// checkout before and after symbolic links resolve, and code facts read a
// file only where its links lead to a file Git lists in that checkout.

import path from "node:path";
import {
	resolveLocalCodeTarget,
	resolveRegisteredCheckout,
	type CheckoutSnapshot,
} from "@archboard/code-binding/checkout-snapshot";
import { type LocalCodeTarget, type OtherRef } from "@archboard/code-binding/binding-resolver";
import { listReadableFiles } from "@/runtime/code-check/lib/readable-files";
import { neverRead, pairOf } from "@/runtime/code-facts/index";
import type { CodeCheckSkip } from "@/shared/code-check/index";
import { bindingPathOf, filesOfBinding } from "@archboard/code-binding/binding-files";
import { type CodeBinding } from "@archboard/code-binding/code-binding";
import { errorMessage } from "@archboard/diagnostics/errno";

/** A registered checkout the pass reads: its canonical root, and the files Git does not ignore. */
interface ReadCheckout {
	readonly status: "read";
	readonly root: string;
	readonly files: ReadonlySet<string>;
}

/** One repository as the pass finds it on this machine. */
type Checkout =
	| { readonly status: "unregistered" }
	| { readonly status: "unavailable"; readonly detail: string }
	| ReadCheckout;

/** What the pass may read of one bound or anchored path. */
type Readable =
	| { readonly status: "files"; readonly files: readonly string[] }
	| { readonly status: "ignored" }
	| { readonly status: "never-read" };

/**
 * Each repository the claims name, as this machine has it, with the files the
 * pass may read in each registered checkout.
 * @param repos The repositories.
 * @param snapshot The registered checkouts.
 * @param signal Cancels every listing.
 * @returns Each repository's checkout.
 */
async function readCheckouts(
	repos: Iterable<string>,
	snapshot: CheckoutSnapshot,
	signal: AbortSignal,
): Promise<Map<string, Checkout>> {
	const each = await Promise.all(
		[...new Set(repos)].map(async (repo): Promise<[string, Checkout]> => {
			if (snapshot.inspection(repo) === undefined) return [repo, { status: "unregistered" }];
			const checkout = resolveRegisteredCheckout(repo, snapshot);
			if (!checkout.ok) return [repo, { status: "unavailable", detail: checkout.error }];
			try {
				const files = await listReadableFiles(checkout.root, signal);
				return [repo, { status: "read", root: checkout.root, files }];
			} catch (error) {
				signal.throwIfAborted();
				return [repo, { status: "unavailable", detail: errorMessage(error) }];
			}
		}),
	);
	return new Map(each);
}

/**
 * The ref a binding is pinned to, when its checkout has another one out. The
 * ref rule does not depend on the path, so it is read at the checkout root,
 * which a snapshot always holds.
 * @param binding The binding.
 * @param snapshot The registered checkouts.
 * @returns The two refs, or undefined when the checkout has the pinned ref out or none is pinned.
 */
function otherRefOf(binding: CodeBinding, snapshot: CheckoutSnapshot): OtherRef | undefined {
	if (binding.branch === undefined && binding.commit === undefined) return undefined;
	const root = resolveLocalCodeTarget({ ...binding, path: "." }, snapshot);
	return root.ok ? root.otherRef : undefined;
}

/**
 * A repository-relative path with `/` between names and no `.` or trailing `/`.
 * @param relative The path.
 * @returns It normalized; the empty string is the whole checkout.
 */
function normalized(relative: string): string {
	const posix = path.posix.normalize(relative.replaceAll("\\", "/")).replace(/\/+$/u, "");
	return posix === "." ? "" : posix;
}

/**
 * The listed files of a resolved path, before the pass removes files it never
 * reads. A binding expands a project file; an anchor keeps that exact file.
 * @param target The resolved path.
 * @param files The files Git does not ignore.
 * @param bound Whether the path binds a part rather than citing an anchor.
 * @returns The matching listed files.
 */
function listedFiles(
	target: LocalCodeTarget,
	files: ReadonlySet<string>,
	bound: boolean,
): string[] {
	const real = normalized(path.relative(target.root, target.target));
	if (target.kind === "file" && (!bound || bindingPathOf(real) === real)) {
		return filesOfBinding(real, [real]).filter((file) => files.has(file));
	}
	const scopes =
		target.kind === "directory" ? [normalized(target.path), real] : [bindingPathOf(real)];
	return [...new Set(scopes.flatMap((scope) => filesOfBinding(scope, files)))];
}

/**
 * What the pass may read of a resolved path: the file, or every file below the
 * directory, that Git does not ignore and that is not one the pass never reads.
 * A file is judged where its symbolic links lead, so a tracked link to an
 * ignored file is ignored.
 * @param target The resolved path.
 * @param files The files Git does not ignore in its checkout.
 * @param bound Whether the path binds a part rather than citing an anchor.
 * @returns The files to read, or why there are none.
 */
function pathReadable(
	target: LocalCodeTarget,
	files: ReadonlySet<string>,
	bound = false,
): Readable {
	const lexical = normalized(target.path);
	const real = normalized(path.relative(target.root, target.target));
	if (neverRead(lexical) || neverRead(real)) return { status: "never-read" };
	const listed = listedFiles(target, files, bound);
	if (listed.length === 0) return { status: "ignored" };
	const readable = listed.filter((file) => !neverRead(file));
	return readable.length === 0 ? { status: "never-read" } : { status: "files", files: readable };
}

/**
 * What the pass may read of a resolved path. The bound code of a part takes in
 * the pair of a C or C++ file too, the header of a source file or the source
 * file of a header (TASK-367.09), and a .NET project file binds its project,
 * every file below its directory (TASK-367.11); an anchor names one file and
 * reads only that.
 * @param target The resolved path.
 * @param files The files Git does not ignore in its checkout.
 * @param bound Whether the path is the binding of a part.
 * @returns The files to read, or why there are none.
 */
function readableOf(target: LocalCodeTarget, files: ReadonlySet<string>, bound = false): Readable {
	return bound ? boundReadable(target, files) : pathReadable(target, files);
}

/**
 * What the pass may read of the bound path of a part: a file with its pair,
 * the project of a project file, or every file below a directory.
 * @param target The resolved path.
 * @param files The files Git does not ignore in its checkout.
 * @returns The files to read, or why there are none.
 */
function boundReadable(target: LocalCodeTarget, files: ReadonlySet<string>): Readable {
	const readable = pathReadable(target, files, true);
	if (readable.status !== "files" || target.kind !== "file") return readable;
	const pair = readable.files
		.flatMap((file) => pairOf(file, files))
		.filter((file) => !neverRead(file));
	return { status: "files", files: [...new Set([...readable.files, ...pair])] };
}

/**
 * What the pass says once for each checkout: that it is unavailable, or that
 * it read some of its files as text, so for those it judged anchors and bound
 * symbols by name and nothing that needs references.
 * @param checkouts Each repository's checkout.
 * @param readAsText The kinds of file read as text in each repository.
 * @returns The skips.
 */
function checkoutSkips(
	checkouts: ReadonlyMap<string, Checkout>,
	readAsText: ReadonlyMap<string, ReadonlySet<string>>,
): CodeCheckSkip[] {
	return [...checkouts].flatMap(([repo, checkout]): CodeCheckSkip[] => {
		if (checkout.status === "unavailable") {
			return [{ reason: "checkout-unavailable", repo, detail: checkout.detail }];
		}
		const kinds = [...(readAsText.get(repo) ?? [])].toSorted();
		if (kinds.length === 0) return [];
		const detail =
			`Read as text: ${kinds.join(", ")}. Their anchors and bound symbols were judged by ` +
			"name, and nothing that needs references.";
		return [{ reason: "text-only", repo, detail }];
	});
}

export {
	type Checkout,
	type ReadCheckout,
	type Readable,
	checkoutSkips,
	normalized,
	otherRefOf,
	readCheckouts,
	readableOf,
};
