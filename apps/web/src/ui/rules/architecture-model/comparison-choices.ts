// What a reading can be compared with, in the words of the control beside the picture. The address
// keeps its own values: `after` turns a default comparison off, and nothing at all means the
// default. A person reads neither.

import { comparedWith as defaultComparisonReference } from "@archboard/board/comparison";
import type { Model } from "@archboard/board/content";
import { changedCount, reviewsChanges } from "#ui/rules/architecture-model/change-list.ts";
import { AFTER } from "#ui/rules/architecture-model/comparison-intent.ts";
import { sharedNameTouches } from "#ui/rules/architecture-model/draft-touches.ts";
import { checkpointTime } from "#ui/rules/architecture-model/history-time.ts";

type Comparison = NonNullable<Model["comparison"]>;

/** The address of the current state. */
const CURRENT = "current";
/** The choice of a reading's own base, which no state identity can equal. */
const BASE = ":base";

/** One thing that a picture can be compared with. */
interface ComparisonChoice {
	/** What the control calls it, which `comparisonAddress` turns into an address. */
	readonly value: string;
	readonly label: string;
	/** What it says under that. */
	readonly detail?: string | undefined;
}

/** What the control knows of a reading. */
interface ComparisonInputs {
	/** The reading on show. */
	readonly reading: Model;
	/** The comparison that the address names. */
	readonly against: string | null;
	/** The current catalogue, which knows the drafts and whether the model has a Current. */
	readonly catalogue: Model | undefined;
	/** When an exact base was saved, once the retained list has said. */
	readonly savedAt?: string | undefined;
}

/**
 * Whether a reading is Current itself. A saved reading of Current is not: it can differ from it.
 * @param reading The reading.
 * @returns True for the current state on its own.
 */
function readsCurrent(reading: Model): boolean {
	return reading.checkpoint === undefined && reading.selectedState?.lifecycle === "current";
}

/**
 * Whether the runtime gives this reading a retained base by default.
 * @param reading The reading.
 * @param catalogue The current catalogue.
 * @returns True when the default comparison uses a predecessor.
 */
function hasBase(reading: Model, catalogue: Model | undefined): boolean {
	return defaultComparisonReference(reading, catalogue ?? reading)?.reason === "predecessor";
}

/**
 * What tells a compared state from the others.
 * @param state The state, when there is one.
 * @returns Its summary or its name.
 */
function stateWords(state: Comparison["against"] | undefined): string | undefined {
	return state?.summary ?? state?.name;
}

/**
 * The choice of a reading's own base.
 * @param inputs The reading.
 * @returns The choice, which names the base once the reading is compared with it.
 */
function baseChoice(inputs: ComparisonInputs): ComparisonChoice[] {
	const { comparison } = inputs.reading;
	if (!hasBase(inputs.reading, inputs.catalogue)) return [];
	const base = comparison?.reason === "predecessor" ? comparison.against : undefined;
	return [{ value: BASE, label: "Its base", detail: stateWords(base) }];
}

/**
 * The choice of Current, for a reading that is not Current itself.
 * @param inputs The reading.
 * @returns The choice, when there is one.
 */
function currentChoice(inputs: ComparisonInputs): ComparisonChoice[] {
	if (inputs.catalogue?.manifest.current == null || readsCurrent(inputs.reading)) return [];
	return [{ value: CURRENT, label: "Current" }];
}

/**
 * The other drafts, by what they say they do.
 * @param inputs The reading and the catalogue.
 * @returns A choice for each.
 */
function draftChoices(inputs: ComparisonInputs): ComparisonChoice[] {
	const source = inputs.catalogue ?? inputs.reading;
	const touches = sharedNameTouches(source);
	return source.proposals
		.filter(({ id }) => id !== inputs.reading.selectedState?.id)
		.map(({ id, name, summary }) => ({
			value: id,
			label: summary ?? name,
			detail: [summary === undefined ? undefined : name, touches.get(id)]
				.filter(Boolean)
				.join(" · "),
		}));
}

/**
 * The saved reading of an exact base, as its words read.
 * @param savedAt When it was saved, once known.
 * @returns The words.
 */
function savedWords(savedAt: string | undefined): string {
	return savedAt === undefined ? "a saved reading" : `saved ${checkpointTime(savedAt)}`;
}

/** What the control says first, which a narrow pane leaves out so that the base still shows. */
const COMPARED = "Compared with ";

/**
 * What a comparison is with.
 * @param comparison The comparison.
 * @param savedAt When an exact base was saved.
 * @returns Its base, in words.
 */
function baseWords(comparison: Comparison, savedAt: string | undefined): string {
	const { against, checkpoint, reason } = comparison;
	if (reason === "predecessor") return "its base";
	if (against === null) return "the empty planning baseline";
	if (checkpoint !== undefined) return savedWords(savedAt);
	return against.lifecycle === "current" ? "Current" : against.name;
}

/**
 * What the control says: what the picture is compared with.
 * @param inputs The reading on show.
 * @returns The line.
 */
function comparedWith(inputs: ComparisonInputs): string {
	const { comparison } = inputs.reading;
	if (comparison === undefined) return "No comparison";
	const words = `${COMPARED}${baseWords(comparison, inputs.savedAt)}`;
	// The Changes tab counts the changes of a proposal.
	return reviewsChanges(inputs.reading) ? words : `${words} · ${changedCount(comparison)} changed`;
}

/**
 * The choice that the reading stands on.
 * @param inputs The address and the reading.
 * @returns Its value.
 */
function chosenComparison(inputs: ComparisonInputs): string {
	if (inputs.against !== null) return inputs.against;
	const { comparison } = inputs.reading;
	if (comparison === undefined) return AFTER;
	return comparison.reason === "current" ? CURRENT : BASE;
}

/**
 * The choice of a base that came from History or from an address, while it is compared with, so
 * that the control can still say it.
 * @param inputs The reading.
 * @param against The base that the address names.
 * @returns The choice.
 */
function addressedChoice(inputs: ComparisonInputs, against: string): ComparisonChoice {
	const { comparison } = inputs.reading;
	return {
		value: against,
		label: comparison === undefined ? "Another reading" : comparedWith(inputs),
		detail: stateWords(comparison?.against),
	};
}

/**
 * What the control offers.
 * @param inputs The reading.
 * @returns The choices, in order.
 */
function comparisonChoices(inputs: ComparisonInputs): readonly ComparisonChoice[] {
	const { against } = inputs;
	const choices: ComparisonChoice[] = [
		{ value: AFTER, label: "No comparison" },
		...currentChoice(inputs),
		...baseChoice(inputs),
		...draftChoices(inputs),
	];
	if (against === null || choices.some(({ value }) => value === against)) return choices;
	return [...choices, addressedChoice(inputs, against)];
}

/**
 * What the address says for a choice. A reading that compares with nothing by default says
 * nothing, so that turning a comparison off leaves the address as it was.
 * @param value The choice.
 * @param reading The reading.
 * @returns The address field.
 */
function comparisonAddress(value: string, reading: Model): string | null {
	if (value === BASE) return null;
	if (value !== AFTER) return value;
	return reading.selectedState?.lifecycle === "current" ? null : AFTER;
}

export {
	COMPARED,
	chosenComparison,
	comparedWith,
	comparisonAddress,
	comparisonChoices,
	type ComparisonChoice,
};
