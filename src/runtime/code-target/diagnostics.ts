import fs from "node:fs";
import type { CodeBinding } from "../../shared/code-target/index.js";
import { repoIdentityAt, repoRootOf } from "../engine/git.js";
import { readRegistry } from "../engine/repo-registry.js";
import {
	resolveLocalCodeTargetsWith,
	type LocalCodeTargetResult,
	type ResolverDependencies,
} from "./lib/resolver-core.js";
export type ResolverDiagnostics = ResolverDependencies;
const defaults: ResolverDiagnostics = {
	readRegistry,
	realpath: fs.realpathSync.native,
	stat: fs.statSync,
	repoRoot: repoRootOf,
	repoIdentity: repoIdentityAt,
};
export function resolveLocalCodeTargetsForDiagnostics(
	bindings: readonly CodeBinding[],
	diagnostics: ResolverDiagnostics = defaults,
): LocalCodeTargetResult[] {
	return resolveLocalCodeTargetsWith(bindings, diagnostics);
}
