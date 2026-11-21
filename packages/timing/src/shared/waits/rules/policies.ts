// Each named wait: what bounds it, how often it looks, and the details its
// owner chose on purpose. They differ between waits, so each wait keeps its own:
// whether it sleeps before or after it looks, where it checks the bound and
// whether the bound's own moment counts, and how its last sleep meets the bound.
// The two halves of the tables under `tables/` write them; this file joins the
// halves, and a published build joins the published half alone.

import { HOST_PAUSES, HOST_WAITS } from "#host-tables";
import type { DurationName } from "#shared/durations/rules/names.ts";
import { PUBLISHED_PAUSES, PUBLISHED_WAITS } from "#shared/tables/rules/published.ts";
import type { PausePolicy, WaitPolicy } from "#shared/tables/rules/shape.ts";

/** Every named poll. */
const WAITS = Object.freeze({ ...PUBLISHED_WAITS, ...HOST_WAITS });

/** Every named pause. */
const PAUSES = Object.freeze({ ...PUBLISHED_PAUSES, ...HOST_PAUSES });

/** A named poll. */
type WaitName = keyof typeof WAITS;

/** A named pause. */
type CadenceName = keyof typeof PAUSES;

/** Every poll this build carries, by its name. */
const WAIT_BY_NAME: ReadonlyMap<string, WaitPolicy<DurationName>> = new Map(Object.entries(WAITS));

/** Every pause this build carries, by its name. */
const PAUSE_BY_NAME: ReadonlyMap<string, PausePolicy> = new Map(Object.entries(PAUSES));

/**
 * A rule a build does not carry: a published build carries only the published half.
 * @param kind What was asked for.
 * @param name Its name.
 * @throws {Error} Always, naming it.
 */
function missing(kind: string, name: string): never {
	throw new Error(`timing: this build carries no ${kind} named "${name}".`);
}

/**
 * How one named poll waits.
 * @param name Which poll.
 * @returns Its policy.
 */
function waitPolicy(name: WaitName): WaitPolicy<DurationName> {
	return WAIT_BY_NAME.get(name) ?? missing("wait", name);
}

/**
 * How one named pause sleeps.
 * @param name Which pause.
 * @returns Its policy.
 */
function pausePolicy(name: CadenceName): PausePolicy {
	return PAUSE_BY_NAME.get(name) ?? missing("pause", name);
}

export { pausePolicy, waitPolicy };
export type { CadenceName, WaitName };
