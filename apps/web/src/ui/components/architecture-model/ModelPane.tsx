import { ModelPaneContext } from "#ui/state/architecture-model/presentation.ts";
import { useCallback, useMemo, type JSX, type ReactNode } from "react";
import { useSubjectSelection } from "#ui/hooks/architecture-model/use-model-selection.ts";
import { useSidebar } from "#ui/hooks/semantic-board-canvas/use-sidebar.ts";
import { usePaneChrome } from "#ui/hooks/semantic-board-canvas/use-pane-chrome.ts";

/**
 * One pane owns ordinary selection and its existing sidebar across asynchronous reads.
 * @param props The explicit starting subject and composed reader.
 * @param props.subject The destination selected by navigation, or no selection.
 * @param props.children The header and model reader.
 * @returns Shared presentation state without a copy of model content.
 */
function ModelPane(props: { subject: string | null; children: ReactNode }): JSX.Element {
	const initial = useMemo(() => (props.subject === null ? [] : [props.subject]), [props.subject]);
	const selection = useSubjectSelection(initial);
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
	const value = useMemo(
		() => ({ selection: { ...selection, selectMany }, sidebar }),
		[selection, selectMany, sidebar],
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
