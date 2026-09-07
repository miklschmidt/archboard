import type { Stats } from "node:fs";
import path from "node:path";

import {
	CodeBindingSchema,
	type CodeBinding,
	type CodeTargetFailureCode,
} from "@/shared/code-target";
import type { RegisteredRepo } from "@/runtime/engine/repo-registry";

type ResolutionFailureCode = Extract<
	CodeTargetFailureCode,
	| "BINDING_UNAVAILABLE"
	| "CHECKOUT_UNAVAILABLE"
	| "CHECKOUT_IDENTITY_CHANGED"
	| "TARGET_UNAVAILABLE"
	| "TARGET_OUTSIDE_CHECKOUT"
>;
interface ResolutionFailure {
	ok: false;
	code: ResolutionFailureCode;
	error: string;
}
interface RegisteredCheckout {
	ok: true;
	repository: string;
	root: string;
}
interface LocalCodeTarget extends RegisteredCheckout {
	target: string;
	path: string;
	kind: "file" | "directory";
}
type RegisteredCheckoutResult = RegisteredCheckout | ResolutionFailure;
type LocalCodeTargetResult = LocalCodeTarget | ResolutionFailure;
interface ResolverDependencies {
	readRegistry(): RegisteredRepo[];
	realpath(candidate: string): string;
	stat(candidate: string): Pick<Stats, "isDirectory" | "isFile">;
	repoRoot(candidate: string): string | undefined;
	repoIdentity(candidate: string): string;
}
type PathContainment = Pick<typeof path, "relative" | "isAbsolute" | "sep">;

/**
 * Decides whether a path lies at or below a root without leaving it through
 * `..` segments. Both paths must already be lexically or canonically resolved.
 * @param root - The containing directory.
 * @param candidate - The path to test.
 * @param paths - The path flavour to test with; the platform's by default.
 * @returns True when the candidate is the root or inside it.
 */
function isPathWithin(root: string, candidate: string, paths: PathContainment = path): boolean {
	const relative = paths.relative(root, candidate);
	return (
		!paths.isAbsolute(relative) &&
		(relative === "" || (!relative.startsWith(`..${paths.sep}`) && relative !== ".."))
	);
}
/**
 * Builds one resolution failure.
 * @param code - The failure code the caller can act on.
 * @param error - The operator-facing explanation.
 * @returns The failure result.
 */
function failure(code: ResolutionFailureCode, error: string): ResolutionFailure {
	return { ok: false, code, error };
}
/**
 * Canonicalises a registered root and confirms it is still a directory.
 * @param repository - The registered repository name, for the failure message.
 * @param registeredRoot - The root as it was registered.
 * @param dependencies - The filesystem view to resolve with.
 * @returns The canonical root, or the reason the checkout is unavailable.
 */
function canonicalRegisteredRoot(
	repository: string,
	registeredRoot: string,
	dependencies: ResolverDependencies,
): string | ResolutionFailure {
	try {
		const root = dependencies.realpath(registeredRoot);
		if (!dependencies.stat(root).isDirectory()) {
			throw new Error("not a directory");
		}
		return root;
	} catch {
		return failure(
			"CHECKOUT_UNAVAILABLE",
			`The registered checkout for ${repository} is unavailable.`,
		);
	}
}
/**
 * Confirms that the Git root discovered from a canonical registered root is
 * that same directory, so a registration inside a larger checkout is refused.
 * @param repository - The registered repository name, for the failure messages.
 * @param root - The canonical registered root.
 * @param dependencies - The filesystem view to resolve with.
 * @returns Null when the roots agree, otherwise the reason they do not.
 */
function gitRootMismatch(
	repository: string,
	root: string,
	dependencies: ResolverDependencies,
): ResolutionFailure | null {
	const discoveredRoot = dependencies.repoRoot(root);
	if (!discoveredRoot) {
		return failure("CHECKOUT_UNAVAILABLE", `${root} is no longer a Git checkout.`);
	}
	let canonicalDiscoveredRoot: string;
	try {
		canonicalDiscoveredRoot = dependencies.realpath(discoveredRoot);
	} catch {
		return failure("CHECKOUT_UNAVAILABLE", `The Git root for ${repository} is unavailable.`);
	}
	if (canonicalDiscoveredRoot !== root) {
		return failure(
			"CHECKOUT_UNAVAILABLE",
			`The registered root for ${repository} no longer names the checkout root.`,
		);
	}
	return null;
}
/**
 * Resolves a registered repository to its canonical checkout root, refusing a
 * registration whose directory, Git root or identity no longer match.
 * @param repository - The registered repository name.
 * @param entries - The registry entries to search.
 * @param dependencies - The filesystem view to resolve with.
 * @returns The checkout, or the reason it is unavailable.
 */
function resolveCheckout(
	repository: string,
	entries: readonly RegisteredRepo[],
	dependencies: ResolverDependencies,
): RegisteredCheckoutResult {
	const entry = entries.find((candidate) => candidate.repo === repository);
	if (!entry) {
		return failure(
			"CHECKOUT_UNAVAILABLE",
			`No registered checkout exists for ${repository}. Add it with archboard repo add <dir>.`,
		);
	}
	const root = canonicalRegisteredRoot(repository, entry.root, dependencies);
	if (typeof root !== "string") {
		return root;
	}
	const mismatch = gitRootMismatch(repository, root, dependencies);
	if (mismatch !== null) {
		return mismatch;
	}
	if (dependencies.repoIdentity(root) !== repository) {
		return failure(
			"CHECKOUT_IDENTITY_CHANGED",
			`The checkout at ${root} no longer identifies as ${repository}. Re-register the checkout.`,
		);
	}
	return { ok: true, repository, root };
}
/**
 * Tests absoluteness under both path flavours, because a binding written on
 * another platform must not be resolved relative to a checkout here.
 * @param value - The binding path.
 * @returns True when either platform would treat the path as absolute.
 */
function isAbsoluteOnAnyPlatform(value: string): boolean {
	return path.posix.isAbsolute(value) || path.win32.isAbsolute(value);
}
/**
 * Canonicalises a lexical target and reads its kind in one step, so an
 * unreadable target fails uniformly.
 * @param lexicalTarget - The target as resolved against the checkout root.
 * @param dependencies - The filesystem view to resolve with.
 * @returns The canonical target with its stat result, or the failure.
 */
function locateTarget(
	lexicalTarget: string,
	dependencies: ResolverDependencies,
):
	| { readonly target: string; readonly stats: ReturnType<ResolverDependencies["stat"]> }
	| ResolutionFailure {
	try {
		const target = dependencies.realpath(lexicalTarget);
		return { target, stats: dependencies.stat(target) };
	} catch {
		return failure(
			"TARGET_UNAVAILABLE",
			"The bound file or directory does not exist on this machine.",
		);
	}
}
/**
 * Resolves a binding's path inside its checkout, refusing anything that is
 * absolute, escapes the checkout lexically or through links, or is neither a
 * file nor a directory.
 * @param binding - The validated binding.
 * @param checkout - The resolved checkout, or its failure to pass through.
 * @param dependencies - The filesystem view to resolve with.
 * @returns The local target, or the reason it is unavailable.
 */
function resolveTarget(
	binding: CodeBinding,
	checkout: RegisteredCheckoutResult,
	dependencies: ResolverDependencies,
): LocalCodeTargetResult {
	if (!checkout.ok) {
		return checkout;
	}
	if (isAbsoluteOnAnyPlatform(binding.path)) {
		return failure("TARGET_OUTSIDE_CHECKOUT", "A code binding path must be repository-relative.");
	}
	const lexicalTarget = path.resolve(checkout.root, binding.path);
	if (!isPathWithin(checkout.root, lexicalTarget)) {
		return failure("TARGET_OUTSIDE_CHECKOUT", "The code binding leaves its registered checkout.");
	}
	const located = locateTarget(lexicalTarget, dependencies);
	if ("ok" in located) {
		return located;
	}
	if (!isPathWithin(checkout.root, located.target)) {
		return failure("TARGET_OUTSIDE_CHECKOUT", "The bound target resolves outside its checkout.");
	}
	return localTargetOf(binding, checkout, located.target, located.stats);
}
/**
 * Builds the local target once its location is known, classifying it by kind.
 * @param binding - The validated binding.
 * @param checkout - The resolved checkout.
 * @param target - The canonical target path.
 * @param stats - The target's stat result.
 * @returns The local target, or a failure for a target of another kind.
 */
function localTargetOf(
	binding: CodeBinding,
	checkout: RegisteredCheckout,
	target: string,
	stats: ReturnType<ResolverDependencies["stat"]>,
): LocalCodeTargetResult {
	if (!stats.isFile() && !stats.isDirectory()) {
		return failure("TARGET_UNAVAILABLE", "The bound target is neither a file nor a directory.");
	}
	return { ...checkout, target, path: binding.path, kind: stats.isFile() ? "file" : "directory" };
}
/**
 * Resolves one registered checkout through the supplied dependencies.
 * @param repository - The registered repository name.
 * @param dependencies - The filesystem view to resolve with.
 * @returns The checkout, or the reason it is unavailable.
 */
function resolveRegisteredCheckoutWith(
	repository: string,
	dependencies: ResolverDependencies,
): RegisteredCheckoutResult {
	return resolveCheckout(repository, dependencies.readRegistry(), dependencies);
}
/**
 * Resolves many bindings through the supplied dependencies, resolving each
 * checkout once and reusing it for every binding that names it.
 * @param bindings - The bindings to resolve.
 * @param dependencies - The filesystem view to resolve with.
 * @returns A local target or failure for each binding, in order.
 */
function resolveLocalCodeTargetsWith(
	bindings: readonly CodeBinding[],
	dependencies: ResolverDependencies,
): LocalCodeTargetResult[] {
	const entries = dependencies.readRegistry();
	const checkouts = new Map<string, RegisteredCheckoutResult>();
	return bindings.map((binding) => {
		const parsed = CodeBindingSchema.safeParse(binding);
		if (!parsed.success) {
			return failure("BINDING_UNAVAILABLE", "The element has no complete code binding.");
		}
		let checkout = checkouts.get(parsed.data.repo);
		if (!checkout) {
			checkout = resolveCheckout(parsed.data.repo, entries, dependencies);
			checkouts.set(parsed.data.repo, checkout);
		}
		return resolveTarget(parsed.data, checkout, dependencies);
	});
}

export {
	type ResolutionFailure,
	type RegisteredCheckout,
	type LocalCodeTarget,
	type RegisteredCheckoutResult,
	type LocalCodeTargetResult,
	type ResolverDependencies,
	isPathWithin,
	resolveRegisteredCheckoutWith,
	resolveLocalCodeTargetsWith,
};
