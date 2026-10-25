// The opener settings dialog over its flow. Mounted only while open, so the
// settings are read when the dialog opens and the flow goes with it.

import { useCallback, useMemo, type JSX } from "react";

import type { CodeTargetNotice } from "#shared/schemas/code-target-open.ts";
import type {
	OpenerSelection,
	OpenerSettingsTestRequest,
} from "#shared/schemas/opener-settings.ts";
import { OpenerSettingsDialog } from "#ui/components/OpenerSettingsDialog.tsx";
import { useOpenerSettingsFlow } from "#ui/hooks/use-opener-settings-flow.ts";
import type { OpenerSettingsFlowListener } from "#ui/state/opener-settings-flow.ts";

/** Inputs for the opener settings dialog. */
interface OpenerSettingsProps {
	onSuccess: (message: string) => void;
	onFailure: (notice: CodeTargetNotice) => void;
	onClose: () => void;
	/** Where focus returns once the dialog closes. */
	finalFocus: () => HTMLElement | null;
}

/**
 * The opener settings dialog, open.
 * @param props Where outcomes go and how the dialog closes.
 * @returns The dialog.
 */
function OpenerSettings(props: OpenerSettingsProps): JSX.Element {
	const { onSuccess, onFailure, onClose } = props;
	const listener = useMemo<OpenerSettingsFlowListener>(
		() => ({ onSuccess, onFailure, onSaved: onClose }),
		[onSuccess, onFailure, onClose],
	);
	const { flow, state } = useOpenerSettingsFlow(listener);
	const handleTest = useCallback(
		(request: OpenerSettingsTestRequest): void => {
			void flow.test(request);
		},
		[flow],
	);
	const handleSave = useCallback(
		(selection: OpenerSelection): void => {
			void flow.save(selection);
		},
		[flow],
	);
	const handleReset = useCallback((): void => {
		void flow.reset();
	}, [flow]);
	const handleOpenChange = useCallback(
		(open: boolean): void => {
			if (!open) {
				onClose();
			}
		},
		[onClose],
	);
	return (
		<OpenerSettingsDialog
			open
			settings={state.settings}
			busy={state.busy}
			testResult={state.testResult}
			error={state.error}
			onTest={handleTest}
			onSave={handleSave}
			onReset={handleReset}
			onOpenChange={handleOpenChange}
			finalFocus={props.finalFocus}
		/>
	);
}

export { OpenerSettings, type OpenerSettingsProps };
