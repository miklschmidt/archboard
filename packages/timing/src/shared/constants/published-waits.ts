// The waits that the published `@archboard/codex-realtime-voice` names: the Codex workbench's and a
// Git command's. Its build resolves `waits.ts` to this file
// (`scripts/pack-codex-realtime-voice.ts`), so the package carries no other subsystem's durations.
// `tests/shared/constants/published-waits.test.ts` proves that every wait it names is here.

import { CODEX } from "#shared/constants/codex.ts";
import { GIT } from "#shared/constants/git.ts";

/** Every duration the published package declares, by its name. */
const WAITS = Object.freeze({ ...CODEX, ...GIT });

/**
 * How long a declared duration is.
 * @param wait Its name.
 * @returns Its length, in milliseconds.
 */
function lengthOf(wait: keyof typeof WAITS): number {
	return WAITS[wait].ms;
}

export { lengthOf, WAITS };
