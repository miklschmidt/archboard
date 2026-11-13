// Which other changed parts each changed part holds (TASK-622). A part bound to a directory, or to
// a .csproj project, changes with every part bound inside it. When the parts inside bind each file
// that it changed, its own change says nothing that theirs does not, and `model footprint
// --fail-outside` and the pull-request Action judge the parts inside instead. When it changed a
// file that only it binds, it changed in its own right and holds nothing. Pure.

import { bindingPathOf, filesOfBinding } from "@archboard/code-binding/bindings";
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

/** A changed part, with the files that the range changed, under each name. */
type ChangedPart = FootprintPart & { readonly files: readonly string[] };

/**
 * The other changed parts that a part holds, when they bind each file that it changed in its own
 * binding.
 * @param outer The part.
 * @param changed Every changed part.
 * @returns The ids of the parts it holds, or none when it changed a file that only it binds.
 */
function heldBy(outer: ChangedPart, changed: readonly ChangedPart[]): string[] {
	const inner = changed.filter((part) => part !== outer && holds(outer, part));
	const scope = scopeOf(outer.path);
	if (inner.length === 0 || scope === undefined) return [];
	const scopes = inner.flatMap((part) => scopeOf(part.path) ?? []);
	const own = filesOfBinding(scope, outer.files).filter((file) =>
		scopes.every((one) => filesOfBinding(one, [file]).length === 0),
	);
	return own.length > 0 ? [] : inner.map((part) => part.subject.id);
}

/**
 * The changed parts, each with the other changed parts that it holds.
 * @param changed Every changed part, in any repository, with its changed files.
 * @returns The parts in the same order, each with the ids of those it holds.
 */
function withHeld(changed: readonly ChangedPart[]): FootprintPart[] {
	return changed.map((one) => {
		const { files: _files, ...part } = one;
		return { ...part, holds: heldBy(one, changed) };
	});
}

export { withHeld, type ChangedPart };
