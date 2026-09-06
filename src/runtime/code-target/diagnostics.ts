import type { CodeBinding } from "@/shared/code-target";
import {
	resolveLocalCodeTargetsWith,
	type LocalCodeTargetResult,
	type ResolverDependencies,
} from "@/runtime/code-target/lib/resolver-core";
export type ResolverDiagnostics = ResolverDependencies;
/**
 *
 */
export function resolveLocalCodeTargetsForDiagnostics(
	bindings: readonly CodeBinding[],
	diagnostics: ResolverDiagnostics,
): LocalCodeTargetResult[] {
	return resolveLocalCodeTargetsWith(bindings, diagnostics);
}
