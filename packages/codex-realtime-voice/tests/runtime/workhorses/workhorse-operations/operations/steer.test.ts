import { describe, expect, test } from "bun:test";

import { rejected } from "#tests/runtime/workhorses/workhorse-operations/operations/evidence.ts";
import { useFixtureGroup } from "#tests/runtime/workhorses/workhorse-operations/operations/fixture-group.ts";
import { turn } from "#tests/runtime/workhorses/workhorse-operations/operations/support.ts";

const fixture = useFixtureGroup();

describe("workhorse steering", () => {
	test("refuses a steer whose link changes while the last turn read before delivery runs", async () => {
		const h = fixture();
		try {
			h.setStatus("active", [turn(h.identity, "active-steer", "inProgress")]);
			const read = h.session.threadTurnsListPage;
			let reads = 0;
			h.session.threadTurnsListPage = async (params) => {
				const page = await read(params);
				reads += 1;
				// The first read picks the target; the third is the last one before delivery.
				if (reads === 3) {
					h.replaceBinding({
						...h.binding,
						workhorse: {
							...h.binding.workhorse,
							threadId: h.identity.decoder.adoptThreadId("steer-replacement"),
						},
					});
				}
				return page;
			};
			const error = await rejected(
				h.operations.steer({ call: h.setCall("steer_workhorse"), input: "must not send" }),
			);
			expect(error).toMatchObject({ code: "stale_link", outcome: "not_delivered" });
			expect(h.session.steers).toEqual([]);
		} finally {
			h.cleanup();
		}
	});
});
