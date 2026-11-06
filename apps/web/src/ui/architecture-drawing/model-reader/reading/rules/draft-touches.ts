import type { Model } from "@archboard/model/content";

type Draft = Model["proposals"][number];

/** How many modules a draft names before it counts the rest. */
const NAMED = 2;

/**
 * The name of each module the proposals can touch, with the ones they add.
 * @param model The catalogue.
 * @returns The names by identity.
 */
function moduleNames(model: Model): ReadonlyMap<string, string> {
	const names = new Map(model.modules.map(({ id, name }) => [id, name]));
	for (const change of model.proposals.flatMap((draft) => draft.changes)) {
		if (change.type !== "add" || change.kind !== "module") continue;
		const { name } = change.value;
		if (typeof name === "string") names.set(change.subject, name);
	}
	return names;
}

/**
 * What a draft changes, in the words a person reads.
 * @param draft The draft.
 * @param names The name of each module.
 * @returns The modules it touches, or how many changes it holds when it touches none by name.
 */
function touchWords(draft: Draft, names: ReadonlyMap<string, string>): string {
	const touched = [...new Set(draft.changes.flatMap(({ subject }) => names.get(subject) ?? []))];
	if (touched.length === 0)
		return `${draft.changes.length} ${draft.changes.length === 1 ? "change" : "changes"}`;
	const more = touched.length - NAMED;
	return `Touches ${touched.slice(0, NAMED).join(", ")}${more > 0 ? ` +${more}` : ""}`;
}

/**
 * What tells a draft from the drafts that share its name. A name does not establish identity, so
 * two drafts can share one, and an identity means nothing to a reader.
 * @param model The catalogue.
 * @returns The words for each draft that shares its name.
 */
function sharedNameTouches(model: Model): ReadonlyMap<string, string> {
	const names = moduleNames(model);
	const called = model.proposals.map(({ name }) => name);
	const shared = new Set(called.filter((name, at) => called.indexOf(name) !== at));
	return new Map(
		model.proposals
			.filter(({ name }) => shared.has(name))
			.map((draft) => [draft.id, touchWords(draft, names)]),
	);
}

export { sharedNameTouches };
