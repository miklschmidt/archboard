// The persistent notice stack as React state, with the two moves it allows:
// raise a notice by id, and dismiss one.

import { useCallback, useMemo, useState } from "react";

import { withNotice, withoutNotice } from "@/ui/application/notices";
import type { ShellNotice } from "@/ui/shell";

/** The notices and the moves. */
interface NoticeStack {
	readonly notices: readonly ShellNotice[];
	readonly raise: (notice: ShellNotice) => void;
	readonly dismiss: (id: string) => void;
}

/**
 * The notice stack.
 * @returns The notices, and stable functions that raise and dismiss.
 */
function useNotices(): NoticeStack {
	const [notices, setNotices] = useState<readonly ShellNotice[]>([]);
	const raise = useCallback((notice: ShellNotice): void => {
		setNotices((current) => withNotice(current, notice));
	}, []);
	const dismiss = useCallback((id: string): void => {
		setNotices((current) => withoutNotice(current, id));
	}, []);
	return useMemo(() => ({ notices, raise, dismiss }), [notices, raise, dismiss]);
}

export { useNotices, type NoticeStack };
