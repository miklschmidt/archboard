// Which changed modules `model footprint --fail-outside` fails on. A module bound to a directory
// changes with every module bound inside it, so a container of a changed module would fail every
// gate. The gate judges the module inside instead. Pure.

import { posix } from "node:path";
import { bindingPathOf } from "@archboard/code-binding/bindings";

/** A part as the footprint lists it: where its binding is. */
interface Bound {
	readonly repo: string;
	readonly path: string;
}

/**
 * A binding path in one spelling: `/` between names, no `.` segment, no trailing slash.
 * @param path The binding path as the footprint lists it.
 * @returns The path, or the empty string for the repository root.
 */
function normalized(path: string): string {
	const spelled = posix.normalize(path.replaceAll("\\", "/")).replace(/\/+$/u, "");
	return spelled === "." ? "" : spelled;
}

/**
 * Whether one binding's scope holds another binding strictly below it. A `.csproj` binding's
 * scope is its project directory, as the footprint reads it.
 * @param outer The binding that may be a directory.
 * @param inner The other binding.
 * @returns True when `inner` is below `outer`'s scope in the same repository.
 */
function holds(outer: Bound, inner: Bound): boolean {
	if (outer.repo !== inner.repo) return false;
	const scope = bindingPathOf(normalized(outer.path));
	const path = bindingPathOf(normalized(inner.path));
	if (path === scope) return false;
	return scope === "" || path.startsWith(`${scope}/`);
}

/**
 * The changed modules outside the draft that the gate fails on.
 * @param outside The changed modules that the draft does not name.
 * @param changed Every changed module, named or not.
 * @returns Each module of `outside` whose binding holds no other changed module.
 */
function outsideDraft<P extends Bound>(outside: readonly P[], changed: readonly Bound[]): P[] {
	return outside.filter((part) => !changed.some((other) => other !== part && holds(part, other)));
}

export { outsideDraft };
