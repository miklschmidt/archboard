// The rule behind the claim marks of a reading: a claim marks its subjects only in a reading of the
// state it names, and a mark says each purpose once.

import { expect, test } from "bun:test";
import type { ArchitectureClaim } from "@archboard/model/contract";
import {
	claimedSubjects,
	claimsOn,
} from "#ui/architecture-drawing/model-reader/rules/claimed-subjects.ts";

/**
 * A live claim of the shop.
 * @param state The state it names.
 * @param reason What the agent is doing.
 * @param subjects What it holds.
 * @returns The claim.
 */
function claim(state: string | null, reason: string, subjects: string[]): ArchitectureClaim {
	return {
		id: `${reason}-claim`,
		target: { model: "Shop", state },
		writer: "agent",
		reason,
		subjects,
		since: "2026-11-08T12:00:00.000Z",
		until: "2026-11-08T12:10:00.000Z",
	};
}

const CLAIMS = [
	claim("Current", "Explain the gateway", ["Shop#Gateway", "Shop#Request"]),
	claim("Draft", "Queue the work", ["Shop#Worker"]),
];

test("a claim marks its subjects only in a reading of the state that it names", () => {
	const current = claimedSubjects(CLAIMS, "Current");
	expect([...current]).toEqual([
		["Shop#Gateway", "Explain the gateway"],
		["Shop#Request", "Explain the gateway"],
	]);
	expect([...claimedSubjects(CLAIMS, "Draft").keys()]).toEqual(["Shop#Worker"]);
	expect(claimedSubjects(CLAIMS, null).size).toBe(0);
});

test("a mark over several subjects says the purpose of each claim once", () => {
	const claimed = claimedSubjects(
		[...CLAIMS, claim("Current", "Rename the handler", ["Shop#Handler"])],
		"Current",
	);
	expect(
		claimsOn(claimed, ["Shop#Gateway", "Shop#Request", "Shop#Handler", "Shop#Worker"]),
	).toEqual(["Explain the gateway", "Rename the handler"]);
	expect(claimsOn(claimed, ["Shop#Worker"])).toEqual([]);
});
