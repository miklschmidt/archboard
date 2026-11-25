import type {
	ephemeralFlowInputSchema,
	resolvedEphemeralFlowSchema,
} from "@archboard/model/pane-context";
import type { readArchitectureModel } from "@archboard/model/store-read";
import type { z } from "zod";

type EphemeralFlowInput = z.infer<ReturnType<typeof ephemeralFlowInputSchema>>;
type ResolvedEphemeralFlow = z.infer<ReturnType<typeof resolvedEphemeralFlowSchema>>;
type Model = Extract<Awaited<ReturnType<typeof readArchitectureModel>>, { success: true }>;
type ResolvedStep = ResolvedEphemeralFlow["flow"]["steps"][number];
type InputStep = EphemeralFlowInput["steps"][number];
type EphemeralError = { readonly code: string; readonly error: string };
type ModuleLookup = (
	raw: string,
) =>
	| { readonly ok: true; readonly id: string }
	| { readonly ok: false; readonly error: EphemeralError };

interface ParticipantTable {
	readonly participantIds: string[];
	readonly participantSet: Set<string>;
	readonly syntheticParticipants: Array<{ id: string; name: string }>;
	readonly syntheticLookup: Map<string, string>;
}

interface StepMapperContext {
	readonly prefix: string;
	readonly resolveModule: ModuleLookup;
	readonly table: ParticipantTable;
	stepCounter: number;
}

const MAX_SYNTHETIC_PARTICIPANT_LENGTH = 120;

/**
 * Validate and resolve an unsaved ephemeral flow into transient canonical ids without writing to disk.
 * Participants that match real modules inherit their canonical ids; other actors get transient ids.
 * @param model The complete canonical reading.
 * @param input The flow input matching `NewFlowSchema`.
 * @param grammar The requested diagram grammar, if any.
 * @param resolveModule Module resolver for matching real canonical modules.
 * @returns The resolved temporary flow and effective grammar, or a structured refusal.
 */
function resolveEphemeralFlow(
	model: Model,
	input: EphemeralFlowInput,
	grammar: "architecture" | "flowchart" | "sequence" | undefined,
	resolveModule: ModuleLookup,
):
	| {
			readonly ok: true;
			readonly grammar: "flowchart" | "sequence";
			readonly resolved: ResolvedEphemeralFlow;
	  }
	| { readonly ok: false; readonly error: EphemeralError } {
	if (grammar === "architecture") {
		return {
			ok: false,
			error: {
				code: "FLOW_GRAMMAR_REQUIRED",
				error: "Temporary flows require --grammar flowchart or --grammar sequence.",
			},
		};
	}
	const prefix = model.manifest.id === "eph" ? "tmp" : "eph";
	const table = buildParticipantTable(input.participants, prefix, resolveModule);
	if (!table.ok) return table;
	const context: StepMapperContext = { prefix, resolveModule, table: table.table, stepCounter: 0 };
	const mapped = mapSteps(input.steps, context);
	if (!mapped.ok) return mapped;
	return {
		ok: true,
		grammar: grammar ?? "flowchart",
		resolved: assembleEphemeralFlow(prefix, input, table.table, mapped.steps),
	};
}

/**
 * Assemble the final resolved ephemeral flow payload with a deterministic scene id.
 * @param prefix The ephemeral namespace prefix.
 * @param input The validated flow input.
 * @param table The resolved participant table.
 * @param steps The resolved steps.
 * @returns The resolved ephemeral flow payload.
 */
function assembleEphemeralFlow(
	prefix: string,
	input: EphemeralFlowInput,
	table: ParticipantTable,
	steps: ResolvedStep[],
): ResolvedEphemeralFlow {
	const id = ephemeralFlowId(
		prefix,
		input.name,
		table.participantIds,
		table.syntheticParticipants,
		steps,
	);
	return {
		flow: {
			id,
			name: input.name,
			...(input.summary === undefined ? {} : { summary: input.summary }),
			participants: table.participantIds,
			steps,
		},
		...(table.syntheticParticipants.length === 0
			? {}
			: { syntheticParticipants: table.syntheticParticipants }),
	};
}

/**
 * Register every declared participant against canonical modules or transient external actors.
 * @param participants Raw participant names or module ids.
 * @param prefix The ephemeral namespace prefix.
 * @param resolveModule Module resolver for matching real canonical modules.
 * @returns The participant table, or a refusal on ambiguity or invalid name length.
 */
function buildParticipantTable(
	participants: readonly string[],
	prefix: string,
	resolveModule: ModuleLookup,
):
	| { readonly ok: true; readonly table: ParticipantTable }
	| { readonly ok: false; readonly error: EphemeralError } {
	const table: ParticipantTable = {
		participantIds: [],
		participantSet: new Set(),
		syntheticParticipants: [],
		syntheticLookup: new Map(),
	};
	for (const raw of participants) {
		const added = registerParticipant(raw.trim(), prefix, resolveModule, table);
		if (!added.ok) return added;
	}
	return { ok: true, table };
}

/**
 * Register one declared participant into the table.
 * @param trimmed The trimmed participant name or id.
 * @param prefix The ephemeral namespace prefix.
 * @param resolveModule Module resolver for matching real canonical modules.
 * @param table The participant table being populated.
 * @returns Success or a structured refusal.
 */
function registerParticipant(
	trimmed: string,
	prefix: string,
	resolveModule: ModuleLookup,
	table: ParticipantTable,
): { readonly ok: true } | { readonly ok: false; readonly error: EphemeralError } {
	const matched = resolveModule(trimmed);
	if (matched.ok) {
		addParticipantId(table, matched.id);
		return { ok: true };
	}
	// A name several modules share is a refusal, never a made-up actor in their place.
	if (matched.error.code === "MODULE_AMBIGUOUS") return matched;
	return registerSyntheticParticipant(trimmed, prefix, table);
}

/**
 * Register or deduplicate one synthetic external participant by case-insensitive name.
 * @param trimmed The trimmed participant label.
 * @param prefix The ephemeral namespace prefix.
 * @param table The participant table being populated.
 * @returns Success or a refusal when the name exceeds the resolved contract length.
 */
function registerSyntheticParticipant(
	trimmed: string,
	prefix: string,
	table: ParticipantTable,
): { readonly ok: true } | { readonly ok: false; readonly error: EphemeralError } {
	const existing = findSyntheticId(table.syntheticLookup, trimmed);
	if (existing !== undefined) {
		addParticipantId(table, existing);
		return { ok: true };
	}
	if (trimmed.length > MAX_SYNTHETIC_PARTICIPANT_LENGTH) {
		return {
			ok: false,
			error: {
				code: "INVALID_EPHEMERAL_FLOW",
				error: `Participant name "${trimmed.slice(0, 40)}..." exceeds ${MAX_SYNTHETIC_PARTICIPANT_LENGTH} characters.`,
			},
		};
	}
	const id = `${prefix}#p${table.syntheticParticipants.length + 1}`;
	table.syntheticParticipants.push({ id, name: trimmed });
	table.syntheticLookup.set(trimmed, id);
	table.syntheticLookup.set(trimmed.toLowerCase(), id);
	addParticipantId(table, id);
	return { ok: true };
}

/**
 * Append a participant id once while keeping declaration order.
 * @param table The participant table.
 * @param id The canonical or transient participant id.
 */
function addParticipantId(table: ParticipantTable, id: string): void {
	if (table.participantSet.has(id)) return;
	table.participantSet.add(id);
	table.participantIds.push(id);
}

/**
 * Look up a synthetic participant id by exact name first, then case-insensitively.
 * @param lookup The synthetic alias map.
 * @param trimmed The trimmed name.
 * @returns The transient participant id, or undefined.
 */
function findSyntheticId(lookup: ReadonlyMap<string, string>, trimmed: string): string | undefined {
	return lookup.get(trimmed) ?? lookup.get(trimmed.toLowerCase());
}

/**
 * Resolve one message endpoint: canonical module resolution runs before synthetic aliases so exact
 * module names take precedence and ambiguous module names are refused.
 * @param raw The raw endpoint name or id.
 * @param stepLabel The message label for error reporting.
 * @param context The step mapping context.
 * @returns The resolved participant id, or a structured refusal.
 */
function resolveStepEndpoint(
	raw: string,
	stepLabel: string,
	context: StepMapperContext,
):
	| { readonly ok: true; readonly id: string }
	| { readonly ok: false; readonly error: EphemeralError } {
	const trimmed = raw.trim();
	const matched = context.resolveModule(trimmed);
	if (!matched.ok && matched.error.code === "MODULE_AMBIGUOUS") return matched;
	if (matched.ok && context.table.participantSet.has(matched.id)) {
		return { ok: true, id: matched.id };
	}
	const synthetic = findSyntheticId(context.table.syntheticLookup, trimmed);
	if (synthetic !== undefined) return { ok: true, id: synthetic };
	return {
		ok: false,
		error: {
			code: "INVALID_EPHEMERAL_FLOW",
			error: `Flow step "${stepLabel}" references unknown participant "${raw}". Add it to participants.`,
		},
	};
}

/**
 * Assign deterministic transient ids and resolve endpoints across a list of steps.
 * @param steps The raw input steps.
 * @param context The step mapping context.
 * @returns The resolved steps or a refusal.
 */
function mapSteps(
	steps: readonly InputStep[],
	context: StepMapperContext,
):
	| { readonly ok: true; readonly steps: ResolvedStep[] }
	| { readonly ok: false; readonly error: EphemeralError } {
	const out: ResolvedStep[] = [];
	for (const step of steps) {
		const mapped = mapOneStep(step, context);
		if (!mapped.ok) return mapped;
		out.push(mapped.step);
	}
	return { ok: true, steps: out };
}

/**
 * Resolve one step by kind while preserving traversal order for deterministic ids.
 * @param step The raw input step.
 * @param context The step mapping context.
 * @returns The resolved step or a refusal.
 */
function mapOneStep(
	step: InputStep,
	context: StepMapperContext,
):
	| { readonly ok: true; readonly step: ResolvedStep }
	| { readonly ok: false; readonly error: EphemeralError } {
	context.stepCounter += 1;
	const id = `${context.prefix}#s${context.stepCounter}`;
	if (step.kind === "decision") return mapDecisionStep(id, step, context);
	if (step.kind === "loop") return mapLoopStep(id, step, context);
	return mapMessageStep(id, step, context);
}

/**
 * Map a decision step and every alternative branch in order.
 * @param id The assigned step id.
 * @param step The decision step.
 * @param context The step mapping context.
 * @returns The resolved decision step or a refusal.
 */
function mapDecisionStep(
	id: string,
	step: Extract<InputStep, { readonly kind: "decision" }>,
	context: StepMapperContext,
):
	| { readonly ok: true; readonly step: ResolvedStep }
	| { readonly ok: false; readonly error: EphemeralError } {
	const alternatives: Array<{ label: string; steps: ResolvedStep[] }> = [];
	for (const alt of step.alternatives) {
		const mapped = mapSteps(alt.steps, context);
		if (!mapped.ok) return mapped;
		alternatives.push({ label: alt.label, steps: mapped.steps });
	}
	return { ok: true, step: { kind: "decision", id, question: step.question, alternatives } };
}

/**
 * Map a loop step and its nested steps.
 * @param id The assigned step id.
 * @param step The loop step.
 * @param context The step mapping context.
 * @returns The resolved loop step or a refusal.
 */
function mapLoopStep(
	id: string,
	step: Extract<InputStep, { readonly kind: "loop" }>,
	context: StepMapperContext,
):
	| { readonly ok: true; readonly step: ResolvedStep }
	| { readonly ok: false; readonly error: EphemeralError } {
	const mapped = mapSteps(step.steps, context);
	if (!mapped.ok) return mapped;
	return { ok: true, step: { kind: "loop", id, condition: step.condition, steps: mapped.steps } };
}

/**
 * Map a message step and validate both endpoints against declared participants.
 * @param id The assigned step id.
 * @param step The message step.
 * @param context The step mapping context.
 * @returns The resolved message step or a refusal.
 */
function mapMessageStep(
	id: string,
	step: Exclude<InputStep, { readonly kind: "decision" | "loop" }>,
	context: StepMapperContext,
):
	| { readonly ok: true; readonly step: ResolvedStep }
	| { readonly ok: false; readonly error: EphemeralError } {
	const from = resolveStepEndpoint(step.from, step.label, context);
	if (!from.ok) return from;
	const to = resolveStepEndpoint(step.to, step.label, context);
	if (!to.ok) return to;
	return { ok: true, step: { ...step, id, from: from.id, to: to.id } };
}

/**
 * Derive a deterministic block-safe flow id from the temporary flow's content so revised temporary
 * flows (including renamed synthetic actors) get a distinct scene identity without randomness.
 * @param prefix The ephemeral namespace prefix.
 * @param name The flow name.
 * @param participants The resolved participant ids.
 * @param syntheticParticipants The resolved synthetic actors and their display names.
 * @param steps The resolved steps.
 * @returns A qualified subject id matching `BLOCK_ID_RE` on both sides of `#`.
 */
function ephemeralFlowId(
	prefix: string,
	name: string,
	participants: readonly string[],
	syntheticParticipants: readonly { readonly id: string; readonly name: string }[],
	steps: readonly ResolvedStep[],
): string {
	const raw = JSON.stringify([name, participants, syntheticParticipants, steps]);
	let hash = 2166136261;
	for (let index = 0; index < raw.length; index += 1) {
		hash ^= raw.charCodeAt(index);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return `${prefix}#f${hash.toString(36).slice(0, 7)}`;
}

export { resolveEphemeralFlow };
