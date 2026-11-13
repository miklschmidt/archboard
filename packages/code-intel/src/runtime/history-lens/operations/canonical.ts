import type { z } from "zod";
import {
	ArchitectureLocalityRequestSchema,
	ArchitectureFootprintRequestSchema,
	ArchitectureSourceRefsRequestSchema,
	type ArchitectureHistoryRequestSchema,
} from "#shared/protocol/canonical-history.ts";
import { readStatesToCheck, type StateToCheck } from "#runtime/code-check/operations/states.ts";
import { readSourceRefs } from "#runtime/history-lens/operations/source-refs.ts";
import { createLocalityEvidence } from "#runtime/history-lens/operations/locality.ts";
import { readFootprintEvidence } from "#runtime/history-lens/operations/footprint.ts";
const locality = createLocalityEvidence();
/**
 * Read canonical change frequency and coupling through the existing Git analysis.
 * @param vault The explicit vault.
 * @param input The selected architecture and source period.
 * @param signal The caller's cancellation signal.
 * @returns Canonical identity and the existing analysis evidence, or a model refusal.
 */
async function readArchitectureLocality(
	vault: string,
	input: z.input<typeof ArchitectureLocalityRequestSchema>,
	signal?: AbortSignal,
) {
	const request = ArchitectureLocalityRequestSchema.parse(input);
	const read = await readStatesToCheck(vault, request.state, request);
	if (!("ok" in read)) return read;
	const reading = read.states[0]!;
	const model = reading.model!;
	const evidence = await locality.read(
		vault,
		JSON.stringify([model.manifest.id, model.revision.digest, model.selectedState?.id]),
		reading.variant,
		request.since === undefined ? undefined : new Date(request.since),
		signal,
	);
	return {
		success: true as const,
		analysis: "locality" as const,
		model: model.manifest.id,
		state: model.selectedState,
		revision: model.revision,
		checkpoint: model.checkpoint?.id,
		...evidence,
	};
}
/**
 * The variants a footprint reads: a proposal and the variant it is read against, or the selected
 * variant alone.
 * @param reading The selected state.
 * @returns The proposal, when the state is one, and the variant it is read against.
 */
function footprintVariants(reading: StateToCheck) {
	const proposal =
		reading.model?.selectedState?.lifecycle === "draft" ? reading.variant : undefined;
	const against =
		proposal === undefined
			? reading.variant
			: reading.document.variants.find((variant) => variant.id === proposal.parent);
	return { proposal, against };
}

/**
 * Read the state that a footprint is set against. A footprint that names a head reads it in the
 * vault as the vault's repository holds that head, the branch reading, so the head's own
 * proposals and bindings decide what its commits are set against. It reads the vault on disk
 * when `modelAt` is `checkout`, when no head is named, when a checkpoint is named, and when the
 * vault's repository does not resolve the head, which only a code repository may hold.
 * @param vault The explicit vault.
 * @param request The selected state, the comparison and the range.
 * @returns The state to read, or a model refusal.
 */
async function readFootprintStates(
	vault: string,
	request: z.output<typeof ArchitectureFootprintRequestSchema>,
) {
	const { head, modelAt, checkpoint, state, against } = request;
	if (head !== undefined && modelAt !== "checkout" && checkpoint === undefined) {
		const atHead = await readStatesToCheck(vault, state, { against, ref: head });
		if ("ok" in atHead || atHead.code !== "SOURCE_REF_NOT_FOUND") return atHead;
	}
	return readStatesToCheck(vault, state, { checkpoint, against });
}

/**
 * Name the vault that a reading came from.
 * @param model The reading.
 * @returns The ref and the commit of a branch reading, else the vault on disk.
 */
function vaultRead(model: NonNullable<StateToCheck["model"]>) {
	return model.sourceRef === undefined
		? { at: "checkout" as const }
		: { at: "ref" as const, ...model.sourceRef };
}

/**
 * Compare a local source branch range with canonical architecture and its proposal.
 * @param vault The explicit vault.
 * @param input The selected state and local source refs.
 * @param signal The caller's cancellation signal.
 * @returns Canonical identity and the existing footprint evidence, or a model refusal.
 */
async function readArchitectureFootprint(
	vault: string,
	input: z.input<typeof ArchitectureFootprintRequestSchema>,
	signal?: AbortSignal,
) {
	const request = ArchitectureFootprintRequestSchema.parse(input);
	const read = await readFootprintStates(vault, request);
	if (!("ok" in read)) return read;
	const reading = read.states[0]!;
	const model = reading.model!;
	const { proposal, against } = footprintVariants(reading);
	const evidence = await readFootprintEvidence({
		vault,
		document: reading.document,
		proposal,
		against,
		base: request.base,
		head: request.head,
		signal,
	});
	return {
		success: true as const,
		analysis: "footprint" as const,
		vaultRead: vaultRead(model),
		model: model.manifest.id,
		state: model.selectedState,
		revision: model.revision,
		checkpoint: model.checkpoint?.id,
		...evidence,
	};
}
/**
 * List the branches that a footprint of the selected state can be read between: those of every
 * repository that the state, and the variant it is read against, bind.
 * @param vault The explicit vault.
 * @param input The selected state.
 * @param signal The caller's cancellation signal.
 * @returns Canonical identity and the merged refs, or a model refusal.
 */
async function readArchitectureSourceRefs(
	vault: string,
	input: z.input<typeof ArchitectureSourceRefsRequestSchema>,
	signal?: AbortSignal,
) {
	const request = ArchitectureSourceRefsRequestSchema.parse(input);
	const read = await readStatesToCheck(vault, request.state, request);
	if (!("ok" in read)) return read;
	const reading = read.states[0]!;
	const model = reading.model!;
	const { proposal, against } = footprintVariants(reading);
	const repos = [proposal, against].flatMap((variant) =>
		(variant?.content.nodes ?? []).flatMap((node) =>
			node.binding === undefined ? [] : [node.binding.repo],
		),
	);
	const { base, head } = request;
	const evidence = await readSourceRefs(
		vault,
		[...new Set(repos)],
		{ signal },
		base === undefined || head === undefined ? undefined : { base, head },
	);
	return {
		success: true as const,
		analysis: "refs" as const,
		model: model.manifest.id,
		state: model.selectedState,
		revision: model.revision,
		checkpoint: model.checkpoint?.id,
		...evidence,
	};
}
/** One history analysis as a caller asks for it, named by its `analysis`. */
type HistoryRequest = z.input<typeof ArchitectureHistoryRequestSchema>;
/** What any one analysis answers. */
type HistoryAnswer =
	| Awaited<ReturnType<typeof readArchitectureLocality>>
	| Awaited<ReturnType<typeof readArchitectureFootprint>>
	| Awaited<ReturnType<typeof readArchitectureSourceRefs>>;
/** The request of one analysis, without the name that chose it. */
type RequestOf<A extends HistoryRequest["analysis"]> = Omit<
	Extract<HistoryRequest, { analysis: A }>,
	"analysis"
>;

/**
 * Read one history analysis of the selected architecture: change locality, a branch footprint,
 * or the source refs that a footprint can read.
 * @param vault The explicit vault.
 * @param input The analysis and its request.
 * @param signal The caller's cancellation signal.
 * @returns The analysis with canonical identity, or a model refusal.
 */
function readArchitectureHistory(
	vault: string,
	input: { readonly analysis: "locality" } & RequestOf<"locality">,
	signal?: AbortSignal,
): ReturnType<typeof readArchitectureLocality>;
function readArchitectureHistory(
	vault: string,
	input: { readonly analysis: "footprint" } & RequestOf<"footprint">,
	signal?: AbortSignal,
): ReturnType<typeof readArchitectureFootprint>;
function readArchitectureHistory(
	vault: string,
	input: { readonly analysis: "refs" } & RequestOf<"refs">,
	signal?: AbortSignal,
): ReturnType<typeof readArchitectureSourceRefs>;
function readArchitectureHistory(
	vault: string,
	input: HistoryRequest,
	signal?: AbortSignal,
): Promise<HistoryAnswer>;
function readArchitectureHistory(vault: string, input: HistoryRequest, signal?: AbortSignal) {
	if (input.analysis === "locality") {
		const { analysis: _analysis, ...request } = input;
		return readArchitectureLocality(vault, request, signal);
	}
	if (input.analysis === "footprint") {
		const { analysis: _analysis, ...request } = input;
		return readArchitectureFootprint(vault, request, signal);
	}
	const { analysis: _analysis, ...request } = input;
	return readArchitectureSourceRefs(vault, request, signal);
}

export { readArchitectureHistory };
