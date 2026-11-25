import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Model } from "@archboard/model/content";
import type { RememberedFindings } from "#ui/architecture-drawing/canvas/picture/reads/clients/drawings.ts";
import { codeFindingsQuery } from "#ui/architecture-drawing/canvas/picture/reads/clients/queries.ts";
import { readsVaultOnDisk } from "#ui/architecture-drawing/model-reader/rules/vault-on-disk.ts";
import type { CodeRead } from "#ui/architecture-drawing/model-reader/reading/rules/module-code.ts";

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
 * Show remembered code evidence only for the exact architecture that the pass read. The read only
 * asks the server what the last pass found, and never starts a pass.
 * @param vault The reading's explicit vault.
 * @param model The coherent current, proposal, or retained architecture, by its name.
 * @param wanted Whether the caller shows the findings now; a caller that does not reads nothing.
 * @returns Its matching findings, the subjects that carry warning marks, and how the read of the
 * remembered findings stands, or that the reading is not the vault on disk, which no pass reads.
 */
function useModelCodeFindings(vault: string, model: CodeReadingName, wanted = true) {
	const id = model.manifest.id;
	const state = stateOf(model);
	const revision = model.revision.digest;
	const select = useCallback(
		(all: RememberedFindings): ModelCodeReading | null => passOf(all, { id, state, revision }),
		[id, state, revision],
	);
	const onDisk = readsVaultOnDisk(model);
	const query = useQuery({ ...codeFindingsQuery(vault), select, enabled: wanted && onDisk });
	const reading = onDisk ? (query.data ?? null) : null;
	const read: CodeRead = onDisk ? query.status : "elsewhere";
	const warnings = useMemo(() => warnedSubjects(reading), [reading]);
	return { reading, warnings, read };
}

/**
 * The state a reading shows, as a pass names it.
 * @param model The reading.
 * @returns The state, or null for a model with no current state.
 */
function stateOf(model: CodeReadingName): string | null {
	return model.selectedState?.id ?? null;
}

/**
 * The remembered pass that read this version of the reading.
 * @param all Every remembered pass.
 * @param name The reading's model, state and the digest of its version.
 * @param name.id The model.
 * @param name.state The state, or null.
 * @param name.revision The digest of its version.
 * @returns The pass, or null when none read it.
 */
function passOf(
	all: RememberedFindings,
	name: { readonly id: string; readonly state: string | null; readonly revision: string },
): ModelCodeReading | null {
	return (
		all.models?.find(
			(reading) =>
				reading.model === name.id &&
				reading.state === name.state &&
				reading.revision.digest === name.revision,
		) ?? null
	);
}

/**
 * The subjects that a warning of a pass names.
 * @param reading The pass, or null.
 * @returns Their identities.
 */
function warnedSubjects(reading: ModelCodeReading | null): ReadonlySet<string> {
	return new Set(
		(reading?.findings ?? []).flatMap((finding) =>
			finding.severity === "warning" && finding.subject !== undefined ? [finding.subject.id] : [],
		),
	);
}

export { useModelCodeFindings, type CodeReadingName, type ModelCodeReading };
