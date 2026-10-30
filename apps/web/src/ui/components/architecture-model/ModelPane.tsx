import { cameraHandover, ModelPaneContext } from "#ui/state/architecture-model/presentation.ts";
import { useCallback, useMemo, useState, type JSX, type ReactNode } from "react";
import { useSubjectSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { useSidebar } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";
import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";

/**
 * One pane owns ordinary selection and its existing sidebar across asynchronous reads.
 * @param props The explicit starting subject and composed reader.
 * @param props.subject The destination selected by navigation, or no selection.
 * @param props.arrival Which time the pane has been pointed at a reading from outside.
 * @param props.children The header and model reader.
 * @returns Shared presentation state without a copy of model content.
 */
function ModelPane(props: {
	subject: string | null;
	arrival?: number | undefined;
	children: ReactNode;
}): JSX.Element {
	const initial = useMemo(() => (props.subject === null ? [] : [props.subject]), [props.subject]);
	const selection = useSubjectSelection(initial);
	const { subject, arrival } = props;
	const [seeded, setSeeded] = useState({ subject, arrival });
	// A new destination seeds the pane's selection. Leaving one keeps whatever the reader holds.
	if (seeded.subject !== subject || seeded.arrival !== arrival) {
		setSeeded({ subject, arrival });
		if (subject !== null || seeded.arrival !== arrival) selection.seed(initial);
	}
	const chrome = usePaneChrome();
	const identity = selection.ids.size === 0 ? null : selection.ids;
	const sidebar = useSidebar(identity, chrome.shared, false, false);
	const { selectMany: choose } = selection;
	const selectMany = useCallback(
		(subjects: readonly string[], toggle = false): void => {
			if (subjects.length > 0 && sidebar.tab === "board")
				keepSelectionFocus(sidebar.selectionTabId);
			choose(subjects, toggle);
		},
		[choose, sidebar],
	);
	const [handover] = useState(cameraHandover);
	const [head, attachHead] = useState<HTMLElement | null>(null);
	const value = useMemo(
		() => ({ selection: { ...selection, selectMany }, sidebar, handover, head, attachHead }),
		[selection, selectMany, sidebar, handover, head],
	);
	return <ModelPaneContext value={value}>{props.children}</ModelPaneContext>;
}

/**
 * Move focus before a selected subject replaces the Architecture panel.
 * @param selectionTabId The pane's existing Selection tab.
 */
function keepSelectionFocus(selectionTabId: string): void {
	const tab = document.getElementById(selectionTabId);
	const panel = document.activeElement?.closest('[role="tabpanel"]');
	if (panel && tab?.closest('[data-slot="semantic-sidebar"]')?.contains(panel)) tab.focus();
}

export { ModelPane };
