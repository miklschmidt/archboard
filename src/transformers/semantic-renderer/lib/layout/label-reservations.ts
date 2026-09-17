// Which labels are reserved with the engine, and when a reservation is let go.
//
// A label is first placed on a clear run of its own route. One that finds no
// run is reserved: the engine gives it a layer of its own, which costs the
// label's height and one more gap between rows. The next solve moves routes,
// and the label is placed on runs again, so it often leaves the row it was
// reserved for (docs/design/layout-rules.md section 20). Reservations only
// ever grew, so a settled drawing could pay for rows that hold nothing. Once
// every label has a box, the reservations whose labels sit elsewhere are
// released, all together and then one at a time, and a release is kept when
// every label still finds a box and the page is no taller.

import type { ArchitectureDrawing } from "@/transformers/semantic-renderer/lib/drawing";
import { crossingCount } from "@/transformers/semantic-renderer/lib/layout/crossings";

/** One solve with its labels placed. */
interface LabelAttempt {
	readonly drawing: ArchitectureDrawing;
	/** The measured labels it left without a box. */
	readonly missing: ArchitectureDrawing["edges"];
	/** The reserved labels it drew somewhere other than their reserved box. */
	readonly unused: readonly string[];
}

/** Solves once with some labels reserved and the gaps between rows grown by some badges. */
type Solve = (reserved: ReadonlySet<string>, stacked: number) => Promise<LabelAttempt>;

/**
 * Grow the gaps between rows by one badge, and keep that only when the labels
 * on straight descents it was grown for gain from it.
 * @param attempt The attempt whose labels are missing.
 * @param stacked Its stack depth.
 * @param solve Solves at a stack depth.
 * @returns The taller attempt when it places more labels, else nothing.
 */
async function stackedAttempt(
	attempt: LabelAttempt,
	stacked: number,
	solve: (stacked: number) => Promise<LabelAttempt>,
): Promise<LabelAttempt | undefined> {
	// A badge on a straight descent between two rows found no room because its
	// siblings' badges took it: one more badge of gap is far cheaper than the
	// whole row that reserving the label with the engine costs.
	if (!attempt.missing.some(({ curve }) => curve.segments.length === 1)) return undefined;
	const taller = await solve(stacked + 1);
	return taller.missing.length < attempt.missing.length ? taller : undefined;
}

/**
 * Reserve engine space for every label the attempt left without a box.
 * @param attempt The attempt whose labels are missing.
 * @param reserved Labels already reserved; a label reserved twice is a bug.
 * @throws {Error} When a reserved label still has no box.
 */
function reserveMissing(attempt: LabelAttempt, reserved: Set<string>): void {
	for (const { edge } of attempt.missing) {
		if (reserved.has(edge.id))
			throw new Error(`Layout omitted the reserved label for relationship ${edge.id}`);
		reserved.add(edge.id);
	}
}

/** An attempt that places every label, with the reservations and gap it was solved with. */
interface Placed {
	readonly attempt: LabelAttempt;
	readonly reserved: ReadonlySet<string>;
	readonly stacked: number;
}

/**
 * The shorter page of two settled drawings, the certain one when they tie.
 * @param grown The drawing settled with a grown gap, when there was one.
 * @param kept The drawing settled by reservation alone.
 * @returns Whichever is shorter.
 */
function shorterOf(grown: Placed | undefined, kept: Placed): Placed {
	return grown !== undefined && grown.attempt.drawing.height < kept.attempt.drawing.height
		? grown
		: kept;
}

/**
 * The sets of reservations to try letting go of: every unused one together,
 * then each alone.
 * @param unused The reserved labels drawn off their reserved box.
 * @returns The releases to try, in order.
 */
function releasesOf(unused: readonly string[]): (readonly string[])[] {
	// Releasing nothing always holds, so it is never a release: the search
	// ends when no reservation is unused.
	if (unused.length === 0) return [];
	return unused.length === 1 ? [unused] : [unused, ...unused.map((id) => [id])];
}

/**
 * Let go of reservations the settled drawing does not use, while every label
 * still finds a box and the page grows no taller.
 * @param solve Solves with a set of reservations.
 * @param reserved The reservations the drawing was settled with.
 * @param stacked Its stack depth.
 * @param settled The settled attempt, every label placed.
 * @returns The drawing with the fewest reservations that still places every label.
 */
async function releaseUnused(
	solve: Solve,
	reserved: ReadonlySet<string>,
	stacked: number,
	settled: LabelAttempt,
): Promise<ArchitectureDrawing> {
	const unused = settled.unused.filter((id) => reserved.has(id));
	const released = await firstRelease(solve, reserved, stacked, settled, releasesOf(unused));
	return released === undefined
		? settled.drawing
		: releaseUnused(solve, released.kept, stacked, released.attempt);
}

/**
 * The first release, in order, that still places every label on a page no taller.
 *
 * Every release is solved at once and the first that holds, in order, is kept,
 * which is the release a one-at-a-time search would find. Most rounds find none
 * and solve every release either way (measured 2026-09-17 across the vault and
 * the wide-board fixtures), so solving them side by side costs a round nothing
 * but its wait; a round that finds one pays for the solves after it, in parallel.
 * @param solve Solves with a set of reservations.
 * @param reserved The reservations held now.
 * @param stacked The stack depth.
 * @param settled The attempt with those reservations.
 * @param releases The releases to try, in order.
 * @returns That release's attempt and remaining reservations, or nothing.
 */
async function firstRelease(
	solve: Solve,
	reserved: ReadonlySet<string>,
	stacked: number,
	settled: LabelAttempt,
	releases: readonly (readonly string[])[],
): Promise<{ attempt: LabelAttempt; kept: ReadonlySet<string> } | undefined> {
	const tried = releases.map((release) => {
		const kept = new Set([...reserved].filter((id) => !release.includes(id)));
		return { kept, attempt: solve(kept, stacked) };
	});
	const answers = await Promise.all(tried.map(({ attempt }) => attempt));
	const index = answers.findIndex(
		(attempt) => attempt.missing.length === 0 && noLarger(attempt.drawing, settled.drawing),
	);
	return index === -1 ? undefined : { attempt: answers[index]!, kept: tried[index]!.kept };
}

/**
 * Whether a page is smaller than another at no cost to its routes: no taller,
 * no larger in area, less of one, and no more crossings. A released row can
 * let the engine spread a row sideways instead (Command dispatch, 1441x685 to
 * 1636x643), which is not a smaller page; a page of the same size only
 * reroutes (flask-map-2 gained route length, a crossing and lane ink for
 * nothing); and a narrower page can unnest two routes to one card so they
 * cross.
 * @param one The page after a release.
 * @param other The page before it.
 * @returns True when the release gives back height or area and costs neither, nor a crossing.
 */
function noLarger(one: ArchitectureDrawing, other: ArchitectureDrawing): boolean {
	const area = one.width * one.height;
	const before = other.width * other.height;
	return (
		one.height <= other.height &&
		area <= before &&
		(one.height < other.height || area < before) &&
		crossingCount(one.edges) <= crossingCount(other.edges)
	);
}

/**
 * Settle the board to the end with one more badge of gap between its rows.
 * @param solve Solves with a set of reservations.
 * @param reserved Labels reserved so far; this way keeps its own copy.
 * @param current The attempt at the ordinary gap whose labels are missing.
 * @returns The settled drawing, or nothing when the grown gap places no more labels.
 */
async function grownGap(
	solve: Solve,
	reserved: ReadonlySet<string>,
	current: LabelAttempt,
): Promise<Placed | undefined> {
	const taller = await stackedAttempt(current, 0, (depth) => solve(reserved, depth));
	if (taller === undefined) return undefined;
	return placeEvery(solve, new Set(reserved), 1, taller);
}

/**
 * Add reservations until every measured label has a box.
 *
 * A badge on a straight descent that found no room can be given one more
 * badge of gap between every pair of rows instead of a reserved row of its
 * own. Which is cheaper depends on what the rest of the board then needs
 * (the 2026-09-16 "Agent workbench" board placed one more label in the grown
 * gap and still reserved two, paying for both), so both ways are settled to
 * the end and the shorter page is kept. The gap grows once at most.
 * @param solve Solves with a set of reservations.
 * @param reserved Labels already found to require dedicated engine space.
 * @param stacked How many badges beyond one the gaps between rows hold.
 * @param attempt The solve at that depth, when one is already in hand.
 * @returns The attempt that places every label, with its reservations and gap.
 */
async function placeEvery(
	solve: Solve,
	reserved: Set<string>,
	stacked = 0,
	attempt?: LabelAttempt,
): Promise<Placed> {
	const current = attempt ?? (await solve(reserved, stacked));
	if (current.missing.length === 0)
		return { attempt: current, reserved: new Set(reserved), stacked };
	// The two ways are independent, so they settle side by side; the grown gap
	// keeps its own copy of the reservations made so far.
	const growing = stacked === 0 ? grownGap(solve, new Set(reserved), current) : undefined;
	reserveMissing(current, reserved);
	const [grown, kept] = await Promise.all([growing, placeEvery(solve, reserved, stacked)]);
	return shorterOf(grown, kept);
}

/**
 * Add reservations until every measured label has a final box, then let go
 * of the ones the kept drawing does not use. Only the kept drawing is
 * released: releasing every branch before choosing between them was most of
 * a render's solves (docs/design/layout-rules.md section 22).
 * @param solve Solves with a set of reservations.
 * @param reserved Labels already found to require dedicated engine space.
 * @returns One final drawing with every relationship and label present.
 */
async function settleLabels(solve: Solve, reserved: Set<string>): Promise<ArchitectureDrawing> {
	const placed = await placeEvery(solve, reserved);
	return releaseUnused(solve, placed.reserved, placed.stacked, placed.attempt);
}

/**
 * A solve that answers the same reservations and gap once. The engine is
 * deterministic, and settling asks for the same solve again: the grown gap
 * and the reservation rounds meet at one set of reservations from two sides,
 * and a release lands on a set already solved.
 * @param solve The solve.
 * @returns The same solve, each distinct question asked of the engine once.
 */
function rememberSolves(solve: Solve): Solve {
	const answers = new Map<string, Promise<LabelAttempt>>();
	return (reserved, stacked) => {
		const key = `${stacked}|${[...reserved].toSorted().join(",")}`;
		const known = answers.get(key);
		if (known !== undefined) return known;
		const answer = solve(reserved, stacked);
		answers.set(key, answer);
		return answer;
	};
}

export { rememberSolves, settleLabels, type LabelAttempt };
