import type { JSX } from "react";
import type { Model } from "#ui/rules/architecture-model/projection.ts";

type OriginalState = NonNullable<NonNullable<Model["migrationPreview"]>["history"]>[number];
type Issue = NonNullable<OriginalState["state"]["reconciliation"]>["issues"][number];
const BASELINE_LABELS = {
	empty: "Empty model",
	content: "Original state content",
	"reconciliation-base": "Original reconciliation base",
} as const;

/**
 * Keep explicit conversion choices and unresolved original values visible together.
 * @param props The original state and its planned conversion.
 * @param props.entry The original history entry.
 * @returns Draft mapping evidence and any unresolved standing.
 */
function ModelPreviewDraft({ entry }: { entry: OriginalState }): JSX.Element {
	return (
		<>
			<DraftMapping entry={entry} />
			<OriginalStanding entry={entry} />
		</>
	);
}

/**
 * A draft conversion requires a deliberate predecessor and baseline choice.
 * @param props The original draft.
 * @param props.entry The preserved conversion evidence.
 * @returns Its exact baseline evidence or a visible mapping requirement.
 */
function DraftMapping({ entry }: { entry: OriginalState }): JSX.Element | null {
	const conversion = entry.conversion;
	if (conversion === undefined)
		return entry.state.lifecycle === "draft" ? (
			<p>
				No baseline is chosen for this draft. Ask an agent to map its predecessor and baseline
				before migration.
			</p>
		) : null;
	return (
		<section className="space-y-2" aria-label="Draft conversion">
			<dl className="space-y-2">
				<div>
					<dt className="font-semibold">Predecessor</dt>
					<dd>
						<code data-slot="preview-predecessor" className="break-all">
							{conversion.predecessor ?? "None"}
						</code>
					</dd>
				</div>
				<div>
					<dt className="font-semibold">Baseline</dt>
					<dd data-slot="preview-baseline" data-baseline-kind={conversion.baseline.kind}>
						{BASELINE_LABELS[conversion.baseline.kind]}
						<br />
						<code className="break-all">{conversion.baseline.state}</code>
					</dd>
				</div>
				<div>
					<dt className="font-semibold">Baseline fingerprint</dt>
					<dd>
						<code className="break-all">{conversion.baselineDigest}</code>
					</dd>
				</div>
			</dl>
			<p>{conversion.reason}</p>
			<p>
				{conversion.changes.length} explicit changes. This mapping preserves this draft
				independently of other proposals with the same name.
			</p>
		</section>
	);
}

/**
 * Preserve conflicts and blocked ancestry as original evidence.
 * @param props The original state.
 * @param props.entry The original state and its qualified address.
 * @returns Read-only standing without settlement controls.
 */
function OriginalStanding({ entry }: { entry: OriginalState }): JSX.Element | null {
	const standing = entry.state.reconciliation;
	if (standing === undefined) return null;
	return (
		<section className="space-y-2" aria-label="Original standing">
			{standing.blockedBy !== undefined && (
				<p data-slot="preview-blocked">
					This state waits on{" "}
					<code>
						{entry.legacy.slice(0, entry.legacy.lastIndexOf("#") + 1)}
						{standing.blockedBy}
					</code>
					.
				</p>
			)}
			{standing.issues.length > 0 && (
				<ul data-slot="preview-issues" className="space-y-3">
					{[...new Map(standing.issues.map((issue) => [JSON.stringify(issue), issue]))].map(
						([key, issue]) => (
							<OriginalIssue key={key} issue={issue} />
						),
					)}
				</ul>
			)}
		</section>
	);
}

/**
 * Show both preserved values and the original repair instruction.
 * @param props One unresolved issue.
 * @param props.issue The original subject, field, values, and recovery instruction.
 * @returns The conflict evidence as authored.
 */
function OriginalIssue({ issue }: { issue: Issue }): JSX.Element {
	return (
		<li className="border-border space-y-2 rounded border p-3">
			<p className="font-semibold">
				{issue.subject} · {issue.field ?? issue.kind}
			</p>
			<dl className="space-y-2">
				<div>
					<dt>Draft value</dt>
					<dd>
						<pre className="break-all whitespace-pre-wrap">{originalValue(issue.mine)}</pre>
					</dd>
				</div>
				<div>
					<dt>Predecessor value</dt>
					<dd>
						<pre className="break-all whitespace-pre-wrap">{originalValue(issue.theirs)}</pre>
					</dd>
				</div>
			</dl>
			<p>{issue.repair}</p>
		</li>
	);
}

/**
 * Preserve exact scalar values and structured evidence in the reader.
 * @param value The original conflict value, including absence.
 * @returns Readable original evidence.
 */
function originalValue(value: unknown): string {
	if (value === undefined) return "Absent";
	return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export { ModelPreviewDraft };
