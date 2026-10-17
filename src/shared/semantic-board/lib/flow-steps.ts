// A flow's steps as a tree, and the two flat readings of it.
//
// A decision holds its alternatives' steps and a loop holds the steps it
// repeats, so a flow is a tree told in order (ADR 0053). Most readers want only
// the messages, in the order a run would meet them: a code check holds each
// message against its anchor, a step line draws one, a footprint names its
// ends. `messagesOf` is that reading.
//
// Comparison and reconciliation want every step as a subject of its own, with
// where it stands written beside it. `flatSteps` is that reading: every step in
// document order, its own steps cut away and the decision or loop that holds it
// named in `within`. A step that moved into another alternative has moved, and
// comparing `within` is what says so. `nestedSteps` builds the tree back from
// such a list, so a merge or a restore that works on the flat list never has to
// know that the list was a tree.

import type {
	FlowDecision,
	FlowLoop,
	FlowMessage,
	FlowStep,
} from "@/shared/semantic-board/lib/views";

/**
 * Where a step stands inside its flow: the decision or loop that holds it, and,
 * inside a decision, the label of the alternative it runs on.
 */
interface StepPlace {
	readonly step: string;
	readonly alternative?: string;
}

/** A decision as a flat reading holds it: its alternatives by label alone. */
type FlatDecision = Omit<FlowDecision, "alternatives"> & {
	readonly alternatives: readonly string[];
};

/** A loop as a flat reading holds it: its condition, without the steps it repeats. */
type FlatLoop = Omit<FlowLoop, "steps">;

/** One step of a flat reading: the step without its own steps, and where it stands. */
type FlatStep = (FlowMessage | FlatDecision | FlatLoop) & { readonly within?: StepPlace };

/**
 * Whether a step is a message, as opposed to a decision or a loop.
 * @param step The step.
 * @returns True for a message.
 */
function isMessage(step: FlowStep | FlatStep): step is FlowMessage {
	return step.kind !== "decision" && step.kind !== "loop";
}

/**
 * The words a step is known by: a message's label, a decision's question, a
 * loop's condition.
 * @param step The step.
 * @returns Its words.
 */
function stepWords(step: FlowStep | FlatStep): string {
	if (step.kind === "decision") return step.question;
	if (step.kind === "loop") return step.condition;
	return step.label;
}

/**
 * Every step of a tree in document order, each with where it stands: a
 * decision or loop comes before the steps it holds, and a decision's
 * alternatives come in the order it states them.
 * @param steps The steps of a flow, or of one alternative or loop.
 * @param within Where those steps stand; absent at the top of the flow.
 * @yields {{ step: FlowStep; within: StepPlace | undefined }} Each step and its place.
 */
function* placedSteps(
	steps: readonly FlowStep[],
	within?: StepPlace,
): Generator<{ readonly step: FlowStep; readonly within: StepPlace | undefined }> {
	for (const step of steps) {
		yield { step, within };
		if (step.kind === "decision") {
			for (const alternative of step.alternatives) {
				yield* placedSteps(alternative.steps, { step: step.id, alternative: alternative.label });
			}
		} else if (step.kind === "loop") {
			yield* placedSteps(step.steps, { step: step.id });
		}
	}
}

/**
 * Every step of a tree in document order, decisions and loops included.
 * @param steps The steps of a flow.
 * @returns Each step, the ones it holds after it.
 */
function everyStep(steps: readonly FlowStep[]): FlowStep[] {
	return [...placedSteps(steps)].map(({ step }) => step);
}

/**
 * Every message of a tree in document order: the order in which a run that
 * took every alternative once would meet them.
 * @param steps The steps of a flow.
 * @returns The messages.
 */
function messagesOf(steps: readonly FlowStep[]): FlowMessage[] {
	return everyStep(steps).filter(isMessage);
}

/**
 * One step without the steps it holds.
 * @param step The step.
 * @returns The step alone: a decision keeps its alternatives' labels.
 */
function stepAlone(step: FlowStep): FlowMessage | FlatDecision | FlatLoop {
	if (step.kind === "decision") {
		return { ...step, alternatives: step.alternatives.map((alternative) => alternative.label) };
	}
	if (step.kind === "loop") {
		const { steps: _held, ...alone } = step;
		return alone;
	}
	return step;
}

/**
 * The flat reading of a tree: every step alone, in document order, with where
 * it stands.
 * @param steps The steps of a flow.
 * @returns The flat steps.
 */
function flatSteps(steps: readonly FlowStep[]): FlatStep[] {
	return [...placedSteps(steps)].map(({ step, within }) =>
		within === undefined ? stepAlone(step) : { ...stepAlone(step), within },
	);
}

/**
 * The tree a flat reading describes.
 *
 * Each step goes into the decision alternative or loop that its `within`
 * names, in the order the list gives. A step whose holder is not in the list,
 * or names an alternative its decision lacks, stands at the top of the flow:
 * a restored or merged step is still drawn and still compared, rather than
 * dropped because what held it changed.
 * @param flat The flat steps, every holder before what it holds.
 * @returns The steps as a tree.
 */
function nestedSteps(flat: readonly FlatStep[]): FlowStep[] {
	const top: FlowStep[] = [];
	const holders = new Map<string, Map<string | undefined, FlowStep[]>>();
	for (const one of flat) {
		const { within, ...alone } = one;
		const step = treeStep(alone, holders);
		const into = within === undefined ? top : holders.get(within.step)?.get(within.alternative);
		(into ?? top).push(step);
	}
	return top;
}

/**
 * One flat step made a tree step, with the lists that will hold its steps
 * registered under its id.
 * @param alone The step without its place.
 * @param holders Every holder met so far, by id and then by alternative.
 * @returns The tree step, its own steps still to come.
 */
function treeStep(
	alone: FlowMessage | FlatDecision | FlatLoop,
	holders: Map<string, Map<string | undefined, FlowStep[]>>,
): FlowStep {
	if (alone.kind === "decision") {
		const alternatives = alone.alternatives.map((label) => ({ label, steps: [] as FlowStep[] }));
		holders.set(alone.id, new Map(alternatives.map((one) => [one.label, one.steps])));
		return { ...alone, alternatives };
	}
	if (alone.kind === "loop") {
		const steps: FlowStep[] = [];
		holders.set(alone.id, new Map([[undefined, steps]]));
		return { ...alone, steps };
	}
	return alone;
}

/**
 * A flat reading with each new decision or loop put immediately before the
 * first step it holds.
 *
 * A merge places the steps a decision or loop holds by the order the two sides
 * tell them in, and nothing places the holder itself: where it was added it
 * only followed something. Put anywhere else, building the tree pulls its steps
 * up to it and pushes whatever stood between them after it, which is an order
 * nobody wrote. A holder the base already had keeps its place, because where
 * it stands is part of the order the merge decided.
 * @param flat The flat steps, as a merge ordered them.
 * @param placed The steps whose place the merge decided: the base's.
 * @returns The same steps, the new holders moved.
 */
function holdersFirst(flat: readonly FlatStep[], placed: ReadonlySet<string>): FlatStep[] {
	const holderOf = new Map(flat.map((one) => [one.id, one.within?.step]));
	const moving = new Map(
		flat.filter((one) => !isMessage(one) && !placed.has(one.id)).map((one) => [one.id, one]),
	);
	const holding = new Set(flat.flatMap((one) => holdersOf(one.id, holderOf)));
	const out: FlatStep[] = [];
	for (const one of flat) {
		if (!(moving.has(one.id) && holding.has(one.id))) {
			out.push(...unplacedHolders(one.id, { holderOf, moving, out }), one);
		}
	}
	return out;
}

/**
 * Every decision or loop that holds a step, nearest first.
 * @param id The step.
 * @param holderOf What holds each step.
 * @returns Its holders, out to the top of the flow.
 */
function holdersOf(id: string, holderOf: ReadonlyMap<string, string | undefined>): string[] {
	const chain: string[] = [];
	for (let up = holderOf.get(id); up !== undefined && !chain.includes(up); up = holderOf.get(up)) {
		chain.push(up);
	}
	return chain;
}

/**
 * The new holders a step needs in front of it that are not yet placed,
 * outermost first.
 * @param id The step.
 * @param placing What is being placed.
 * @param placing.holderOf What holds each step.
 * @param placing.moving The new holders, by id.
 * @param placing.out The steps placed so far.
 * @returns The holders to place before it.
 */
function unplacedHolders(
	id: string,
	placing: {
		readonly holderOf: ReadonlyMap<string, string | undefined>;
		readonly moving: ReadonlyMap<string, FlatStep>;
		readonly out: readonly FlatStep[];
	},
): FlatStep[] {
	return holdersOf(id, placing.holderOf)
		.toReversed()
		.flatMap((up) => {
			const holder = placing.moving.get(up);
			return holder === undefined || placing.out.includes(holder) ? [] : [holder];
		});
}

/**
 * The first decision or loop in a tree that holds no message any more: a loop
 * with nothing to repeat, or a decision whose every alternative is empty. A
 * merge or a restore can leave one, and no document can hold one.
 * @param steps The steps of a flow.
 * @returns The emptied step, or undefined when every holder still holds a step.
 */
function emptiedHolder(steps: readonly FlowStep[]): FlowDecision | FlowLoop | undefined {
	for (const step of everyStep(steps)) {
		if (step.kind === "loop" && step.steps.length === 0) return step;
		if (step.kind === "decision" && step.alternatives.every((one) => one.steps.length === 0)) {
			return step;
		}
	}
	return undefined;
}

export {
	type StepPlace,
	type FlatStep,
	type FlatDecision,
	type FlatLoop,
	isMessage,
	stepWords,
	placedSteps,
	everyStep,
	messagesOf,
	flatSteps,
	nestedSteps,
	holdersFirst,
	emptiedHolder,
};
