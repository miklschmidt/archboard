import { useCallback, useState } from "react";

const STORAGE_KEY = "archboard.workbench.open";

/**
 * Restore the person's disclosure choice, starting closed without one.
 * @returns Whether the workbench starts open.
 */
function initialOpen(): boolean {
	try {
		return window.localStorage.getItem(STORAGE_KEY) === "true";
	} catch {
		return false;
	}
}

/**
 * Keep the workbench disclosure choice across reloads.
 * @returns The current disclosure and its change handler.
 */
function useWorkbenchDisclosure() {
	const [open, setOpen] = useState(initialOpen);
	const changeOpen = useCallback((next: boolean): void => {
		setOpen(next);
		try {
			window.localStorage.setItem(STORAGE_KEY, String(next));
		} catch {
			// The disclosure still works for this session without browser storage.
		}
	}, []);
	return { open, changeOpen };
}

export { useWorkbenchDisclosure };
