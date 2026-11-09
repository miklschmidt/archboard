// The opener settings over their flow, as a panel a host dialog holds. Mounted only while
// shown, so the settings are read when the panel opens and the flow goes with it.

import { useCallback, useMemo, type JSX } from "react";

import type { CodeTargetNotice } from "#shared/schemas/code-target-open.ts";
import type {
	OpenerSelection,
	OpenerSettingsTestRequest,
} from "#shared/schemas/opener-settings.ts";
import { OpenerSettingsPanel } from "#ui/components/OpenerSettingsPanel.tsx";
import { useOpenerSettingsFlow } from "#ui/hooks/use-opener-settings-flow.ts";
import type { OpenerSettingsFlowListener } from "#ui/state/opener-settings-flow.ts";

/** Inputs for the opener settings. */
interface OpenerSettingsProps {
	onSuccess: (message: string) => void;
	onFailure: (notice: CodeTargetNotice) => void;
	/** Close the host dialog: a save closes it. */
	onClose: () => void;
}

/**
 * The opener settings, shown.
 * @param props Where outcomes go and how the host dialog closes.
 * @returns The panel.
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
	return (
		<OpenerSettingsPanel
			settings={state.settings}
			busy={state.busy}
			testResult={state.testResult}
			error={state.error}
			onTest={handleTest}
			onSave={handleSave}
			onReset={handleReset}
		/>
	);
}

export { OpenerSettings };
