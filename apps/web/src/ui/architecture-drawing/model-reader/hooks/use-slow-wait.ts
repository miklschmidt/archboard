import { useEffect, useState } from "react";
import { PICTURE_MS } from "#ui/architecture-drawing/constants/motion.ts";

/**
 * Tell when a wait has lasted long enough to name.
 * @param waitingFor The identity of what the reader waits for, or null.
 * @returns Whether this same wait has outlasted the delay.
 */
function useSlowWait(waitingFor: string | null): boolean {
	const [slow, setSlow] = useState<string | null>(null);
	useEffect(() => {
		if (waitingFor === null) return undefined;
		const timer = setTimeout(() => setSlow(waitingFor), PICTURE_MS.waitNotice);
		return () => clearTimeout(timer);
	}, [waitingFor]);
	return waitingFor !== null && slow === waitingFor;
}

export { useSlowWait };
