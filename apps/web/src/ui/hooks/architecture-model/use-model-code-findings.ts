import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/board/content";
import type { RememberedFindings } from "@archboard/code-intel/code-check";
import { codeFindingsQuery } from "#ui/clients/semantic-board-canvas/reads/queries.ts";

type ModelCodeReading = NonNullable<RememberedFindings["models"]>[number];

/**
 * Show remembered code evidence only for the exact architecture that the pass read.
 * @param vault The reading's explicit vault.
 * @param model The coherent current, proposal, or retained architecture.
 * @returns Its matching findings and the subjects that carry warning marks.
 */
function useModelCodeFindings(vault: string, model: Model) {
	const id = model.manifest.id;
	const state = model.selectedState?.id ?? null;
	const revision = model.revision.digest;
	const select = useCallback(
		(all: RememberedFindings): ModelCodeReading | null =>
			all.models?.find(
				(reading) =>
					reading.model === id && reading.state === state && reading.revision.digest === revision,
			) ?? null,
		[id, state, revision],
	);
	const query = useQuery({
		...codeFindingsQuery(vault),
		select,
		enabled: model.migrationPreview === undefined,
	});
	const reading = model.migrationPreview === undefined ? (query.data ?? null) : null;
	const warnings = useMemo(
		() =>
			new Set(
				(reading?.findings ?? []).flatMap((finding) =>
					finding.severity === "warning" && finding.subject !== undefined
						? [finding.subject.id]
						: [],
				),
			),
		[reading],
	);
	return { reading, warnings };
}

export { useModelCodeFindings, type ModelCodeReading };
