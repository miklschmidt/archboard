// Every duration by its name, "<owner>.<key>", such as "codexRealtime.stop".
//
// The owners' groups stay in their files under `constants/`, with what each
// duration pulls against written beside it. The two halves of the tables under
// `tables/` name them, and this file joins the halves, so that the waits, the
// deadlines and `durationMs` read a duration the same way. A published build
// joins the published half alone.

import { HOST_GROUPS } from "#host-tables";
import { PUBLISHED_GROUPS } from "#shared/tables/rules/published.ts";
import type { NameOf } from "#shared/tables/rules/shape.ts";

/** Each owner's group under the name its durations start with. */
const OWNERS = Object.freeze({ ...PUBLISHED_GROUPS, ...HOST_GROUPS });

/** One duration, named by its owner and its key, such as `"codexRealtime.stop"`. */
type DurationName = NameOf<typeof OWNERS>;

/** Every duration this build carries, by its name. */
const BY_NAME: ReadonlyMap<string, number> = new Map(
	Object.entries(OWNERS).flatMap(([owner, group]: [string, Readonly<Record<string, number>>]) =>
		Object.entries(group).map(([key, ms]): [string, number] => [`${owner}.${key}`, ms]),
	),
);

/**
 * One duration, by its name.
 * @param name Which one.
 * @returns It, in milliseconds.
 * @throws {Error} When this build does not carry it: a published build carries only the
 * durations of the published half.
 */
function durationOf(name: DurationName): number {
	const ms = BY_NAME.get(name);
	if (ms === undefined) throw new Error(`timing: this build carries no duration named "${name}".`);
	return ms;
}

export { durationOf };
export type { DurationName };
