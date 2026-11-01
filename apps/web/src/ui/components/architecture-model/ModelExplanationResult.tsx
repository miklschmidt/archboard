import { useCallback, type JSX } from "react";
import { AgentAnswer } from "@archboard/workbench/agent";
import { Button } from "@archboard/ui-kit/components";
import { RiCloseLine, RiLoader4Line, RiOpenaiFill } from "@remixicon/react";
import type { ExplanationAction } from "#ui/clients/architecture-model/explanations.ts";

const STATUS: Record<ExplanationAction["status"], string> = {
	captured: "Starting Codex",
	queued: "Waiting for Codex",
	running: "Codex is explaining",
	completed: "Codex explained",
	failed: "Codex could not explain",
	cancelled: "You cancelled",
	unavailable: "Codex is not connected",
};

/** The states in which Codex still has something to say. */
const WORKING: ReadonlySet<ExplanationAction["status"]> = new Set([
	"captured",
	"queued",
	"running",
]);

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
	const working = WORKING.has(action.status);
	return (
		<section
			data-slot="model-explanation"
			data-action-id={action.actionId}
			data-status={action.status}
			aria-label="Architecture explanation"
			className="border-border bg-sidebar shadow-edge-up relative z-40 flex max-h-80 shrink-0 flex-col border-t"
		>
			<header className="border-border h-chrome flex shrink-0 items-center gap-3 border-b pr-2 pl-5">
				<RiOpenaiFill aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
				<h3 aria-live="polite" className="text-control shrink-0 font-semibold">
					{STATUS[action.status]}
				</h3>
				<ExplanationContext action={action} />
				<ExplanationControls {...props} />
				<Button size="icon" variant="ghost" aria-label="Close explanation" onClick={props.onClose}>
					<RiCloseLine aria-hidden="true" className="size-4" />
				</Button>
			</header>
			<div className="min-h-0 flex-1 overflow-auto px-5 py-3">
				{working && <ExplanationActivity activity={action.activity} />}
				{action.error !== undefined && (
					<p role="alert" className="text-body">
						{action.error}
					</p>
				)}
				{action.text && (
					<div data-slot="model-explanation-text" className="text-body max-w-3xl">
						<AgentAnswer text={action.text} running={working} />
					</div>
				)}
			</div>
		</section>
	);
}

/**
 * What Codex is doing while the answer comes.
 * @param props What it is doing.
 * @param props.activity Its latest step, or nothing before the first.
 * @returns The line.
 */
function ExplanationActivity(props: { readonly activity: string | undefined }): JSX.Element {
	return (
		<p
			data-slot="model-explanation-activity"
			className="text-body text-muted-foreground mb-2 flex items-center gap-2"
		>
			<RiLoader4Line aria-hidden="true" className="size-4 shrink-0 animate-spin" />
			<span className="truncate">{props.activity ?? "Getting started"}</span>
		</p>
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
 * Say what the answer explains, which holds after the reading moves on.
 * @param props The action.
 * @param props.action The action, with the model, the state and the subjects in their own words.
 * @returns The line.
 */
function ExplanationContext({ action }: { readonly action: ExplanationAction }): JSX.Element {
	const { modelName, state } = action.capture;
	return (
		<p
			data-slot="model-explanation-context"
			title={`${modelName} · ${state?.name ?? "Current"} · ${action.about}`}
			className="text-body text-muted-foreground min-w-0 flex-1 truncate"
		>
			{action.about} · {modelName} · {state?.name ?? "Current"}
		</p>
	);
}
