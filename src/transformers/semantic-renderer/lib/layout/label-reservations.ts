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
import { curveClearanceIssue } from "@/transformers/semantic-renderer/lib/layout/curves";
import { crossingCount } from "@/transformers/semantic-renderer/lib/layout/crossings";

/** One solve with its labels placed. */
interface LabelAttempt {
	readonly drawing: ArchitectureDrawing;
	/** The measured labels it left without a box. */
	readonly missing: ArchitectureDrawing["edges"];
	/** The reserved labels it drew somewhere other than their reserved box. */
	readonly unused: readonly string[];
}

/** Solve once with dedicated placement space for the requested labels. */
type Solve = (reserved: ReadonlySet<string>) => Promise<LabelAttempt>;

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
 * @param settled The settled attempt, every label placed.
 * @returns The drawing with the fewest reservations that still places every label.
 */
async function releaseUnused(
	solve: Solve,
	reserved: ReadonlySet<string>,
	settled: LabelAttempt,
): Promise<ArchitectureDrawing> {
	const unused = settled.unused.filter((id) => reserved.has(id));
	const released = await firstRelease(solve, reserved, settled, releasesOf(unused));
	return released === undefined
		? settled.drawing
		: releaseUnused(solve, released.kept, released.attempt);
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
 * @param settled The attempt with those reservations.
 * @param releases The releases to try, in order.
 * @returns That release's attempt and remaining reservations, or nothing.
 */
async function firstRelease(
	solve: Solve,
	reserved: ReadonlySet<string>,
	settled: LabelAttempt,
	releases: readonly (readonly string[])[],
): Promise<{ attempt: LabelAttempt; kept: ReadonlySet<string> } | undefined> {
	const tried = releases.map((release) => {
		const kept = new Set([...reserved].filter((id) => !release.includes(id)));
		return { kept, attempt: solve(kept) };
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
		one.edges.every(({ curve, label }) => curveClearanceIssue(curve, label?.box) === undefined) &&
		one.height <= other.height &&
		area <= before &&
		(one.height < other.height || area < before) &&
		crossingCount(one.edges) <= crossingCount(other.edges)
	);
}

/**
 * Reserve local space until every label fits, then release unused reservations.
 * Labels own their measured rows; they never enlarge every gap in the board.
 * @param solve Solves with a set of reservations.
 * @param reserved Labels already found to require dedicated engine space.
 * @returns A complete drawing with every relationship and label present.
 */
async function settleLabels(solve: Solve, reserved: Set<string>): Promise<ArchitectureDrawing> {
	const attempt = await solve(reserved);
	if (attempt.missing.length > 0) {
		reserveMissing(attempt, reserved);
		return settleLabels(solve, reserved);
	}
	return releaseUnused(solve, reserved, attempt);
}

/**
 * A solve that answers the same reservations once. The engine is
 * deterministic, and a release can revisit a set already solved.
 * @param solve The solve.
 * @returns The same solve, each distinct question asked of the engine once.
 */
function rememberSolves(solve: Solve): Solve {
	const answers = new Map<string, Promise<LabelAttempt>>();
	return (reserved) => {
		const key = [...reserved].toSorted().join(",");
		const known = answers.get(key);
		if (known !== undefined) return known;
		const answer = solve(reserved);
		answers.set(key, answer);
		return answer;
	};
}

export { rememberSolves, settleLabels, type LabelAttempt };
