import type { Model, ModelFlow, VariantContent } from "@archboard/model/content";
import {
	reachOf,
	relevantFlows,
	touchesScope,
	withCollectionFlows,
} from "#ui/rules/architecture-model/flow-reading.ts";

type Walkthrough = Model["walkthroughs"][number];

/** What the right panel lists beside what it explains. */
interface ReadingContext {
	readonly flows: readonly ModelFlow[];
	readonly walkthroughs: readonly Walkthrough[];
}

/** What the roots list: every flow touches them, and the left column already holds them all. */
const NO_CONTEXT: ReadingContext = { flows: [], walkthroughs: [] };

/**
 * The subjects of an open scope.
 * @param scope The open module, or null at the roots, which name no subject.
 * @returns The subjects.
 */
function scopeSubjects(scope: string | null): ReadonlySet<string> {
	return new Set(scope === null ? [] : [scope]);
}

/**
 * The walkthroughs that concern some subjects: those with a step that opens one of them or a
 * part of one, or that names a subject inside one.
 * @param model The modules and walkthroughs.
 * @param subjects The subjects, or none for the whole model, which every walkthrough concerns.
 * @returns The walkthroughs, in authored order.
 */
function walkthroughsAbout(
	model: Pick<Model, "modules" | "walkthroughs">,
	subjects: ReadonlySet<string>,
): readonly Walkthrough[] {
	if (subjects.size === 0) return model.walkthroughs;
	const parents = new Map(model.modules.map((module) => [module.id, module.parent]));
	return model.walkthroughs.filter((walkthrough) =>
		walkthrough.beats.some(({ reading }) =>
			[reading.scope, ...reading.focus, ...reading.selection].some(
				(id) => id !== undefined && touchesScope(id, parents, subjects),
			),
		),
	);
}

/**
 * The flows and the walkthroughs that touch what a reader looks at: what they selected, or else
 * the open module.
 * @param model The modules and walkthroughs.
 * @param content The complete depicted architecture.
 * @param scope The open module, or null at the roots.
 * @param selected The selected subjects.
 * @returns What touches them, in authored order.
 */
function contextOf(
	model: Model,
	content: VariantContent,
	scope: string | null,
	selected: ReadonlySet<string>,
): ReadingContext {
	const subjects = selected.size > 0 ? withCollectionFlows(model, selected) : scopeSubjects(scope);
	if (subjects.size === 0) return NO_CONTEXT;
	return {
		flows: relevantFlows(content, subjects),
		walkthroughs: walkthroughsAbout(model, reachOf(content, subjects)),
	};
}

export { contextOf, scopeSubjects, walkthroughsAbout };
