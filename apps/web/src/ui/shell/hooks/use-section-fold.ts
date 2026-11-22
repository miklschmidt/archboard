// The fold of a section of a side column that keeps its own, which its SectionHead takes as it is.

import { useCallback, useId, useState } from "react";

/** The fold of a section that keeps its own, which a {@link SectionHead} takes as it is. */
interface SectionFold {
	readonly folded: boolean;
	readonly onFold: () => void;
	readonly controls: string;
}

/**
 * The fold of a section that keeps its own. It starts folded when it is asked to, and it unfolds
 * when it stops being asked, as a list does that comes to hold what is on screen. It never folds
 * of itself, so a section that a reader unfolded stays open.
 * @param asked Whether the section asks to stand folded.
 * @returns Whether it is folded, the way to turn it, and the id of its body.
 */
function useSectionFold(asked: boolean): SectionFold {
	const [fold, setFold] = useState({ asked, folded: asked });
	if (fold.asked !== asked) setFold({ asked, folded: fold.folded && asked });
	const onFold = useCallback(
		(): void => setFold((was) => ({ asked: was.asked, folded: !was.folded })),
		[],
	);
	return { folded: fold.folded, onFold, controls: useId() };
}

export { useSectionFold, type SectionFold };
