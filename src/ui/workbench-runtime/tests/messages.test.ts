import { expect, test } from "bun:test";

import { createIdentityAuthorities } from "@/shared/codex-workbench-identity";
import { toThreadMessageLike } from "@/ui/workbench-runtime";
import type { ConversationTurn } from "@/ui/workbench-timeline";

const { decoder } = createIdentityAuthorities().identity;
const threadId = decoder.adoptThreadId("thread-messages");

type Item = ConversationTurn["items"][number];

/**
 * A command item.
 * @param id Its id.
 * @param status Where it stands.
 * @returns The item.
 */
function command(id: string, status: "inProgress" | "completed" | "failed"): Item {
	return {
		media: "command",
		itemId: decoder.adoptItemId(id),
		command: `run ${id}`,
		status,
		cwd: null,
		exitCode: status === "inProgress" ? null : status === "failed" ? 1 : 0,
		durationMs: null,
		output: null,
		outputTruncated: false,
	};
}

/**
 * A turn of these items.
 * @param items The items.
 * @param outcome How it stands.
 * @param withPlan Whether it carries a plan.
 * @returns The turn.
 */
function turn(
	items: readonly Item[],
	outcome: ConversationTurn["outcome"],
	withPlan = false,
): ConversationTurn {
	return {
		id: "turn",
		threadId,
		turnId: decoder.adoptTurnId("t1"),
		outcome,
		items,
		startedAtMs: 0,
		completedAtMs: null,
		durationMs: null,
		error: null,
		plan: withPlan ? { explanation: null, steps: [{ step: "Read", status: "inProgress" }] } : null,
	};
}

const prompt: Item = { media: "prompt", itemId: decoder.adoptItemId("p"), text: "Why?" };
const answer: Item = { media: "text", itemId: decoder.adoptItemId("a"), text: "Because." };

/**
 * The parts a turn becomes, by name.
 * @param value The turn.
 * @returns Each part's name ("text" for prose).
 */
function partNames(value: ConversationTurn): string[] {
	const content = toThreadMessageLike(value).content;
	if (typeof content === "string") return ["text"];
	return content.map((part) => (part.type === "data" ? part.name : part.type));
}

test("work between two things said is one run; the plan follows the first prompt; the end closes the turn", () => {
	const running = turn(
		[
			command("c0", "completed"),
			prompt,
			command("c1", "completed"),
			command("c2", "inProgress"),
			answer,
		],
		"running",
		true,
	);
	expect(partNames(running)).toEqual([
		"activity",
		"prompt",
		"plan-progress",
		"activity",
		"text",
		"turn-end",
	]);
});

/**
 * Whether a part's payload carries a run's flags.
 * @param value The payload.
 * @returns True for a run.
 */
function isRunFlags(value: unknown): value is { readonly ended: boolean; readonly live: boolean } {
	return typeof value === "object" && value !== null && "ended" in value && "live" in value;
}

/**
 * The runs of a turn with their flags.
 * @param value The turn.
 * @returns Each run's ended and live flags.
 */
function runs(value: ConversationTurn): { ended: boolean; live: boolean }[] {
	const content = toThreadMessageLike(value).content;
	if (typeof content === "string") return [];
	return content.flatMap((part) => {
		const data: unknown = part.type === "data" ? part.data : null;
		return isRunFlags(data) ? [{ ended: data.ended, live: data.live }] : [];
	});
}

test("only the running turn's latest run is live, and only while its last step still runs", () => {
	expect(
		runs(turn([command("c1", "completed"), prompt, command("c2", "inProgress")], "running")),
	).toEqual([
		{ ended: false, live: false },
		{ ended: false, live: true },
	]);
	expect(runs(turn([prompt, command("c2", "failed")], "running"))).toEqual([
		{ ended: false, live: false },
	]);
	expect(runs(turn([prompt, command("c2", "completed")], "completed"))).toEqual([
		{ ended: true, live: false },
	]);
});
