// The plan of a pull request: what its proposal changes against the base's Current, which is also
// what the pictures before and after show. The action compares the two readings itself, because
// the proposal is often adopted on the branch, as the archboard-pr skill does. Then `model
// footprint` has no draft to set the changes against, and a fresh clone cannot read the state
// that the adoption replaced, because that state lives only in the archive. The rule is that of
// ADR 0045: a proposal names each module that it adds, removes or changes, and both ends of each
// relationship or flow step that it adds, removes or changes. Pure: the entry reads the models.

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

/** One changed subject, by its kind and what became of it. */
interface Compared {
	readonly subjectKind: string;
	readonly kind: Outcome;
}

/** The part of a footprint answer that names modules. */
interface FootprintPart {
	readonly subject: { readonly id: string; readonly name: string };
}

/**
 * The part of a footprint answer the action reads. For a draft the CLI sorts the changed modules
 * into named and not named, else it lists them in one list.
 */
interface FootprintReading {
	readonly namedAndChanged?: readonly FootprintPart[] | undefined;
	readonly changedNotNamed?: readonly FootprintPart[] | undefined;
	readonly changed?: readonly FootprintPart[] | undefined;
	/** The parts it could not read, such as a part in a repository this machine has not registered. */
	readonly skipped?: readonly (FootprintPart & { readonly reason?: string })[] | undefined;
}

/** The module names of each bucket. */
interface Buckets {
	readonly plannedAndChanged: readonly string[];
	readonly outsidePlan: readonly string[];
	readonly plannedUnchanged: readonly string[];
	/** Every changed module, which the comment lists when there is no proposal. */
	readonly changed: readonly string[];
	/** Every changed module by stable identity, which a picture can draw close up. */
	readonly changedIds: readonly string[];
}

/** The plan of a proposal. */
interface ProposalPlan {
	/** What it changes, as phrases such as "modules: 1 changed". */
	readonly comparison: string[];
	/** The bound modules it names, by stable identity. Names alone can be ambiguous. */
	readonly named: ReadonlyMap<string, string>;
	/**
	 * Modules bound at the base that the proposal no longer binds, such as a module it removes.
	 * Nothing at the head shows their code, so they are never listed as planned but unchanged.
	 */
	readonly baseOnlyBindings: ReadonlySet<string>;
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
 * Count the subjects of one kind by what became of them.
 * @param subjects The changed subjects of one kind.
 * @returns A phrase such as "2 added, 1 changed".
 */
function tally(subjects: readonly Compared[]): string {
	const kinds = [...new Set(subjects.map((subject) => subject.kind))];
	return kinds
		.map((outcome) => `${String(subjects.filter((one) => one.kind === outcome).length)} ${outcome}`)
		.join(", ");
}

/**
 * Count what a proposal changes: for each kind of subject, how many were added, removed or changed.
 * @param changed The changed subjects.
 * @returns One phrase for each kind of subject that has a change, such as "modules: 2 added, 1 changed".
 */
function describeComparison(changed: readonly Compared[]): string[] {
	return [...new Set(changed.map((subject) => subject.subjectKind))].map(
		(kind) => `${kind}s: ${tally(changed.filter((subject) => subject.subjectKind === kind))}`,
	);
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
 * @returns Each subject that was added, removed or changed, with its outcome, and for a changed
 * subject its version at the base.
 */
function outcomes<T extends Subject>(
	before: readonly T[],
	after: readonly T[],
	fields: (subject: T) => unknown,
): { subject: T; outcome: Outcome; previous?: T }[] {
	const old = new Map(before.map((subject) => [subject.id, subject]));
	const now = new Set(after.map((subject) => subject.id));
	return [
		...after.flatMap((subject): { subject: T; outcome: Outcome; previous?: T }[] => {
			const previous = old.get(subject.id);
			if (previous === undefined) return [{ subject, outcome: "added" }];
			return JSON.stringify(fields(previous)) === JSON.stringify(fields(subject))
				? []
				: [{ subject, outcome: "changed", previous }];
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
 * The plan of a proposal: what it changes against the base's Current.
 * @param baseModel The base's Current.
 * @param headModel The proposal at the head, a draft or adopted on the branch.
 * @returns The comparison phrases and the modules that the plan names.
 */
function proposalPlan(baseModel: ModelReading, headModel: ModelReading): ProposalPlan {
	const base = partsOf(baseModel);
	const head = partsOf(headModel);
	const modules = outcomes(base.modules, head.modules, ownFields);
	const relationships = outcomes(base.relationships, head.relationships, whole);
	const steps = outcomes(base.steps, head.steps, whole);
	const ids = new Set([
		...modules.map((one) => one.subject.id),
		// A changed relationship or step names its ends before and after, so a line that moves from
		// B to C plans the change at B too.
		...[...relationships, ...steps].flatMap((one) => [
			one.subject.from,
			one.subject.to,
			...(one.previous === undefined ? [] : [one.previous.from, one.previous.to]),
		]),
	]);
	const bound = new Map(
		[...base.modules, ...head.modules]
			.filter((module) => module.binding !== undefined)
			.map((module) => [module.id, module.name]),
	);
	const headBindings = new Set(
		head.modules.filter((module) => module.binding !== undefined).map((module) => module.id),
	);
	const changed: Compared[] = [
		...modules.map((one) => ({ subjectKind: "module", kind: one.outcome })),
		...relationships.map((one) => ({ subjectKind: "relationship", kind: one.outcome })),
		...steps.map((one) => ({ subjectKind: "step", kind: one.outcome })),
	];
	return {
		comparison: describeComparison(changed),
		named: new Map([...bound].filter(([id]) => ids.has(id))),
		baseOnlyBindings: new Set(
			base.modules
				.filter((module) => module.binding !== undefined && !headBindings.has(module.id))
				.map((module) => module.id),
		),
	};
}

/**
 * Set the modules that a footprint changed against the plan.
 * @param footprint The answer of `model footprint`. For a draft it sorts the changed modules into
 * named and not named, else it lists them in one list.
 * @param plan The plan.
 * @returns The three buckets.
 */
function planBuckets(footprint: FootprintReading, plan: ProposalPlan): Buckets {
	const { named, baseOnlyBindings } = plan;
	const parts = [
		...(footprint.changed ?? []),
		...(footprint.namedAndChanged ?? []),
		...(footprint.changedNotNamed ?? []),
	];
	const changed = new Map(parts.map((part) => [part.subject.id, part.subject.name]));
	const unread = new Set((footprint.skipped ?? []).map((part) => part.subject.id));
	return {
		plannedAndChanged: [...changed]
			.filter(([id]) => named.has(id))
			.map(([, name]) => name)
			.toSorted(),
		outsidePlan: [...changed]
			.filter(([id]) => !named.has(id))
			.map(([, name]) => name)
			.toSorted(),
		plannedUnchanged: [...named]
			.filter(([id]) => !changed.has(id) && !unread.has(id) && !baseOnlyBindings.has(id))
			.map(([, name]) => name)
			.toSorted(),
		changed: [...changed.values()].toSorted(),
		changedIds: [...changed.keys()].toSorted(),
	};
}

export {
	planBuckets,
	proposalPlan,
	type Buckets,
	type FootprintReading,
	type ModelReading,
	type ProposalPlan,
};
