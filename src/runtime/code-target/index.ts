import fs from "node:fs";
import path from "node:path";

import type { CodeBinding } from "../../shared/code-target/index.js";
import { repoIdentityAt, repoRootOf } from "../engine/git.js";
import { listRepos, type RegisteredRepoStatus } from "../engine/repo-registry.js";
import {
	isPathWithin,
	resolveLocalCodeTargetsWith,
	resolveRegisteredCheckoutWith,
	type LocalCodeTargetResult,
	type RegisteredCheckoutResult,
	type ResolverDependencies,
} from "./lib/resolver-core.js";
export type {
	LocalCodeTarget,
	LocalCodeTargetResult,
	RegisteredCheckout,
	RegisteredCheckoutResult,
	ResolutionFailure,
} from "./lib/resolver-core.js";
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

export const EMPTY_CHECKOUT_SNAPSHOT: CheckoutSnapshot = Object.freeze({
	entries: Object.freeze([]),
	inspection: () => undefined,
	path: () => undefined,
});

export async function snapshotCheckoutAccess(
	options: { signal?: AbortSignal; bindings?: readonly CodeBinding[] } = {},
): Promise<CheckoutSnapshot> {
	const entries = listRepos().map((entry) => Object.freeze({ ...entry }));
	const settled = await Promise.allSettled(
		entries.map(async (entry): Promise<readonly [string, CheckoutInspection]> => {
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
		}),
	);
	const failed = settled.find(
		(result): result is PromiseRejectedResult => result.status === "rejected",
	);
	if (failed) {
		throw failed.reason;
	}
	const inspected = settled.map(
		(result) => (result as PromiseFulfilledResult<readonly [string, CheckoutInspection]>).value,
	);
	const inspections = new Map(inspected);
	const paths = new Map<string, PathInspection>();
	const remember = (candidate: string, realpath: string, kind: PathInspection["kind"]): void => {
		paths.set(candidate, Object.freeze({ realpath, kind }));
	};
	for (const entry of entries) {
		const inspection = inspections.get(entry.repo);
		if (!inspection?.registeredRoot || !inspection.root) {
			continue;
		}
		remember(entry.root, inspection.registeredRoot, "directory");
		remember(inspection.registeredRoot, inspection.registeredRoot, "directory");
		remember(inspection.root, inspection.root, "directory");
	}
	for (const binding of options.bindings ?? []) {
		const inspection = binding.repo ? inspections.get(binding.repo) : undefined;
		if (!inspection?.root || path.isAbsolute(binding.path)) {
			continue;
		}
		const lexical = path.resolve(inspection.root, binding.path);
		try {
			const realpath = fs.realpathSync.native(lexical);
			const stats = fs.statSync(realpath);
			const kind = stats.isFile() ? "file" : stats.isDirectory() ? "directory" : undefined;
			if (!kind) {
				continue;
			}
			remember(lexical, realpath, kind);
			remember(realpath, realpath, kind);
		} catch {
			// Absence is immutable evidence too: an unrecorded path stays unavailable
			// for the lifetime of this snapshot.
		}
	}
	return Object.freeze({
		entries: Object.freeze(entries),
		inspection: (repository: string) => inspections.get(repository),
		path: (candidate: string) => paths.get(candidate),
	});
}

function dependenciesFor(snapshot: CheckoutSnapshot): ResolverDependencies {
	return {
		readRegistry: () => [...snapshot.entries],
		realpath: (candidate) => {
			const inspected = snapshot.path(candidate);
			if (!inspected) {
				throw new Error("Path was not captured by this checkout snapshot.");
			}
			return inspected.realpath;
		},
		stat: (candidate) => {
			const inspected = snapshot.path(candidate);
			if (!inspected) {
				throw new Error("Path was not captured by this checkout snapshot.");
			}
			return {
				isDirectory: () => inspected.kind === "directory",
				isFile: () => inspected.kind === "file",
			};
		},
		repoRoot: (candidate) => {
			const entry = snapshot.entries.find(
				(item) => snapshot.inspection(item.repo)?.root === candidate,
			);
			return entry ? snapshot.inspection(entry.repo)?.root : undefined;
		},
		repoIdentity: (candidate) => {
			const entry = snapshot.entries.find(
				(item) => snapshot.inspection(item.repo)?.root === candidate,
			);
			return (entry && snapshot.inspection(entry.repo)?.identity) || "";
		},
	};
}

export function resolveRegisteredCheckout(
	repository: string,
	snapshot: CheckoutSnapshot,
): RegisteredCheckoutResult {
	return resolveRegisteredCheckoutWith(repository, dependenciesFor(snapshot));
}

export function resolveLocalCodeTargets(
	bindings: readonly CodeBinding[],
	snapshot: CheckoutSnapshot,
): LocalCodeTargetResult[] {
	return resolveLocalCodeTargetsWith(bindings, dependenciesFor(snapshot));
}

export function resolveLocalCodeTarget(
	binding: CodeBinding,
	snapshot: CheckoutSnapshot,
): LocalCodeTargetResult {
	return resolveLocalCodeTargets([binding], snapshot)[0]!;
}
