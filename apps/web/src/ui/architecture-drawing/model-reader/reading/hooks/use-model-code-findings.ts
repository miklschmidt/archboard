import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/model/content";
import type { RememberedFindings } from "@archboard/code-intel/code-check";
import { codeFindingsQuery } from "#ui/architecture-drawing/canvas/picture/reads/clients/queries.ts";
import { readsVaultOnDisk } from "#ui/architecture-drawing/model-reader/rules/vault-on-disk.ts";

type ModelCodeReading = NonNullable<RememberedFindings["models"]>[number];

/** What a code pass names a reading by: its model, its state and the digest of its version. */
interface CodeReadingName {
	readonly manifest: Pick<Model["manifest"], "id">;
	readonly selectedState?: Pick<NonNullable<Model["selectedState"]>, "id" | "lifecycle"> | null;
	readonly revision: Pick<Model["revision"], "digest">;
	/** A migration preview, which is not in the vault, so no pass reads it. */
	readonly migrationPreview?: unknown;
	/** A branch reading, which is the vault at a ref and not on disk, so no pass reads it. */
	readonly sourceRef?: unknown;
}

/**
 * Show remembered code evidence only for the exact architecture that the pass read.
 * @param vault The reading's explicit vault.
 * @param model The coherent current, proposal, or retained architecture, by its name.
 * @returns Its matching findings, the subjects that carry warning marks, and how the read of the
 * remembered findings stands.
 */
function useModelCodeFindings(vault: string, model: CodeReadingName) {
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
		enabled: readsVaultOnDisk(model),
	});
	const reading = readsVaultOnDisk(model) ? (query.data ?? null) : null;
	const read = query.status;
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
	return { reading, warnings, read };
}

export { useModelCodeFindings, type CodeReadingName, type ModelCodeReading };
