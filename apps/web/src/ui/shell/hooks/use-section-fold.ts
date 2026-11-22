// The fold of a section of a side column that keeps its own, which its SectionHead takes as it is.

import { useCallback, useId, useState } from "react";

/** The fold of a section that keeps its own, which a {@link SectionHead} takes as it is. */
interface SectionFold {
	readonly folded: boolean;
	readonly onFold: () => void;
	readonly controls: string;
}

/**
 * The fold of a section that keeps its own, from how it starts.
 * @param startFolded Whether the section starts folded.
 * @returns Whether it is folded, the way to turn it, and the id of its body.
 */
function useSectionFold(startFolded: boolean): SectionFold {
	const [folded, setFolded] = useState(startFolded);
	const onFold = useCallback((): void => setFolded((was) => !was), []);
	return { folded, onFold, controls: useId() };
}

export { useSectionFold, type SectionFold };
