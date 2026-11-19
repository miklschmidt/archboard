// The persistent notice stack as React state, with the two moves it allows:
// raise a notice by id, and dismiss one by id or by the notice shown.

import { useCallback, useMemo, useState } from "react";

import { withNotice, withoutNotice } from "#ui/application/rules/notices.ts";
import type { ShellNotice } from "#ui/shell/rules/contracts.ts";

/** The notices and the moves. */
interface NoticeStack {
	readonly notices: readonly ShellNotice[];
	readonly raise: (notice: ShellNotice) => void;
	readonly dismiss: (target: string | ShellNotice) => void;
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
	const dismiss = useCallback((target: string | ShellNotice): void => {
		setNotices((current) => withoutNotice(current, target));
	}, []);
	return useMemo(() => ({ notices, raise, dismiss }), [notices, raise, dismiss]);
}

export { useNotices, type NoticeStack };
