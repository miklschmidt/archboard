// The plan of a pull request whose proposal is already adopted at its head, as the archboard-pr
// skill does on the branch. `model footprint` sets the changed modules against a draft only, and
// `model compare` cannot read the state that the adoption replaced in a fresh clone, because that
// state lives only in the archive. Both vaults are checked out, so the action compares the base's
// Current with the adopted state itself, by the rule of ADR 0045: a proposal names each module
// that it adds, removes or changes, and both ends of each relationship or flow step that it adds,
// removes or changes. Pure: the entry reads the two models.

/* oxlint-disable archboard/absolute-imports -- actions/ has no # imports; sibling imports stay relative */
import { describeComparison } from "./plan.ts";
import type { Buckets, FootprintReading } from "./plan.ts";

/** A subject of a model reading, compared as a whole. */
interface Subject {
	readonly id: string;
	readonly [field: string]: unknown;
}

/** A module, as `model read` gives it. */
interface ModuleReading extends Subject {
	readonly name: string;
	readonly binding?: unknown;
}

/** A relationship or a flow step: a subject that joins two modules. */
interface Joint extends Subject {
	readonly from: string;
	readonly to: string;
}

/** A flow step. A message joins two modules. A decision or a loop holds steps. */
interface FlowStep extends Subject {
	readonly from?: string | undefined;
	readonly to?: string | undefined;
	readonly steps?: readonly FlowStep[] | undefined;
	readonly alternatives?:
		| readonly { readonly steps?: readonly FlowStep[] | undefined }[]
		| undefined;
}

/** The part of `model read` that the plan reads. */
interface ModelReading {
	readonly modules?: readonly ModuleReading[] | undefined;
	readonly relationships?: readonly Joint[] | undefined;
	readonly collections?:
		| readonly {
				readonly flows?:
					| readonly { readonly steps?: readonly FlowStep[] | undefined }[]
					| undefined;
		  }[]
		| undefined;
}

/** The subjects of a reading that the plan compares. */
interface Parts {
	readonly modules: readonly ModuleReading[];
	readonly relationships: readonly Joint[];
	readonly steps: readonly Joint[];
}

/** What became of one subject between the two readings. */
type Outcome = "added" | "removed" | "changed";

/** The plan of an adopted proposal. */
interface AdoptedPlan {
	/** What it changes, as phrases such as "modules: 1 changed". */
	readonly comparison: string[];
	/** The names of the modules it names that are bound to code. */
	readonly named: ReadonlySet<string>;
}

/**
 * The module's fields that are its own. Its relationships count as relationships, and its file
 * name says nothing about the architecture.
 * @param module The module.
 * @returns The fields to compare.
 */
function ownFields(module: Subject): unknown {
	const { outgoing: _outgoing, file: _file, ...own } = module;
	return own;
}

/**
 * The subject as a whole.
 * @param subject The subject.
 * @returns The subject.
 */
function whole(subject: Subject): unknown {
	return subject;
}

/**
 * What became of each subject that is not the same in both readings.
 * @param before The subjects at the base.
 * @param after The subjects at the head.
 * @param fields What of a subject to compare.
 * @returns Each subject that was added, removed or changed, with its outcome.
 */
function outcomes<T extends Subject>(
	before: readonly T[],
	after: readonly T[],
	fields: (subject: T) => unknown,
): { subject: T; outcome: Outcome }[] {
	const old = new Map(before.map((subject) => [subject.id, subject]));
	const now = new Set(after.map((subject) => subject.id));
	return [
		...after.flatMap((subject): { subject: T; outcome: Outcome }[] => {
			const previous = old.get(subject.id);
			if (previous === undefined) return [{ subject, outcome: "added" }];
			return JSON.stringify(fields(previous)) === JSON.stringify(fields(subject))
				? []
				: [{ subject, outcome: "changed" }];
		}),
		...before
			.filter((subject) => !now.has(subject.id))
			.map((subject) => ({ subject, outcome: "removed" as const })),
	];
}

/**
 * The step itself, when it is a message between two modules.
 * @param step The step.
 * @returns The message, or nothing for a decision or a loop.
 */
function message(step: FlowStep): Joint[] {
	return step.from === undefined || step.to === undefined
		? []
		: [{ ...step, from: step.from, to: step.to }];
}

/**
 * Every message among the steps, however deep a decision or a loop holds it.
 * @param steps The steps.
 * @returns The messages.
 */
function messages(steps: readonly FlowStep[] | undefined): Joint[] {
	return (steps ?? []).flatMap((step) => [
		...message(step),
		...messages(step.steps),
		...(step.alternatives ?? []).flatMap((alternative) => messages(alternative.steps)),
	]);
}

/**
 * The subjects of a reading that the plan compares.
 * @param model The reading.
 * @returns Its modules, relationships and flow messages.
 */
function partsOf(model: ModelReading): Parts {
	const flows = (model.collections ?? []).flatMap((collection) => collection.flows ?? []);
	return {
		modules: model.modules ?? [],
		relationships: model.relationships ?? [],
		steps: flows.flatMap((flow) => messages(flow.steps)),
	};
}

/**
 * The plan of a proposal that the head adopted: what it changes against the base's Current.
 * @param baseModel The base's Current.
 * @param headModel The adopted state at the head.
 * @returns The comparison phrases and the modules that the plan names.
 */
function adoptedPlan(baseModel: ModelReading, headModel: ModelReading): AdoptedPlan {
	const base = partsOf(baseModel);
	const head = partsOf(headModel);
	const modules = outcomes(base.modules, head.modules, ownFields);
	const relationships = outcomes(base.relationships, head.relationships, whole);
	const steps = outcomes(base.steps, head.steps, whole);
	const ids = new Set([
		...modules.map((one) => one.subject.id),
		...[...relationships, ...steps].flatMap((one) => [one.subject.from, one.subject.to]),
	]);
	const bound = new Map(
		[...base.modules, ...head.modules]
			.filter((module) => module.binding !== undefined)
			.map((module) => [module.id, module.name]),
	);
	const subjects = [
		...modules.map((one) => ({ subjectKind: "module", kind: one.outcome })),
		...relationships.map((one) => ({ subjectKind: "relationship", kind: one.outcome })),
		...steps.map((one) => ({ subjectKind: "step", kind: one.outcome })),
	];
	return {
		comparison: describeComparison({ comparison: { subjects } }),
		named: new Set([...ids].flatMap((id) => bound.get(id) ?? [])),
	};
}

/**
 * Set the modules that a footprint changed against the plan of an adopted proposal.
 * @param footprint The answer of `model footprint`, which lists the changed modules only.
 * @param named The modules that the plan names.
 * @returns The three buckets.
 */
function adoptedBuckets(footprint: FootprintReading, named: ReadonlySet<string>): Buckets {
	const changed = [...new Set((footprint.changed ?? []).map((part) => part.subject.name))];
	const unread = new Set((footprint.skipped ?? []).map((part) => part.subject.name));
	return {
		plannedAndChanged: changed.filter((name) => named.has(name)),
		outsidePlan: changed.filter((name) => !named.has(name)),
		plannedUnchanged: [...named].filter((name) => !changed.includes(name) && !unread.has(name)),
		changed,
	};
}

export { adoptedBuckets, adoptedPlan, type AdoptedPlan, type ModelReading };
