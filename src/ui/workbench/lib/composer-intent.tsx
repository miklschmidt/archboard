// The Archboard-owned intent controls beside the official composer: how the
// next message is delivered (send, or steer the running turn), whether it is
// queued instead, and a Stop for the active turn. The official Send button
// submits through the assistant-ui runtime, which reads this intent.

import { RiStopLine } from "@remixicon/react";
import { useCallback, useMemo } from "react";

import { Button } from "@/ui/components/button";
import { Checkbox } from "@/ui/components/checkbox";
import { Label } from "@/ui/components/label";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/toggle-group";
import type {
	ComposerIntent,
	WorkbenchActions,
	WorkbenchComposerView,
} from "@/ui/workbench/contracts";

/** Inputs for the intent bar. */
interface ComposerIntentBarProps {
	composer: WorkbenchComposerView;
	/** The running turn's id, or null when the workhorse is idle. */
	activeTurnId: string | null;
	/** False when the link cannot take direct input at all. */
	canCompose: boolean;
	actions: WorkbenchActions;
}

const QUEUE_CHECKBOX_ID = "workbench-queue-instead";

/**
 * Whether a toggle value is one of the intents.
 * @param value The toggle group's value.
 * @returns The intent, or null for anything else.
 */
function intentFrom(value: unknown): ComposerIntent | null {
	return value === "send" || value === "steer" ? value : null;
}

/**
 * The intent bar.
 * @param props The composer view, the active turn, and the actions.
 * @returns The bar.
 */
function ComposerIntentBar(props: ComposerIntentBarProps): React.JSX.Element {
	const { composer, actions } = props;
	const running = props.activeTurnId !== null;
	const intent: ComposerIntent = running ? composer.intent : "send";
	const groupValue = useMemo(() => [intent], [intent]);
	const handleIntent = useCallback(
		(value: readonly unknown[]) => {
			const next = intentFrom(value[0]);
			if (next !== null) {
				actions.setComposerIntent(next);
			}
		},
		[actions],
	);
	const handleQueue = useCallback(
		(checked: boolean) => {
			actions.setQueueInstead(checked);
		},
		[actions],
	);
	return (
		<div className="border-border flex items-center gap-3 border-t px-3 py-1.5 text-xs">
			<ToggleGroup
				value={groupValue}
				onValueChange={handleIntent}
				variant="outline"
				size="sm"
				spacing={0}
				aria-label="Delivery"
				disabled={!props.canCompose}
			>
				<ToggleGroupItem value="send">Send</ToggleGroupItem>
				<ToggleGroupItem value="steer" disabled={!running}>
					Steer
				</ToggleGroupItem>
			</ToggleGroup>
			<span className="flex items-center gap-1.5">
				<Checkbox
					id={QUEUE_CHECKBOX_ID}
					checked={composer.queueInstead}
					onCheckedChange={handleQueue}
					disabled={!props.canCompose}
				/>
				<Label htmlFor={QUEUE_CHECKBOX_ID} className="text-xs font-normal">
					Queue instead
				</Label>
			</span>
			<span className="text-muted-foreground truncate">
				{running ? "A turn is running" : "Workhorse idle"}
			</span>
			{running ? (
				<Button variant="destructive" size="xs" className="ms-auto" onClick={actions.stopTurn}>
					<RiStopLine />
					Stop
				</Button>
			) : null}
		</div>
	);
}

export { ComposerIntentBar, type ComposerIntentBarProps };
