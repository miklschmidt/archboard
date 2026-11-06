// A talk's model and policy, read the way a pane reads them from the server.
//
// The picture is rendered from the model the voice spoke over, whatever the
// model says now or whether it still exists. So the pane reads the talk's
// snapshot, and a read of any other model is a failure of the rendering rather
// than a quiet trip to the server.

import { parseLegacyBoard } from "@archboard/model/legacy-board";
import {
	ReadingError,
	type RetainedListing,
} from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import type { Talk } from "@archboard/walkthrough/talk";
import { sameModelName } from "#ui/architecture-drawing/canvas/picture/rules/address.ts";
import { type RetainedReads } from "#ui/architecture-drawing/canvas/picture/reads/clients/retained-reads.ts";

/**
 * Model reads answered from a talk.
 * @param talk The talk.
 * @param foreign Told of a read of another model, which the talk cannot answer.
 * @returns The reads.
 */
function talkReads(talk: Talk, foreign: (model: string) => void): RetainedReads {
	return {
		/**
		 * List the original document inside this capture.
		 * @returns Only the document retained by this talk.
		 */
		listing: async () => retainedListing(talk),
		/**
		 * The talk's legacy board, and no other, whichever vault the pane names.
		 * @param _vault The pane's vault, which a talk has no use for.
		 * @param model The legacy board asked for.
		 * @returns The talk's document.
		 * @throws {Error} When another legacy board is asked for.
		 */
		document: async (_vault, model) => {
			if (sameModelName(model, talk.board.name)) return talk.document;
			foreign(model);
			throw new Error(`The talk is of ${talk.board.name}; ${model} was read while rendering it.`);
		},
		/**
		 * The policy the talk's model was drawn under.
		 * @returns The vault check the talk kept.
		 */
		vaultCheck: async () => talk.policy,
		/**
		 * No findings: a recording draws the model the voice spoke over, never
		 * what a code pass left in some server's memory.
		 * @returns No readings.
		 */
		codeFindings: async () => ({ readings: [] }),
	};
}

/**
 * Describe the captured original without discovering live models.
 * @param talk The immutable recording.
 * @returns The one available original document.
 * @throws {ReadingError} When the retained document is invalid.
 */
function retainedListing(talk: Talk): RetainedListing {
	const parsed = parseLegacyBoard(talk.document);
	if (!parsed.ok) throw new ReadingError("MODEL_UNREADABLE", parsed.problem);
	const model = parsed.board;
	return {
		levels: [],
		boards: [
			{
				id: model.id,
				key: model.name,
				name: model.name,
				version: model.version,
				opens: model.current ?? null,
				links: [],
				description: null,
				variants: model.variants.map((variant) => ({
					id: variant.id,
					name: variant.name,
					lifecycle: variant.lifecycle,
					parentId: variant.parent ?? null,
				})),
			},
		],
	};
}

export { talkReads };
