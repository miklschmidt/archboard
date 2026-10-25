// The claim on a board (ADR 0016), as the CLI asks the server for it.

import { requestJson } from "@archboard/server-lifecycle/server-client";

/** What a claim answers with. */
interface ClaimReply {
	success: true;
	board: string;
	claim: { board: string; holder: { id: string; reason?: string }; expires: string };
	created: boolean;
	/** The version the claim was told about, which its first write states. */
	version: number | null;
}

/** What releasing a claim answers with. */
interface ClaimReleaseReply {
	success: true;
	board: string;
	released: boolean;
}

/** What a claim asks for. */
interface ClaimParams {
	reason: string;
	forMs?: number;
}

/**
 * Take a board for a stretch of work (ADR 0016).
 * @param params The reason, and how long it is wanted for.
 * @returns The claim, and the version it was told about.
 */
function claimBoard(params: ClaimParams): Promise<ClaimReply> {
	return requestJson<ClaimReply>("/api/semantic-boards/claim", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			reason: params.reason,
			...(params.forMs === undefined ? {} : { forMs: params.forMs }),
		}),
	});
}

/**
 * Give a claimed board back.
 * @returns Whether a claim was released.
 */
function releaseBoardClaim(): Promise<ClaimReleaseReply> {
	return requestJson<ClaimReleaseReply>("/api/semantic-boards/claim/release", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({}),
	});
}

export { claimBoard, releaseBoardClaim };
