import { useCallback, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import type { Model } from "@archboard/board/content";
import type { useModelLocation } from "#ui/hooks/architecture-model/use-model-location.ts";
import { checkpointTime } from "#ui/rules/architecture-model/history-time.ts";

type Corrections = NonNullable<Model["selectedState"]>["corrections"];
type ReadCheckpoint = ReturnType<typeof useModelLocation>["selectCheckpoint"];
interface CorrectionsProps {
	corrections: Corrections;
	onRead: ReadCheckpoint;
	comparison?: boolean;
}

/**
 * Read the recorded correction chain without changing its order or interpreting source evidence.
 * @param props The selected audit and ordinary checkpoint navigation.
 * @returns Reasons, source revisions, and exact reading links when corrections exist.
 */
function ModelCorrections(props: CorrectionsProps): JSX.Element | null {
	if (props.corrections === undefined || props.corrections.length === 0) return null;
	return (
		<section
			data-slot={props.comparison ? "model-comparison-corrections" : "model-corrections"}
			className="space-y-3"
		>
			<h4 className="font-semibold">
				{props.comparison ? "Corrections to the comparison reading" : "Corrections"}
			</h4>
			<ol className="space-y-4">
				{props.corrections.map((correction) => (
					<CorrectionEntry
						key={correction.checkpoint}
						correction={correction}
						onRead={props.onRead}
					/>
				))}
			</ol>
		</section>
	);
}

/**
 * Keep an authored reason beside its immutable source revisions and architecture checkpoints.
 * @param props One correction and the existing reader action.
 * @param props.correction The exact audit entry.
 * @param props.onRead Open one exact checkpoint.
 * @returns One chronological correction entry.
 */
function CorrectionEntry(props: {
	correction: NonNullable<Corrections>[number];
	onRead: ReadCheckpoint;
}): JSX.Element {
	const { correction, onRead } = props;
	return (
		<li
			data-correction-checkpoint={correction.checkpoint}
			className="border-border space-y-2 border-t pt-3"
		>
			<time className="text-muted-foreground" dateTime={correction.at}>
				{checkpointTime(correction.at)}
			</time>
			<p data-slot="correction-reason" className="whitespace-pre-wrap">
				{correction.reason}
			</p>
			<ul className="text-control space-y-1">
				{correction.revisions.map((revision) => (
					<li key={revision.repo}>
						<span>{revision.repo}</span>
						<br />
						<code data-source-commit={revision.commit} className="break-all select-text">
							{revision.commit}
						</code>
					</li>
				))}
			</ul>
			<div className="flex flex-wrap gap-2">
				<CorrectionReading id={correction.previous} previous onRead={onRead} />
				<CorrectionReading id={correction.checkpoint} previous={false} onRead={onRead} />
			</div>
		</li>
	);
}

/**
 * The ordinary router keeps exact history distinct from the latest logical state.
 * @param props One audit checkpoint and its role.
 * @param props.id The exact retained identity.
 * @param props.previous Whether the link opens the superseded facts.
 * @param props.onRead Open that exact reading.
 * @returns One deliberate navigation control.
 */
function CorrectionReading(props: {
	id: string;
	previous: boolean;
	onRead: ReadCheckpoint;
}): JSX.Element {
	const { id, onRead } = props;
	const open = useCallback((): void => onRead(id), [id, onRead]);
	return (
		<Button
			variant="outline"
			size="sm"
			onClick={open}
			title={id}
			data-correction-previous={props.previous ? id : undefined}
			data-correction-reading={props.previous ? undefined : id}
		>
			{props.previous ? "Previous" : "Corrected"} · <code>{id.slice(0, 8)}</code>
		</Button>
	);
}

export { ModelCorrections };
