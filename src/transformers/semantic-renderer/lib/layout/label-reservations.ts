// Which labels are reserved with the engine, and when a reservation is let go.
//
// A label is first placed on a clear run of its own route. One that finds no
// run is reserved: the engine gives it a layer of its own, which costs the
// label's height and one more gap between rows. The next solve moves routes,
// and the label is placed on runs again, so it often leaves the row it was
// reserved for (docs/design/layout-rules.md section 20). Reservations only
// ever grew, so a settled drawing could pay for rows that hold nothing. Once
// every label has a box, the reservations whose labels sit elsewhere are
// released, all together and then one at a time, and the first release that
// still gives every label a box on a smaller page is kept. That is one round:
// the drawing a release settles is not searched for further releases. Each
// round costs a placement per release and a route per smaller page, and later
// rounds gave back room on 4 of the 49 dogfood pictures (TASK-342,
// docs/design/layout-rules.md section 34).
//
// Routing does not change a page's size: placement fixes it before a route
// is drawn. A release whose placement gives back no height or area therefore
// cannot be kept, and is refused on its placement alone (TASK-342).

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

/** The size of a page placed with the requested labels, before anything is routed. */
type Page = Pick<ArchitectureDrawing, "width" | "height">;

/** Place once with the requested labels, routing nothing. */
type Place = (reserved: ReadonlySet<string>) => Promise<Page>;

/** How a reading is solved: placed alone, or placed, routed and labelled. */
interface Solves {
	readonly place: Place;
	readonly solve: Solve;
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

/**
 * The sets of reservations to try letting go of: every unused one together,
 * then each alone.
 * @param unused The reserved labels drawn off their reserved box.
 * @returns The releases to try, in order.
 */
function releasesOf(unused: readonly string[]): (readonly string[])[] {
	// Releasing nothing always holds, so it is never a release.
	if (unused.length === 0) return [];
	return unused.length === 1 ? [unused] : [unused, ...unused.map((id) => [id])];
}

/**
 * Let go of reservations the settled drawing does not use, in one round,
 * while every label still finds a box and the page gets smaller.
 * @param solves Places, or solves, with a set of reservations.
 * @param reserved The reservations the drawing was settled with.
 * @param settled The settled attempt, every label placed.
 * @returns The first release's drawing that holds, or the settled one.
 */
async function releaseUnused(
	solves: Solves,
	reserved: ReadonlySet<string>,
	settled: LabelAttempt,
): Promise<ArchitectureDrawing> {
	const unused = settled.unused.filter((id) => reserved.has(id));
	const released = await firstRelease(solves, reserved, settled, releasesOf(unused));
	return (released ?? settled).drawing;
}

/**
 * The first release, in order, that still places every label on a smaller page.
 *
 * Every release is solved at once and the first that holds, in order, is kept,
 * which is the release a one-at-a-time search would find. Most rounds find none
 * and solve every release either way (measured 2026-09-17 across the vault and
 * the wide-board fixtures), so solving them side by side costs a round nothing
 * but its wait; a round that finds one pays for the solves after it, in parallel.
 * A release is routed only when its placement already gives back height or area.
 * @param solves Places, or solves, with a set of reservations.
 * @param reserved The reservations held now.
 * @param settled The attempt with those reservations.
 * @param releases The releases to try, in order.
 * @returns That release's attempt, or nothing.
 */
async function firstRelease(
	solves: Solves,
	reserved: ReadonlySet<string>,
	settled: LabelAttempt,
	releases: readonly (readonly string[])[],
): Promise<LabelAttempt | undefined> {
	const answers = await Promise.all(
		releases.map(async (release) => {
			const kept = new Set([...reserved].filter((id) => !release.includes(id)));
			return smallerPage(await solves.place(kept), settled.drawing)
				? solves.solve(kept)
				: undefined;
		}),
	);
	return answers.find(
		(attempt) => attempt?.missing.length === 0 && noLarger(attempt.drawing, settled.drawing),
	);
}

/**
 * Whether a page gives back height or area and takes neither.
 * @param one The page after a release.
 * @param other The page before it.
 * @returns True when it is no taller, no larger, and smaller in one of them.
 */
function smallerPage(one: Page, other: Page): boolean {
	const area = one.width * one.height;
	const before = other.width * other.height;
	return (
		one.height <= other.height && area <= before && (one.height < other.height || area < before)
	);
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
	return (
		one.edges.every(({ curve, label }) => curveClearanceIssue(curve, label?.box) === undefined) &&
		smallerPage(one, other) &&
		crossingCount(one.edges) <= crossingCount(other.edges)
	);
}

/**
 * Reserve local space until every label fits, then release unused reservations.
 * Labels own their measured rows; they never enlarge every gap in the board.
 * @param solves Places, or solves, with a set of reservations.
 * @param reserved Labels already found to require dedicated engine space.
 * @returns A complete drawing with every relationship and label present.
 */
async function settleLabels(solves: Solves, reserved: Set<string>): Promise<ArchitectureDrawing> {
	const attempt = await solves.solve(reserved);
	if (attempt.missing.length > 0) {
		reserveMissing(attempt, reserved);
		return settleLabels(solves, reserved);
	}
	return releaseUnused(solves, reserved, attempt);
}

/**
 * A solve that answers the same reservations once. The engine is
 * deterministic, and a release can revisit a set already solved.
 * @param solve The solve, or a placement.
 * @returns The same solve, each distinct question asked of the engine once.
 */
function rememberSolves<Answer>(
	solve: (reserved: ReadonlySet<string>) => Promise<Answer>,
): (reserved: ReadonlySet<string>) => Promise<Answer> {
	const answers = new Map<string, Promise<Answer>>();
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
