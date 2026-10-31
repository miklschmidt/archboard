import { z } from "zod";
import { QualifiedSubjectIdSchema } from "#shared/schemas/primitives.ts";

// What a comparison says about interfaces (ADR 0044): what moved between two
// states, and the measures of each state side by side. Both are derived on every
// read and stored nowhere. Neither sets a comparison status, so nothing here
// carries one, and no field combines the counts or ranks a state.

/** One module named in an interface section: enough to find it in the model. */
const InterfacePartSchema = z.strictObject({
	id: QualifiedSubjectIdSchema,
	name: z.string(),
	kind: z.string(),
});

const InterfacePartsSchema = z.array(InterfacePartSchema);

/** What one container's interface changed between two states. */
const InterfaceChangeSchema = z.strictObject({
	container: InterfacePartSchema,
	/** Whether the module has parts in each state: a new or emptied container is one-sided. */
	holdsParts: z.strictObject({ before: z.boolean(), after: z.boolean() }),
	/** Entry points of the later state that are not parts of the container in the earlier. */
	entryPointsAdded: InterfacePartsSchema,
	/** Entry points of the earlier state that are not parts of the container in the later. */
	entryPointsRemoved: InterfacePartsSchema,
	/** Parts in both states that a relationship from outside reaches only in the later. */
	becameEntryPoints: InterfacePartsSchema,
	/** Parts in both states that a relationship from outside reaches only in the earlier. */
	becameHidden: InterfacePartsSchema,
	/** Modules that call the container in the later state and did not in the earlier. */
	callersGained: InterfacePartsSchema,
	/** Modules that called the container in the earlier state and do not in the later. */
	callersLost: InterfacePartsSchema,
});

/**
 * Every container either state has: those whose interface changed, and those
 * whose did not, so that "no interface changed" is a claim that a reader can read.
 */
const InterfaceChangesSchema = z.strictObject({
	changed: z.array(InterfaceChangeSchema),
	unchanged: InterfacePartsSchema,
});

/** The five interface measures of one container in one state. */
const InterfaceCountsSchema = z.strictObject({
	entryPoints: z.int(),
	hiddenParts: z.int(),
	callers: z.int(),
	outgoing: z.int(),
	passThrough: z.int(),
});

/**
 * One module in one state: its counts with the parts behind two of them, or the
 * fact that it holds no parts there, which is not zero entry points.
 */
const MeasuredOnSchema = z.discriminatedUnion("holdsParts", [
	z.strictObject({ holdsParts: z.literal(false) }),
	z.strictObject({
		holdsParts: z.literal(true),
		measures: InterfaceCountsSchema,
		entryPoints: InterfacePartsSchema,
		/** A question for the reader about each, never a fault. */
		passThrough: InterfacePartsSchema,
	}),
]);

/** One container across the states read, in the order that the answer lists them. */
const MeasuredContainerSchema = z.strictObject({
	container: InterfacePartSchema,
	byState: z.array(MeasuredOnSchema),
});

export {
	InterfaceChangeSchema,
	InterfaceChangesSchema,
	InterfaceCountsSchema,
	MeasuredContainerSchema,
};
