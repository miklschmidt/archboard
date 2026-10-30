import { useCallback, type JSX } from "react";
import { Button } from "@archboard/ui-kit/components";
import { RiCloseLine } from "@remixicon/react";
import type { ExplanationAction } from "#ui/clients/architecture-model/explanations.ts";

const STATUS: Record<ExplanationAction["status"], string> = {
	captured: "Preparing explanation…",
	queued: "Waiting for the local agent…",
	running: "Explaining…",
	completed: "Explanation",
	failed: "Explanation failed",
	cancelled: "Explanation cancelled",
	unavailable: "Local agent unavailable",
};

interface ResultProps {
	action: ExplanationAction;
	pending: boolean;
	onControl: (type: "retry" | "cancel") => void;
	onClose: () => void;
}

/**
 * Label an answer with its original reading and keep recovery beside it.
 * @param props The sole cached answer and exact action controls.
 * @returns Temporary text, progress, and recovery.
 */
function ModelExplanationResult(props: ResultProps): JSX.Element {
	const { action } = props;
	return (
		<section
			data-slot="model-explanation"
			data-action-id={action.actionId}
			data-status={action.status}
			aria-label="Architecture explanation"
			className="border-border bg-background max-h-72 shrink-0 overflow-auto border-t px-6 py-4"
		>
			<div className="flex items-center gap-3">
				<h3 aria-live="polite" className="text-control font-semibold">
					{STATUS[action.status]}
				</h3>
				<ExplanationControls {...props} />
				<Button
					className="ml-auto"
					size="icon"
					variant="ghost"
					aria-label="Close explanation"
					onClick={props.onClose}
				>
					<RiCloseLine aria-hidden="true" className="size-4" />
				</Button>
			</div>
			<ExplanationContext capture={action.capture} />
			{action.error !== undefined && (
				<p role="alert" className="text-body mt-3">
					{action.error}
				</p>
			)}
			{action.text && (
				<div
					data-slot="model-explanation-text"
					className="text-reading mt-4 max-w-prose whitespace-pre-wrap"
				>
					{action.text}
				</div>
			)}
		</section>
	);
}

export { ModelExplanationResult };

/**
 * Retry and cancellation use the captured action identity.
 * @param props The original action and its control callback.
 * @returns Only controls allowed by the shared action contract.
 */
function ExplanationControls(props: ResultProps): JSX.Element {
	const { action, onControl } = props;
	const retry = useCallback(() => onControl("retry"), [onControl]);
	const cancel = useCallback(() => onControl("cancel"), [onControl]);
	return (
		<>
			{" "}
			{action.retryable && (
				<Button
					data-slot="explanation-retry"
					size="sm"
					variant="outline"
					disabled={props.pending}
					onClick={retry}
				>
					Retry captured request
				</Button>
			)}
			{(action.status === "queued" || action.status === "running") && (
				<Button
					data-slot="explanation-cancel"
					size="sm"
					variant="ghost"
					disabled={props.pending}
					onClick={cancel}
				>
					Cancel
				</Button>
			)}
		</>
	);
}

/**
 * Identify the architecture that the answer explains after navigation changes.
 * @param props The captured reading metadata.
 * @param props.capture The exact original model, state, selection, and revision.
 * @returns The visible origin of this temporary answer.
 */
function ExplanationContext({ capture }: { capture: ExplanationAction["capture"] }): JSX.Element {
	return (
		<p
			data-slot="model-explanation-context"
			className="text-control text-muted-foreground mt-1 break-words"
		>
			{capture.modelName} · {capture.state?.name ?? "Current"} ·{" "}
			{capture.request.subjects.join(", ") || capture.request.reading.flow || "Flow investigation"}{" "}
			· Revision {capture.revision.digest.slice(0, 8)}
		</p>
	);
}
