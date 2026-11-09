import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ArchitectureModelRead } from "@archboard/model/contract";
import { architectureClaimsQuery } from "#ui/architecture-drawing/model-reader/access/clients/queries.ts";
import {
	claimedSubjects,
	NOTHING_CLAIMED,
	type ClaimedSubjects,
} from "#ui/architecture-drawing/model-reader/rules/claimed-subjects.ts";

/**
 * Which subjects of a reading the agents claim. Only the live inputs can be claimed, so a retained
 * checkpoint or a migration candidate marks nothing. The architecture feed keeps the claims
 * current, so a claim that starts or ends marks or clears its subjects without another read.
 * @param vault The addressed vault.
 * @param model The reading.
 * @param checkpoint The exact checkpoint that the reading shows, or null for the live inputs.
 * @returns The purpose of each claimed subject.
 */
function useClaimedSubjects(
	vault: string,
	model: Extract<ArchitectureModelRead, { success: true }>,
	checkpoint: string | null,
): ClaimedSubjects {
	const live = checkpoint === null && model.migrationPreview === undefined;
	const { data } = useQuery({ ...architectureClaimsQuery(vault), enabled: live });
	const answer = live ? data : undefined;
	const state = model.selectedState?.id ?? null;
	return useMemo(
		() => (answer?.success === true ? claimedSubjects(answer.claims, state) : NOTHING_CLAIMED),
		[answer, state],
	);
}

export { useClaimedSubjects };
