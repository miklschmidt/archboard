import type { JSX } from "react";
import type { Model } from "@archboard/board/content";
import { ModelPreviewDecisions } from "#ui/components/architecture-model/ModelPreviewDecisions.tsx";
import { ModelPreviewDraft } from "#ui/components/architecture-model/ModelPreviewDraft.tsx";

type OriginalState = NonNullable<NonNullable<Model["migrationPreview"]>["history"]>[number];

/**
 * Show the original state's evidence without inventing repository-wide history.
 * @param props The selected preview receipt.
 * @param props.model The original coverage and preserved metadata.
 * @returns A bounded disclosure of original decisions and draft standing.
 */
function ModelPreviewStateEvidence({ model }: { model: Model }): JSX.Element | null {
	const preview = model.migrationPreview;
	const entry = preview?.history?.find((state) => state.legacy === preview.selected?.legacy);
	if (entry === undefined) return null;
	return (
		<details
			data-slot="preview-state-evidence"
			className="text-body border-border shrink-0 border-b"
		>
			<summary className="hover:bg-muted cursor-pointer px-4 py-2">
				{entry.state.name} · {entry.state.lifecycle}
				{standingLabel(entry)}
			</summary>
			<div className="max-h-64 space-y-4 overflow-auto px-4 pb-4">
				{entry.state.summary !== undefined && <p>{entry.state.summary}</p>}
				<dl className="space-y-2">
					<div>
						<dt className="font-semibold">Original identity</dt>
						<dd>
							<code className="break-all">{entry.legacy}</code>
						</dd>
					</div>
					<div>
						<dt className="font-semibold">Mapped identity</dt>
						<dd>
							<code className="break-all">{entry.canonical}</code>
						</dd>
					</div>
				</dl>
				<ModelPreviewDraft entry={entry} />
				<ModelPreviewDecisions entry={entry} />
			</div>
		</details>
	);
}

/**
 * Name unresolved standing even when the evidence disclosure is closed.
 * @param entry The original state's metadata.
 * @returns Its visible standing suffix.
 */
function standingLabel(entry: OriginalState): string {
	const standing = entry.state.reconciliation;
	if (standing !== undefined) {
		if (standing.blockedBy !== undefined) return " · Blocked";
		if (standing.issues.length > 0) return " · Conflicted";
	}
	if (entry.state.lifecycle === "draft" && entry.conversion === undefined)
		return " · Baseline needed";
	return "";
}

export { ModelPreviewStateEvidence };
