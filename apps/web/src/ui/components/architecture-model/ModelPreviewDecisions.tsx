import type { JSX } from "react";
import type { Model } from "#ui/rules/architecture-model/projection.ts";
import { checkpointTime } from "#ui/rules/architecture-model/history-time.ts";

type OriginalState = NonNullable<NonNullable<Model["migrationPreview"]>["history"]>[number];
type Decision =
	| NonNullable<OriginalState["adoptions"]>[number]
	| NonNullable<OriginalState["shelvings"]>[number]
	| NonNullable<OriginalState["state"]["corrections"]>[number];

/**
 * Preserve the reasons, dates, and source evidence of original decisions.
 * @param props The original state and its lifecycle records.
 * @param props.entry The original history entry.
 * @returns Read-only decision sections when records exist.
 */
function ModelPreviewDecisions({ entry }: { entry: OriginalState }): JSX.Element {
	return (
		<>
			<Decisions title="Adoption" slot="preview-adoptions" records={entry.adoptions} />
			<Decisions title="Shelving" slot="preview-shelvings" records={entry.shelvings} />
			<Decisions title="Corrections" slot="preview-corrections" records={entry.state.corrections} />
		</>
	);
}

/**
 * Render the original records without assigning them a new canonical event.
 * @param props The original records and their category.
 * @param props.title The lifecycle event category.
 * @param props.slot The stable evidence surface.
 * @param props.records The original reasons, dates, and optional source revisions.
 * @returns A bounded list of original decisions or no section.
 */
function Decisions({
	title,
	slot,
	records,
}: {
	title: string;
	slot: string;
	records: readonly Decision[] | undefined;
}): JSX.Element | null {
	if (records === undefined || records.length === 0) return null;
	return (
		<section data-slot={slot} className="space-y-2" aria-label={title}>
			<h3 className="font-semibold">{title}</h3>
			<ul className="space-y-3">
				{[...new Map(records.map((record) => [JSON.stringify(record), record]))].map(
					([key, record]) => (
						<li key={key}>
							<time dateTime={record.at} className="text-muted-foreground">
								{checkpointTime(record.at)}
							</time>
							<p>{record.reason}</p>
							<OriginalSources record={record} />
						</li>
					),
				)}
			</ul>
		</section>
	);
}

/**
 * Source associations remain evidence of the original correction.
 * @param props The original decision.
 * @param props.record A correction or another lifecycle record.
 * @returns The original repository revisions, without inventing code navigation.
 */
function OriginalSources({ record }: { record: Decision }): JSX.Element | null {
	if (!("revisions" in record)) return null;
	return (
		<ul>
			{record.revisions.map((source) => (
				<li key={`${source.repo}:${source.commit}`}>
					<code className="break-all">
						{source.repo} · {source.commit}
					</code>
				</li>
			))}
		</ul>
	);
}

export { ModelPreviewDecisions };
