import type { z } from "zod";
import {
	ArchitectureLocalityRequestSchema,
	ArchitectureFootprintRequestSchema,
	ArchitectureSourceRefsRequestSchema,
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
	const read = await readStatesToCheck(vault, request.state, request);
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
	const evidence = await readSourceRefs(vault, [...new Set(repos)], { signal });
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
export { readArchitectureLocality, readArchitectureFootprint, readArchitectureSourceRefs };
