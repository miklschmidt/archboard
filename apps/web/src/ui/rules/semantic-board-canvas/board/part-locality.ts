// One part's share of a board's locality (ADR 0045).
//
// The server answers for every part of the variant at once, so a later pick
// reads its memory. The inspector shows one part: its commits in the period,
// newest first, and the parts it changes together with. A part the lens did not
// read is only in `skipped`, with the reason, and must never look like a part
// that no commit changed.

import type { LocalityAnswer } from "@archboard/code-intel/history";

/** A part the reading did not read, and why. */
type BehindSkip = LocalityAnswer["skipped"][number];

/** Two parts that change together. */
type CoupledPair = LocalityAnswer["coupling"][number];

/** One commit in the period. */
type LocalityCommit = LocalityAnswer["commits"][number];

/** One period of the reading. */
type LocalityPeriod = LocalityAnswer["periods"][number];

/** One part this part changes together with, as seen from this part. */
interface Partner {
	/** The other part, as the answer names it. */
	readonly subject: CoupledPair["subjects"][number];
	/** How many commits of the period changed both. */
	readonly shared: number;
	/** The shared commits over the mean of the two parts' own, in whole percent. */
	readonly degree: number;
	/** Nothing on the board joins the two. */
	readonly unjoined: boolean;
}

/** What the answer says about one part. */
type PartLocality =
	| { readonly kind: "skipped"; readonly skip: BehindSkip }
	| {
			readonly kind: "read";
			/** Its commits in the period, newest first. */
			readonly commits: readonly LocalityCommit[];
			/** The period of the repository its code is in. */
			readonly period: LocalityPeriod | undefined;
			/** The parts it changes together with, highest degree first. */
			readonly partners: readonly Partner[];
	  }
	/**
	 * The answer does not name it. The server reads the board as it is when
	 * asked, so the answer is of a later version that no longer holds the part.
	 */
	| { readonly kind: "absent" };

/**
 * One part's commits and coupled parts, out of the answer for its board.
 * @param answer The board's locality.
 * @param part The part's id.
 * @returns What the answer says about it.
 */
function partLocality(
	answer: Omit<LocalityAnswer, "board" | "version" | "variant">,
	part: string,
): PartLocality {
	const skip = answer.skipped.find((skipped) => skipped.subject.id === part);
	if (skip !== undefined) {
		return { kind: "skipped", skip };
	}
	const hotspot = answer.hotspots.find((read) => read.subject.id === part);
	if (hotspot === undefined) {
		return { kind: "absent" };
	}
	const byId = new Map(answer.commits.map((commit) => [commit.commit, commit]));
	const commits = hotspot.commits.flatMap((id) => {
		const commit = byId.get(id);
		return commit === undefined ? [] : [commit];
	});
	const partners = answer.coupling.flatMap((pair): Partner[] => {
		const [a, b] = pair.subjects;
		const other = a.id === part ? b : b.id === part ? a : undefined;
		return other === undefined
			? []
			: [{ subject: other, shared: pair.shared, degree: pair.degree, unjoined: pair.unjoined }];
	});
	return {
		kind: "read",
		commits,
		period: answer.periods.find((period) => period.repo === hotspot.repo),
		partners,
	};
}

export { partLocality, type PartLocality, type Partner };
