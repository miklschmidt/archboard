import type { z } from "zod";
import {
	ArchitectureLocalityRequestSchema,
	ArchitectureFootprintRequestSchema,
} from "#shared/protocol/canonical-history.ts";
import { readBoardsToCheck } from "#runtime/operations/code-check/boards.ts";
import { createLocalityEvidence } from "#runtime/operations/history-lens/locality.ts";
import { readFootprintEvidence } from "#runtime/operations/history-lens/footprint.ts";
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
	const read = await readBoardsToCheck(vault, request.state, request);
	if (!("ok" in read)) return read;
	const reading = read.boards[0]!;
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
		model: model.manifest.id,
		state: model.selectedState,
		revision: model.revision,
		checkpoint: model.checkpoint?.id,
		...evidence,
	};
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
	const read = await readBoardsToCheck(vault, request.state, request);
	if (!("ok" in read)) return read;
	const reading = read.boards[0]!;
	const model = reading.model!;
	const proposal = model.selectedState?.lifecycle === "draft" ? reading.variant : undefined;
	const against =
		proposal === undefined
			? reading.variant
			: reading.board.variants.find((variant) => variant.id === proposal.parent);
	const evidence = await readFootprintEvidence({
		vault,
		board: reading.board,
		proposal,
		against,
		base: request.base,
		head: request.head,
		signal,
	});
	return {
		success: true as const,
		model: model.manifest.id,
		state: model.selectedState,
		revision: model.revision,
		checkpoint: model.checkpoint?.id,
		...evidence,
	};
}
export { readArchitectureLocality, readArchitectureFootprint };
