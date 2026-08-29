import type { Stats } from "node:fs";
import path from "node:path";

import {
	CodeBindingSchema,
	type CodeBinding,
	type CodeTargetFailureCode,
} from "../../../shared/code-target/index.js";
import type { RegisteredRepo } from "../../engine/repo-registry.js";

type ResolutionFailureCode = Extract<
	CodeTargetFailureCode,
	| "BINDING_UNAVAILABLE"
	| "CHECKOUT_UNAVAILABLE"
	| "CHECKOUT_IDENTITY_CHANGED"
	| "TARGET_UNAVAILABLE"
	| "TARGET_OUTSIDE_CHECKOUT"
>;
export interface ResolutionFailure {
	ok: false;
	code: ResolutionFailureCode;
	error: string;
}
export interface RegisteredCheckout {
	ok: true;
	repository: string;
	root: string;
}
export interface LocalCodeTarget extends RegisteredCheckout {
	target: string;
	path: string;
	kind: "file" | "directory";
}
export type RegisteredCheckoutResult = RegisteredCheckout | ResolutionFailure;
export type LocalCodeTargetResult = LocalCodeTarget | ResolutionFailure;
export interface ResolverDependencies {
	readRegistry(): RegisteredRepo[];
	realpath(candidate: string): string;
	stat(candidate: string): Pick<Stats, "isDirectory" | "isFile">;
	repoRoot(candidate: string): string | undefined;
	repoIdentity(candidate: string): string;
}
type PathContainment = Pick<typeof path, "relative" | "isAbsolute" | "sep">;

export function isPathWithin(
	root: string,
	candidate: string,
	paths: PathContainment = path,
): boolean {
	const relative = paths.relative(root, candidate);
	return (
		!paths.isAbsolute(relative) &&
		(relative === "" || (!relative.startsWith(`..${paths.sep}`) && relative !== ".."))
	);
}
function failure(code: ResolutionFailureCode, error: string): ResolutionFailure {
	return { ok: false, code, error };
}
function resolveCheckout(
	repository: string,
	entries: readonly RegisteredRepo[],
	dependencies: ResolverDependencies,
): RegisteredCheckoutResult {
	const entry = entries.find((candidate) => candidate.repo === repository);
	if (!entry)
		return failure(
			"CHECKOUT_UNAVAILABLE",
			`No registered checkout exists for ${repository}. Add it with archboard repo add <dir>.`,
		);
	let root: string;
	try {
		root = dependencies.realpath(entry.root);
		if (!dependencies.stat(root).isDirectory()) throw new Error("not a directory");
	} catch {
		return failure(
			"CHECKOUT_UNAVAILABLE",
			`The registered checkout for ${repository} is unavailable.`,
		);
	}
	const discoveredRoot = dependencies.repoRoot(root);
	if (!discoveredRoot)
		return failure("CHECKOUT_UNAVAILABLE", `${root} is no longer a Git checkout.`);
	let canonicalDiscoveredRoot: string;
	try {
		canonicalDiscoveredRoot = dependencies.realpath(discoveredRoot);
	} catch {
		return failure("CHECKOUT_UNAVAILABLE", `The Git root for ${repository} is unavailable.`);
	}
	if (canonicalDiscoveredRoot !== root)
		return failure(
			"CHECKOUT_UNAVAILABLE",
			`The registered root for ${repository} no longer names the checkout root.`,
		);
	if (dependencies.repoIdentity(root) !== repository)
		return failure(
			"CHECKOUT_IDENTITY_CHANGED",
			`The checkout at ${root} no longer identifies as ${repository}. Re-register the checkout.`,
		);
	return { ok: true, repository, root };
}
function isAbsoluteOnAnyPlatform(value: string): boolean {
	return path.posix.isAbsolute(value) || path.win32.isAbsolute(value);
}
function resolveTarget(
	binding: CodeBinding,
	checkout: RegisteredCheckoutResult,
	dependencies: ResolverDependencies,
): LocalCodeTargetResult {
	if (!checkout.ok) return checkout;
	if (isAbsoluteOnAnyPlatform(binding.path))
		return failure("TARGET_OUTSIDE_CHECKOUT", "A code binding path must be repository-relative.");
	const lexicalTarget = path.resolve(checkout.root, binding.path);
	if (!isPathWithin(checkout.root, lexicalTarget))
		return failure("TARGET_OUTSIDE_CHECKOUT", "The code binding leaves its registered checkout.");
	let target: string;
	let stats: ReturnType<ResolverDependencies["stat"]>;
	try {
		target = dependencies.realpath(lexicalTarget);
		stats = dependencies.stat(target);
	} catch {
		return failure(
			"TARGET_UNAVAILABLE",
			"The bound file or directory does not exist on this machine.",
		);
	}
	if (!isPathWithin(checkout.root, target))
		return failure("TARGET_OUTSIDE_CHECKOUT", "The bound target resolves outside its checkout.");
	if (!stats.isFile() && !stats.isDirectory())
		return failure("TARGET_UNAVAILABLE", "The bound target is neither a file nor a directory.");
	return { ...checkout, target, path: binding.path, kind: stats.isFile() ? "file" : "directory" };
}
export function resolveRegisteredCheckoutWith(
	repository: string,
	dependencies: ResolverDependencies,
): RegisteredCheckoutResult {
	return resolveCheckout(repository, dependencies.readRegistry(), dependencies);
}
export function resolveLocalCodeTargetsWith(
	bindings: readonly CodeBinding[],
	dependencies: ResolverDependencies,
): LocalCodeTargetResult[] {
	const entries = dependencies.readRegistry();
	const checkouts = new Map<string, RegisteredCheckoutResult>();
	return bindings.map((binding) => {
		const parsed = CodeBindingSchema.safeParse(binding);
		if (!parsed.success)
			return failure("BINDING_UNAVAILABLE", "The element has no complete code binding.");
		let checkout = checkouts.get(parsed.data.repo);
		if (!checkout) {
			checkout = resolveCheckout(parsed.data.repo, entries, dependencies);
			checkouts.set(parsed.data.repo, checkout);
		}
		return resolveTarget(parsed.data, checkout, dependencies);
	});
}
