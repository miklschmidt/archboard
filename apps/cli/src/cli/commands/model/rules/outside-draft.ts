// Which changed modules `model footprint --fail-outside` fails on. A module bound to a directory
// changes with every module bound inside it, so a container of a changed module would fail every
// gate. The gate judges the module inside instead. Pure.

import { posix } from "node:path";

/** A part as the footprint lists it: where its binding is. */
interface Bound {
	readonly repo: string;
	readonly path: string;
}

/**
 * Whether one binding's directory holds another binding.
 * @param outer The binding that may be a directory.
 * @param inner The other binding.
 * @returns True when `inner` is below `outer` in the same repository.
 */
function holds(outer: Bound, inner: Bound): boolean {
	if (outer.repo !== inner.repo) return false;
	const directory = posix.normalize(outer.path.replaceAll("\\", "/")).replace(/\/+$/u, "");
	const path = posix.normalize(inner.path.replaceAll("\\", "/"));
	return directory === "." || path.startsWith(`${directory}/`);
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
