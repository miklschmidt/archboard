import type { CodeBinding } from "../../shared/code-target/index.js";
import {
	resolveLocalCodeTargetsWith,
	type LocalCodeTargetResult,
	type ResolverDependencies,
} from "./lib/resolver-core.js";
export type ResolverDiagnostics = ResolverDependencies;
export function resolveLocalCodeTargetsForDiagnostics(
	bindings: readonly CodeBinding[],
	diagnostics: ResolverDiagnostics,
): LocalCodeTargetResult[] {
	return resolveLocalCodeTargetsWith(bindings, diagnostics);
}
