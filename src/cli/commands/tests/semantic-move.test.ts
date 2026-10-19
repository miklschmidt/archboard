import { expect, test } from "bun:test";
import { sayingWhatWasRewritten } from "@/cli/commands/semantic-move";
import { responseError } from "@archboard/server-lifecycle/server-client";

// A move that stopped part way (ADR 0051) has already rewritten some
// drill-downs, and running it again rewrites only what is left, so the
// stopped answer is the only one that can name them. What is owned here is
// that the refusal the command reports, built by the real transport from the
// route's answer, still carries the code its exit status is declared for and
// names every drill-down the move rewrote before it stopped.

const opening = (board: string, repo: string) => ({
	board,
	variant: { kind: "current" as const },
	repo,
});

test("a stopped move's refusal names every drill-down it rewrote", () => {
	const answer = {
		success: false,
		code: "MOVE_STOPPED",
		error: "The move stopped part way.",
		rewritten: [
			{
				vault: "/product/.archboard/vault",
				board: "Payments",
				variant: "v-pay",
				node: "n-books",
				drillDown: opening("Ledger", "github.com/acme/meta"),
			},
			{
				vault: "/meta/.archboard/vault",
				board: "Platform",
				variant: "v-plat",
				node: "n-pay",
				drillDown: opening("Payments", "github.com/acme/product"),
			},
		],
	};
	const thrown = responseError(answer, new Response(null, { status: 409 }));

	const reported = sayingWhatWasRewritten(thrown);

	expect(reported).toMatchObject({ code: "MOVE_STOPPED" });
	const said = reported instanceof Error ? reported.message : "";
	for (const one of answer.rewritten) {
		expect(said).toContain(one.node);
		expect(said).toContain(one.board);
	}
});
