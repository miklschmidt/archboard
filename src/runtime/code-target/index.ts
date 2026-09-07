import fs from "node:fs";
import path from "node:path";

import type { CodeBinding } from "@/shared/code-target";
import { repoIdentityAt, repoRootOf } from "@/runtime/engine/git";
import { listRepos, type RegisteredRepoStatus } from "@/runtime/engine/repo-registry";
import {
	isPathWithin,
	resolveLocalCodeTargetsWith,
	resolveRegisteredCheckoutWith,
	type LocalCodeTargetResult,
	type RegisteredCheckoutResult,
	type ResolverDependencies,
} from "@/runtime/code-target/lib/resolver-core";
export type {
	LocalCodeTarget,
	LocalCodeTargetResult,
	RegisteredCheckout,
	RegisteredCheckoutResult,
	ResolutionFailure,
} from "@/runtime/code-target/lib/resolver-core";
export { isPathWithin };

interface CheckoutInspection {
	readonly registeredRoot?: string;
	readonly root?: string;
	readonly identity?: string;
}

interface PathInspection {
	readonly realpath: string;
	readonly kind: "file" | "directory";
}

/** Immutable, operation-local evidence about the registered checkouts. */
export interface CheckoutSnapshot {
	readonly entries: readonly Readonly<RegisteredRepoStatus>[];
	inspection(repository: string): Readonly<CheckoutInspection> | undefined;
	path(candidate: string): Readonly<PathInspection> | undefined;
}

type SnapshotOptions = { signal?: AbortSignal; bindings?: readonly CodeBinding[] };
type InspectedCheckout = readonly [string, CheckoutInspection];
type RememberPath = (candidate: string, realpath: string, kind: PathInspection["kind"]) => void;

export const EMPTY_CHECKOUT_SNAPSHOT: CheckoutSnapshot = Object.freeze({
	entries: Object.freeze([]),
	/**
	 * Reports no checkout evidence, because the empty snapshot inspected nothing.
	 * @returns Always undefined.
	 */
	inspection: () => undefined,
	/**
	 * Reports no path evidence, because the empty snapshot inspected nothing.
	 * @returns Always undefined.
	 */
	path: () => undefined,
});

/**
 * Inspects one registered checkout on disk: its canonical registered root, the
 * Git root discovered from it and the identity recorded there. Any failure
 * yields an empty inspection so the snapshot stays complete, except for a
 * cancellation, which is rethrown as the abort it represents.
 * @param entry - The registry entry to inspect.
 * @param options - The abort signal shared by the whole snapshot.
 * @returns The repository name paired with what was found for it.
 */
async function inspectCheckout(
	entry: Readonly<RegisteredRepoStatus>,
	options: SnapshotOptions,
): Promise<InspectedCheckout> {
	try {
		const registeredRoot = fs.realpathSync.native(entry.root);
		if (!fs.statSync(registeredRoot).isDirectory()) {
			return [entry.repo, Object.freeze({})];
		}
		const discoveredRoot = await repoRootOf(registeredRoot, options);
		if (!discoveredRoot) {
			return [entry.repo, Object.freeze({})];
		}
		const root = fs.realpathSync.native(discoveredRoot);
		return [
			entry.repo,
			Object.freeze({
				registeredRoot,
				root,
				identity: await repoIdentityAt(root, options),
			}),
		];
	} catch {
		if (options.signal?.aborted) {
			throw new DOMException("Checkout snapshot cancelled.", "AbortError");
		}
		return [entry.repo, Object.freeze({})];
	}
}

/**
 * Narrows a settled inspection to its fulfilled shape so the fulfilled values
 * can be collected without a type assertion.
 * @param result - One settled inspection promise.
 * @returns Whether the inspection fulfilled.
 */
function isFulfilledInspection(
	result: PromiseSettledResult<InspectedCheckout>,
): result is PromiseFulfilledResult<InspectedCheckout> {
	return result.status === "fulfilled";
}

/**
 * Records the registered and discovered roots of every inspected checkout as
 * directories, so later resolution never touches the filesystem for them.
 * @param entries - The registry entries that were inspected.
 * @param inspections - The inspection found for each repository.
 * @param remember - Adds one path record to the snapshot.
 */
function rememberCheckoutRoots(
	entries: readonly Readonly<RegisteredRepoStatus>[],
	inspections: ReadonlyMap<string, CheckoutInspection>,
	remember: RememberPath,
): void {
	for (const entry of entries) {
		const inspection = inspections.get(entry.repo);
		if (!inspection?.registeredRoot || !inspection.root) {
			continue;
		}
		remember(entry.root, inspection.registeredRoot, "directory");
		remember(inspection.registeredRoot, inspection.registeredRoot, "directory");
		remember(inspection.root, inspection.root, "directory");
	}
}

/**
 * Classifies a stat result as the only two kinds a code target may name.
 * @param stats - The stat result of a candidate path.
 * @returns The path kind, or undefined for anything else (a socket, a device).
 */
function pathKind(stats: fs.Stats): PathInspection["kind"] | undefined {
	if (stats.isFile()) {
		return "file";
	}
	return stats.isDirectory() ? "directory" : undefined;
}

/**
 * Finds the discovered Git root of the checkout a binding names, when the
 * binding names a repository and the checkout was inspected successfully.
 * @param binding - The binding whose repository is looked up.
 * @param inspections - The inspection found for each repository.
 * @returns The canonical Git root, or undefined when there is none to resolve against.
 */
function bindingCheckoutRoot(
	binding: CodeBinding,
	inspections: ReadonlyMap<string, CheckoutInspection>,
): string | undefined {
	if (!binding.repo) {
		return undefined;
	}
	return inspections.get(binding.repo)?.root;
}

/**
 * Records where one binding's relative path lands inside its checkout, both
 * lexically and canonically. A path that cannot be inspected is left
 * unrecorded on purpose: absence is immutable evidence for this snapshot too.
 * @param binding - The binding whose path is inspected.
 * @param inspections - The inspection found for each repository.
 * @param remember - Adds one path record to the snapshot.
 */
function rememberBindingPath(
	binding: CodeBinding,
	inspections: ReadonlyMap<string, CheckoutInspection>,
	remember: RememberPath,
): void {
	const root = bindingCheckoutRoot(binding, inspections);
	if (root === undefined || path.isAbsolute(binding.path)) {
		return;
	}
	const lexical = path.resolve(root, binding.path);
	try {
		const realpath = fs.realpathSync.native(lexical);
		const kind = pathKind(fs.statSync(realpath));
		if (!kind) {
			return;
		}
		remember(lexical, realpath, kind);
		remember(realpath, realpath, kind);
	} catch {
		// Absence is immutable evidence too: an unrecorded path stays unavailable
		// for the lifetime of this snapshot.
	}
}

/**
 * Captures every checkout and binding path the caller will resolve as one
 * immutable snapshot, so a whole operation reads one consistent view of the
 * filesystem instead of racing concurrent edits.
 * @param options - An abort signal and the bindings whose paths must be captured.
 * @returns The frozen snapshot the resolvers read from.
 */
export async function snapshotCheckoutAccess(
	options: SnapshotOptions = {},
): Promise<CheckoutSnapshot> {
	const entries = listRepos().map((entry) => Object.freeze({ ...entry }));
	const settled = await Promise.allSettled(entries.map((entry) => inspectCheckout(entry, options)));
	const failed = settled.find(
		(result): result is PromiseRejectedResult => result.status === "rejected",
	);
	if (failed) {
		throw failed.reason;
	}
	const inspections = new Map(settled.filter(isFulfilledInspection).map((result) => result.value));
	const paths = new Map<string, PathInspection>();
	/**
	 * Adds one frozen path record to the snapshot.
	 * @param candidate - The path as a caller will ask for it.
	 * @param realpath - Its canonical location.
	 * @param kind - Whether it is a file or a directory.
	 */
	const remember: RememberPath = (candidate, realpath, kind): void => {
		paths.set(candidate, Object.freeze({ realpath, kind }));
	};
	rememberCheckoutRoots(entries, inspections, remember);
	for (const binding of options.bindings ?? []) {
		rememberBindingPath(binding, inspections, remember);
	}
	return Object.freeze({
		entries: Object.freeze(entries),
		/**
		 * Looks up what the snapshot found for one repository.
		 * @param repository - The registered repository name.
		 * @returns The inspection, or undefined when the repository was not registered.
		 */
		inspection: (repository: string) => inspections.get(repository),
		/**
		 * Looks up what the snapshot found for one path.
		 * @param candidate - The path as it was captured.
		 * @returns The path record, or undefined when the path was never captured.
		 */
		path: (candidate: string) => paths.get(candidate),
	});
}

/**
 * Adapts a snapshot to the resolver's dependency interface, so resolution
 * reads only captured evidence and throws for anything the snapshot missed.
 * @param snapshot - The captured checkout evidence.
 * @returns Resolver dependencies backed by the snapshot alone.
 */
function dependenciesFor(snapshot: CheckoutSnapshot): ResolverDependencies {
	return {
		/**
		 * Copies the captured registry entries for the resolver.
		 * @returns The registry entries as captured.
		 */
		readRegistry: () => [...snapshot.entries],
		/**
		 * Answers the canonical path from captured evidence.
		 * @param candidate - The path to canonicalise.
		 * @returns The captured canonical path.
		 */
		realpath: (candidate) => {
			const inspected = snapshot.path(candidate);
			if (!inspected) {
				throw new Error("Path was not captured by this checkout snapshot.");
			}
			return inspected.realpath;
		},
		/**
		 * Answers the captured kind of a path in the shape of a stat result.
		 * @param candidate - The path to classify.
		 * @returns The file-or-directory predicates for the captured kind.
		 */
		stat: (candidate) => {
			const inspected = snapshot.path(candidate);
			if (!inspected) {
				throw new Error("Path was not captured by this checkout snapshot.");
			}
			return {
				/**
				 * Whether the captured path is a directory.
				 * @returns True for a captured directory.
				 */
				isDirectory: () => inspected.kind === "directory",
				/**
				 * Whether the captured path is a file.
				 * @returns True for a captured file.
				 */
				isFile: () => inspected.kind === "file",
			};
		},
		/**
		 * Finds the discovered Git root that equals the candidate.
		 * @param candidate - A canonical directory.
		 * @returns The matching Git root, or undefined when no checkout has it.
		 */
		repoRoot: (candidate) => {
			const entry = snapshot.entries.find(
				(item) => snapshot.inspection(item.repo)?.root === candidate,
			);
			return entry ? snapshot.inspection(entry.repo)?.root : undefined;
		},
		/**
		 * Reads the identity captured for the checkout rooted at the candidate.
		 * @param candidate - A canonical Git root.
		 * @returns The captured identity, or an empty string when none was found.
		 */
		repoIdentity: (candidate) => {
			const entry = snapshot.entries.find(
				(item) => snapshot.inspection(item.repo)?.root === candidate,
			);
			return (entry && snapshot.inspection(entry.repo)?.identity) || "";
		},
	};
}

/**
 * Resolves a registered checkout from snapshot evidence.
 * @param repository - The registered repository name.
 * @param snapshot - The captured checkout evidence.
 * @returns The checkout root, or the reason it is unavailable.
 */
export function resolveRegisteredCheckout(
	repository: string,
	snapshot: CheckoutSnapshot,
): RegisteredCheckoutResult {
	return resolveRegisteredCheckoutWith(repository, dependenciesFor(snapshot));
}

/**
 * Resolves many code bindings against one snapshot, one result per binding in
 * the same order.
 * @param bindings - The bindings to resolve.
 * @param snapshot - The captured checkout evidence.
 * @returns A local target or failure for each binding.
 */
export function resolveLocalCodeTargets(
	bindings: readonly CodeBinding[],
	snapshot: CheckoutSnapshot,
): LocalCodeTargetResult[] {
	return resolveLocalCodeTargetsWith(bindings, dependenciesFor(snapshot));
}

/**
 * Resolves a single code binding against one snapshot.
 * @param binding - The binding to resolve.
 * @param snapshot - The captured checkout evidence.
 * @returns The local target or the reason it is unavailable.
 */
export function resolveLocalCodeTarget(
	binding: CodeBinding,
	snapshot: CheckoutSnapshot,
): LocalCodeTargetResult {
	return resolveLocalCodeTargets([binding], snapshot)[0]!;
}
