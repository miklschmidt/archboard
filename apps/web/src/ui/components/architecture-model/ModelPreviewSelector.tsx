import { useCallback, type JSX } from "react";
import { Select } from "@archboard/ui-kit/components";
import type { Model } from "@archboard/board/content";

type Preview = NonNullable<Model["migrationPreview"]>;
const NO_HISTORY: NonNullable<Preview["history"]> = [];
interface SelectorProps {
	preview: Preview | undefined;
	state: string | null;
	pending: boolean;
	onState: (state: string | null) => void;
}

/**
 * Choose original coverage without merging independent legacy histories.
 * @param props The available originals and requested state.
 * @param props.preview The original history catalogue.
 * @param props.state The requested original identity.
 * @param props.pending Whether the requested catalogue is still loading.
 * @param props.onState Select an original or composed current.
 * @returns One reading choice within the existing preview header.
 */
function ModelPreviewSelector({ preview, state, pending, onState }: SelectorProps): JSX.Element {
	const choose = useCallback(
		(value: string | null): void => {
			if (value !== null) onState(value === "current" ? null : value);
		},
		[onState],
	);
	return (
		<Select value={state ?? "current"} onValueChange={choose}>
			<Select.Trigger
				size="sm"
				data-slot="preview-reading-selector"
				disabled={pending}
				aria-label="Migration reading"
			>
				<Select.Value>{readingLabel(preview, state)}</Select.Value>
			</Select.Trigger>
			<Select.Content align="end" alignItemWithTrigger={false} className="w-auto max-w-xl min-w-80">
				<Select.Item value="current" data-preview-state="current">
					{defaultPreviewLabel(preview)}
				</Select.Item>
				<OriginalChoices history={preview?.history ?? NO_HISTORY} state={state} />
			</Select.Content>
		</Select>
	);
}

/**
 * Keep unavailable requested identities visible in the reading control.
 * @param preview The current original history catalogue.
 * @param state The requested original, or composed current.
 * @returns The selected name or exact unresolved identity.
 */
function readingLabel(preview: Preview | undefined, state: string | null): string {
	const selected = preview?.history?.find((entry) => entry.legacy === state);
	return selected?.state.name ?? state ?? defaultPreviewLabel(preview);
}

/**
 * Keep independent original states separate even when their names match.
 * @param props The original catalogue and requested identity.
 * @param props.history The original states available in this preview.
 * @param props.state The original that the address requests.
 * @returns Original options and an explicit unavailable choice.
 */
function OriginalChoices({
	history,
	state,
}: {
	history: NonNullable<Preview["history"]>;
	state: string | null;
}): JSX.Element {
	const selected = history.find((entry) => entry.legacy === state);
	return (
		<>
			{history.map((entry) => (
				<Select.Item key={entry.legacy} value={entry.legacy} data-preview-state={entry.legacy}>
					<span className="flex flex-col gap-1">
						<span>
							{entry.state.name} · {entry.state.lifecycle}
						</span>
						<span className="text-body text-muted-foreground">{entry.legacy}</span>
					</span>
				</Select.Item>
			))}
			{state !== null && selected === undefined && (
				<Select.Item value={state} data-preview-state={state}>
					Unavailable original · {state}
				</Select.Item>
			)}
		</>
	);
}

export { ModelPreviewSelector };

/**
 * Name an originals-only receipt without claiming that architecture was composed.
 * @param preview The public preview diagnostics.
 * @returns The default reading label.
 */
function defaultPreviewLabel(preview: Preview | undefined): string {
	return preview?.diagnostics?.length ? "Originals only" : "Composed current";
}
