import type { JSX } from "react";
import type { ArchitectureModelRead } from "@archboard/board/model";

interface CheckpointEvidenceProps {
	model: Extract<ArchitectureModelRead, { success: true }>;
}

/**
 * Exact architecture remains readable when its source evidence is unavailable.
 * @param props The selected server snapshot.
 * @returns Its retained identity and current evidence availability.
 */
function CheckpointEvidence(props: CheckpointEvidenceProps): JSX.Element | null {
	const { checkpoint, sourceEvidence } = props.model;
	if (checkpoint === undefined) return null;
	return (
		<div
			data-slot="model-checkpoint"
			data-checkpoint-id={checkpoint.id}
			className="border-border bg-muted/30 text-control border-b px-6 py-3"
		>
			<div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<span className="font-semibold">Retained architecture</span>
				<time className="text-muted-foreground" dateTime={checkpoint.createdAt}>
					{new Date(checkpoint.createdAt).toLocaleString()}
				</time>
				<code className="select-text">{checkpoint.id}</code>
			</div>
			{sourceEvidence?.map((source) => (
				<div
					key={source.repo}
					data-slot="model-source-evidence"
					data-status={source.status}
					className="mt-3 max-w-prose space-y-1"
				>
					<p>
						{evidenceLabel[source.status]} · {source.repo}
					</p>
					{source.commit !== null && (
						<code className="text-muted-foreground block break-all select-text">
							{source.commit}
						</code>
					)}
					{source.recovery && (
						<p data-slot="model-source-recovery" className="text-body">
							{source.recovery}
						</p>
					)}
				</div>
			))}
		</div>
	);
}

const evidenceLabel = {
	available: "Source evidence available",
	uncommitted: "Source includes uncommitted changes",
	unavailable: "Source evidence unavailable",
} satisfies Record<
	NonNullable<CheckpointEvidenceProps["model"]["sourceEvidence"]>[number]["status"],
	string
>;

export { CheckpointEvidence };
