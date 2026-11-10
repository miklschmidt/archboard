// Which other changed parts each changed part holds (TASK-622). A part bound to a directory, or to
// a .csproj project, changes with every part bound inside it, so its own change says nothing that
// theirs does not. `model footprint --fail-outside` and the pull-request Action judge the part
// inside instead. Pure.

import { bindingPathOf } from "@archboard/code-binding/bindings";
import { normalizeBoundPath } from "#runtime/history-lens/operations/commits.ts";
import type { FootprintPart } from "#shared/protocol/footprint.ts";

/**
 * The scope of a binding: its path in one spelling, or a project file's directory.
 * @param path The binding path as the footprint lists it.
 * @returns The scope, or undefined when the path leaves the repository.
 */
function scopeOf(path: string): string | undefined {
	const normalized = normalizeBoundPath(path);
	return normalized === undefined ? undefined : bindingPathOf(normalized);
}

/**
 * Whether one binding's scope holds another binding strictly below it.
 * @param outer The part that may be bound to a directory.
 * @param inner The other part.
 * @returns True when `inner` is below `outer`'s scope in the same repository.
 */
function holds(outer: FootprintPart, inner: FootprintPart): boolean {
	const scope = scopeOf(outer.path);
	const path = scopeOf(inner.path);
	if (outer.repo !== inner.repo || scope === undefined || path === undefined) return false;
	return path !== scope && (scope === "" || path.startsWith(`${scope}/`));
}

/**
 * The changed parts, each with the other changed parts that it holds.
 * @param changed Every changed part, in any repository.
 * @returns The parts in the same order, each with the ids of those it holds.
 */
function withHeld(changed: readonly FootprintPart[]): FootprintPart[] {
	return changed.map((part) => ({
		...part,
		holds: changed
			.filter((other) => other !== part && holds(part, other))
			.map((other) => other.subject.id),
	}));
}

export { withHeld };
