import fs from "node:fs";
import type { CodeBinding } from "../../shared/code-target/index.js";
import { repoIdentityAt, repoRootOf } from "../engine/git.js";
import { readRegistry } from "../engine/repo-registry.js";
import {
	isPathWithin,
	resolveLocalCodeTargetsWith,
	resolveRegisteredCheckoutWith,
	type LocalCodeTargetResult,
	type RegisteredCheckoutResult,
} from "./lib/resolver-core.js";
export type {
	LocalCodeTarget,
	LocalCodeTargetResult,
	RegisteredCheckout,
	RegisteredCheckoutResult,
	ResolutionFailure,
} from "./lib/resolver-core.js";
export { isPathWithin };
const dependencies = {
	readRegistry,
	realpath: fs.realpathSync.native,
	stat: fs.statSync,
	repoRoot: repoRootOf,
	repoIdentity: repoIdentityAt,
};
export function resolveRegisteredCheckout(repository: string): RegisteredCheckoutResult {
	return resolveRegisteredCheckoutWith(repository, dependencies);
}
export function resolveLocalCodeTargets(bindings: readonly CodeBinding[]): LocalCodeTargetResult[] {
	return resolveLocalCodeTargetsWith(bindings, dependencies);
}
export function resolveLocalCodeTarget(binding: CodeBinding): LocalCodeTargetResult {
	return resolveLocalCodeTargets([binding])[0]!;
}
