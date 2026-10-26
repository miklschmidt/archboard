// What the last code check said about the subject a person picked: its findings,
// warnings first, and when the pass that found them ran (ADR 0046).

import type { RememberedFindingsSchema } from "@archboard/code-intel/code-check";
import type { z } from "zod";

/** What the last pass found on one board at one variant. */
type RememberedReading = z.infer<typeof RememberedFindingsSchema>["readings"][number];

/** What the code check said about one subject, and when. */
interface CodeStanding {
	/** Its findings, warnings first, and never none. */
	readonly findings: RememberedReading["findings"];
	/** When the pass that found them ran. */
	readonly checkedAt: string;
}

/**
 * What the last code check found about one subject, warnings first.
 * @param reading What the pass found on the board on screen, or null.
 * @param ids The ids the selection stands for.
 * @returns Its findings and when the pass ran, or null when there are none.
 */
function codeOn(reading: RememberedReading | null, ids: readonly string[]): CodeStanding | null {
	const findings = (reading?.findings ?? [])
		.filter((finding) => finding.subject !== undefined && ids.includes(finding.subject.id))
		.toSorted((a, b) => Number(b.severity === "warning") - Number(a.severity === "warning"));
	return reading === null || findings.length === 0
		? null
		: { findings, checkedAt: reading.checkedAt };
}

export { codeOn, type CodeStanding };
