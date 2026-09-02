import fs from "node:fs";

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
	root?: string;
	identity?: string;
}

/** Immutable, operation-local evidence about the registered checkouts. */
export interface CheckoutSnapshot {
	readonly entries: readonly RegisteredRepoStatus[];
	inspection(repository: string): CheckoutInspection | undefined;
}

export const EMPTY_CHECKOUT_SNAPSHOT: CheckoutSnapshot = Object.freeze({
	entries: Object.freeze([]),
	inspection: () => undefined,
});

export async function snapshotCheckoutAccess(
	options: { signal?: AbortSignal } = {},
): Promise<CheckoutSnapshot> {
	const entries = listRepos();
	for (const entry of entries) Object.freeze(entry);
	const inspected = await Promise.all(
		entries.map(async (entry): Promise<readonly [string, CheckoutInspection]> => {
			try {
				const root = await repoRootOf(entry.root, options);
				if (!root) return [entry.repo, {}];
				return [entry.repo, { root, identity: await repoIdentityAt(root, options) }];
			} catch {
				if (options.signal?.aborted)
					throw new DOMException("Checkout snapshot cancelled.", "AbortError");
				return [entry.repo, {}];
			}
		}),
	);
	const inspections = new Map(inspected);
	return Object.freeze({
		entries: Object.freeze(entries),
		inspection: (repository: string) => inspections.get(repository),
	});
}

function dependenciesFor(snapshot: CheckoutSnapshot): ResolverDependencies {
	return {
		readRegistry: () => [...snapshot.entries],
		realpath: fs.realpathSync.native,
		stat: fs.statSync,
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
