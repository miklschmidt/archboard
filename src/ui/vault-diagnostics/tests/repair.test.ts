import { expect, test } from "bun:test";

import { requestVaultRepair } from "@/ui/vault-diagnostics/api";
import {
	connected,
	model,
	snapshot,
	THREAD,
	TURN,
	unboundLink,
} from "@/ui/vault-diagnostics/tests/model";
import type { WorkbenchComposerSubmission } from "@/ui/workbench-composer";

const SERVER = "http://localhost:4317";

test.each([false, true])(
	"repair dispatch honors busy=%s and explicitly addresses the displayed canvas",
	async (busy) => {
		const submissions: WorkbenchComposerSubmission[] = [];
		const state = connected(
			snapshot({
				timeline: model.BrowserTimelineSchema.parse({
					kind: "timeline",
					threadId: THREAD,
					nextCursor: null,
					turns: busy
						? [
								{
									turnId: TURN,
									status: "inProgress",
									items: [],
									summary: "Work",
									outputsIncluded: true,
									outputsTruncated: false,
								},
							]
						: [],
				}),
			}),
		);
		const message = await requestVaultRepair(
			{
				transport: {
					/**
					 * Read the authoritative snapshot.
					 * @returns The state.
					 */ state: () => state,
				},
				composer: {
					/**
					 * Capture the composer submission.
					 * @param submission The request.
					 * @returns Delivery.
					 */ submit: async (submission) => {
						submissions.push(submission);
						return busy ? { outcome: "queued" } : { outcome: "delivered", turnId: TURN };
					},
				},
			},
			() => {
				throw new Error("An executable workhorse needs no chooser");
			},
			SERVER,
		);
		expect(submissions).toHaveLength(1);
		expect(submissions[0]?.delivery).toBe(busy ? "queue" : "send");
		expect(submissions[0]?.text).toContain(`archboard --url ${SERVER} check`);
		expect(message).toContain(busy ? "queue" : "checker confirms");
	},
);

test("an absent workhorse opens the existing chooser without dispatching", async () => {
	let chosen = false;
	const message = await requestVaultRepair(
		{
			transport: {
				/**
				 * Read the authoritative snapshot.
				 * @returns The state.
				 */ state: () => connected(snapshot({ threadLink: unboundLink() })),
			},
			composer: {
				/**
				 * Settle the composer request.
				 * @returns The outcome.
				 */ submit: async () => {
					throw new Error("Do not dispatch before linking");
				},
			},
		},
		() => {
			chosen = true;
		},
		SERVER,
	);
	expect(chosen).toBe(true);
	expect(message).toContain("Link or create");
});

test("a refused repair preserves the actionable composer explanation", async () => {
	const message = await requestVaultRepair(
		{
			transport: {
				/**
				 * Read the authoritative snapshot.
				 * @returns The state.
				 */ state: () => connected(),
			},
			composer: {
				/**
				 * Settle the composer request.
				 * @returns The outcome.
				 */ submit: async () => ({
					outcome: "not_delivered",
					reason: "Claim changed. Inspect the current workhorse.",
				}),
			},
		},
		() => undefined,
		SERVER,
	);
	expect(message).toBe("Claim changed. Inspect the current workhorse.");
});
