// The opener settings dialog over its flow. Mounted only while open, so the
// settings are read when the dialog opens and the flow goes with it.

import { useCallback, useMemo } from "react";

import type {
	CodeTargetNotice,
	OpenerSelection,
	OpenerSettingsTestRequest,
} from "@/shared/code-target";
import { OpenerSettingsDialog } from "@/ui/opener-settings";
import { useOpenerSettingsFlow, type OpenerSettingsFlowListener } from "@/ui/opener-settings-flow";

/** Inputs for the host. */
interface OpenerSettingsHostProps {
	onSuccess: (message: string) => void;
	onFailure: (notice: CodeTargetNotice) => void;
	onClose: () => void;
}

/**
 * The opener settings dialog, open.
 * @param props Where outcomes go and how the dialog closes.
 * @returns The dialog.
 */
function OpenerSettingsHost(props: OpenerSettingsHostProps): React.JSX.Element {
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
		/>
	);
}

export { OpenerSettingsHost, type OpenerSettingsHostProps };
