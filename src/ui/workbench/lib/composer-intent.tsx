// The Archboard-owned intent controls inside the official composer's action
// row: how the next message is delivered (send, or steer the running turn),
// whether it is queued instead, and the turn state. The official Send button
// submits through the assistant-ui runtime, which reads this intent; the
// official Cancel beside it is the one Stop while a turn runs. The workbench
// hands the values down through a context so the official thread file only
// renders a slot.

import { createContext, useCallback, useContext, useMemo } from "react";

import { Checkbox } from "@/ui/components/checkbox";
import { Label } from "@/ui/components/label";
import { ToggleGroup, ToggleGroupItem } from "@/ui/components/toggle-group";
import type {
	ComposerIntent,
	WorkbenchActions,
	WorkbenchComposerView,
} from "@/ui/workbench/contracts";

/** Inputs for the intent row. */
interface ComposerIntentBarProps {
	composer: WorkbenchComposerView;
	/** The running turn's id, or null when the workhorse is idle. */
	activeTurnId: string | null;
	/** False when the link cannot take direct input at all. */
	canCompose: boolean;
	actions: WorkbenchActions;
}

const QUEUE_CHECKBOX_ID = "workbench-queue-instead";

/** A 24px toggle: control text in a flat chip. */
const INTENT_ITEM = "h-6 min-w-0 px-2 text-control";

const ComposerIntentContext = createContext<ComposerIntentBarProps | null>(null);

/**
 * Whether a toggle value is one of the intents.
 * @param value The toggle group's value.
 * @returns The intent, or null for anything else.
 */
function intentFrom(value: unknown): ComposerIntent | null {
	return value === "send" || value === "steer" ? value : null;
}

/**
 * The intent row.
 * @param props The composer view, the active turn, and the actions.
 * @returns The row.
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
		<div className="flex min-w-0 flex-1 items-center gap-3">
			<ToggleGroup
				value={groupValue}
				onValueChange={handleIntent}
				variant="outline"
				size="sm"
				spacing={0}
				aria-label="Delivery"
				disabled={!props.canCompose}
				className="rounded-sm"
			>
				<ToggleGroupItem value="send" className={`${INTENT_ITEM} first:rounded-l-sm!`}>
					Send
				</ToggleGroupItem>
				<ToggleGroupItem
					value="steer"
					disabled={!running}
					className={`${INTENT_ITEM} last:rounded-r-sm!`}
				>
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
				<Label htmlFor={QUEUE_CHECKBOX_ID} className="text-body font-normal">
					Queue instead
				</Label>
			</span>
			<span className="text-body text-muted-foreground ms-auto truncate">
				{running ? "Turn running" : "Workhorse idle"}
			</span>
		</div>
	);
}

/**
 * The intent row as the official composer's footer slot, fed by the context
 * the workbench provides.
 * @returns The row, or nothing outside the workbench.
 */
function ComposerIntentFooter(): React.JSX.Element | null {
	const value = useContext(ComposerIntentContext);
	return value === null ? null : <ComposerIntentBar {...value} />;
}

export {
	ComposerIntentBar,
	ComposerIntentContext,
	ComposerIntentFooter,
	type ComposerIntentBarProps,
};
