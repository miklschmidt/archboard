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
type ModuleLookup = (
	raw: string,
) =>
	| { readonly ok: true; readonly id: string }
	| { readonly ok: false; readonly error: { readonly code: string; readonly error: string } };

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
	| { readonly ok: false; readonly error: { readonly code: string; readonly error: string } } {
	if (grammar === "architecture") {
		return {
			ok: false,
			error: {
				code: "FLOW_GRAMMAR_REQUIRED",
				error: "Temporary flows require --grammar flowchart or --grammar sequence.",
			},
		};
	}
	const effectiveGrammar: "flowchart" | "sequence" = grammar ?? "flowchart";
	const prefix = model.manifest.id === "eph" ? "tmp" : "eph";
	const lookup = new Map<string, string>();
	const participantIds: string[] = [];
	const syntheticParticipants: Array<{ id: string; name: string }> = [];
	let syntheticCounter = 0;

	for (const raw of input.participants) {
		const trimmed = raw.trim();
		const matched = resolveModule(trimmed);
		// A name several modules share is a refusal, never a made-up actor in their place.
		if (!matched.ok && matched.error.code === "MODULE_AMBIGUOUS") return matched;
		const declared = lookup.get(trimmed) ?? lookup.get(trimmed.toLowerCase());
		let id: string;
		if (matched.ok) {
			id = matched.id;
			const mod = model.modules.find((entry) => entry.id === id);
			lookup.set(id, id);
			if (mod !== undefined) {
				lookup.set(mod.name, id);
				lookup.set(mod.name.toLowerCase(), id);
			}
		} else if (declared !== undefined) {
			id = declared;
		} else {
			syntheticCounter += 1;
			id = `${prefix}#p${syntheticCounter}`;
			syntheticParticipants.push({ id, name: trimmed });
		}
		lookup.set(trimmed, id);
		lookup.set(trimmed.toLowerCase(), id);
		if (!participantIds.includes(id)) participantIds.push(id);
	}

	let stepCounter = 0;
	/**
	 * Resolve a step endpoint against the declared participants of this temporary flow.
	 * @param raw The raw participant name or id.
	 * @returns The resolved qualified id, or undefined if not declared.
	 */
	function resolveEndpoint(raw: string): string | undefined {
		const trimmed = raw.trim();
		const direct = lookup.get(trimmed) ?? lookup.get(trimmed.toLowerCase());
		if (direct !== undefined) return direct;
		const matched = resolveModule(trimmed);
		return matched.ok && participantIds.includes(matched.id) ? matched.id : undefined;
	}

	/**
	 * Assign deterministic transient ids and resolve endpoints across nested steps.
	 * @param steps The raw input steps.
	 * @returns The resolved steps or a refusal.
	 */
	function mapSteps(
		steps: readonly InputStep[],
	):
		| { readonly ok: true; readonly steps: ResolvedStep[] }
		| { readonly ok: false; readonly error: { readonly code: string; readonly error: string } } {
		const out: ResolvedStep[] = [];
		for (const step of steps) {
			stepCounter += 1;
			const id = `${prefix}#s${stepCounter}`;
			if (step.kind === "decision") {
				const alternatives: Array<{ label: string; steps: ResolvedStep[] }> = [];
				for (const alt of step.alternatives) {
					const mapped = mapSteps(alt.steps);
					if (!mapped.ok) return mapped;
					alternatives.push({ label: alt.label, steps: mapped.steps });
				}
				out.push({ kind: "decision", id, question: step.question, alternatives });
			} else if (step.kind === "loop") {
				const mapped = mapSteps(step.steps);
				if (!mapped.ok) return mapped;
				out.push({ kind: "loop", id, condition: step.condition, steps: mapped.steps });
			} else {
				const fromId = resolveEndpoint(step.from);
				if (fromId === undefined) {
					return {
						ok: false,
						error: {
							code: "INVALID_EPHEMERAL_FLOW",
							error: `Flow step "${step.label}" references unknown participant "${step.from}". Add it to participants.`,
						},
					};
				}
				const toId = resolveEndpoint(step.to);
				if (toId === undefined) {
					return {
						ok: false,
						error: {
							code: "INVALID_EPHEMERAL_FLOW",
							error: `Flow step "${step.label}" references unknown participant "${step.to}". Add it to participants.`,
						},
					};
				}
				out.push({ ...step, id, from: fromId, to: toId });
			}
		}
		return { ok: true, steps: out };
	}

	const mapped = mapSteps(input.steps);
	if (!mapped.ok) return mapped;
	return {
		ok: true,
		grammar: effectiveGrammar,
		resolved: {
			flow: {
				id: ephemeralFlowId(prefix, input.name, participantIds, mapped.steps),
				name: input.name,
				...(input.summary === undefined ? {} : { summary: input.summary }),
				participants: participantIds,
				steps: mapped.steps,
			},
			...(syntheticParticipants.length === 0 ? {} : { syntheticParticipants }),
		},
	};
}

/**
 * Derive a deterministic 8-character block-safe flow id from the temporary flow's content so
 * revised temporary flows get a distinct scene identity without randomness.
 * @param prefix The ephemeral namespace prefix.
 * @param name The flow name.
 * @param participants The resolved participant ids.
 * @param steps The resolved steps.
 * @returns A qualified subject id matching `BLOCK_ID_RE` on both sides of `#`.
 */
function ephemeralFlowId(
	prefix: string,
	name: string,
	participants: readonly string[],
	steps: readonly ResolvedStep[],
): string {
	const raw = JSON.stringify([name, participants, steps]);
	let hash = 2166136261;
	for (let index = 0; index < raw.length; index += 1) {
		hash ^= raw.charCodeAt(index);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return `${prefix}#f${hash.toString(36).slice(0, 7)}`;
}

export { resolveEphemeralFlow };
