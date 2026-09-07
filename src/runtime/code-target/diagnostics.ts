import type { CodeBinding } from "@/shared/code-target";
import {
	resolveLocalCodeTargetsWith,
	type LocalCodeTargetResult,
	type ResolverDependencies,
} from "@/runtime/code-target/lib/resolver-core";
export type ResolverDiagnostics = ResolverDependencies;
/**
 * Runs the resolver against caller-supplied dependencies instead of a
 * snapshot, so tests and tooling can probe resolution with fake filesystems.
 * @param bindings - The bindings to resolve.
 * @param diagnostics - The dependency fakes to resolve with.
 * @returns A local target or failure for each binding.
 */
export function resolveLocalCodeTargetsForDiagnostics(
	bindings: readonly CodeBinding[],
	diagnostics: ResolverDiagnostics,
): LocalCodeTargetResult[] {
	return resolveLocalCodeTargetsWith(bindings, diagnostics);
}
