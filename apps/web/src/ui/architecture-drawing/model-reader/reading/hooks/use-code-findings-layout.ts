// How the code findings are laid out, as React state.

import { useSyncExternalStore } from "react";

import {
	codeFindingsLayoutNow,
	onCodeFindingsLayoutChange,
	type CodeFindingsLayout,
} from "#ui/architecture-drawing/model-reader/reading/clients/code-findings-layout.ts";

/**
 * How the code findings are laid out, redrawing whoever reads it when it changes.
 * @returns The layout.
 */
function useCodeFindingsLayout(): CodeFindingsLayout {
	return useSyncExternalStore(
		onCodeFindingsLayoutChange,
		codeFindingsLayoutNow,
		codeFindingsLayoutNow,
	);
}

export { useCodeFindingsLayout };
