// The take-back clip: an agent claims a board and every pane says so; the person presses Take back
// control in the pane, and the agent's next write is refused. The agent's terminal stands on the
// left; every command it shows ran against the server as shown.

import {
	Terminal,
	encodeTake,
	filmTogether,
	moment,
	present,
	readBoard,
	attachmentFile,
	readmeFile,
	withTake,
	type Producer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";

const BOARD = "Web shop";
const REASON = "proposing event-sourced orders";
const PROPOSAL = "Order events";
const CLIP = attachmentFile("take-back.webp");
const THUMBNAIL = readmeFile("idx-safety.webp");
const TERMINAL_WIDTH = 600;
const PANE = { width: 1320, height: 1080 } as const;
const BANNER = "[data-slot='claim-banner']";

const takeBack: Producer = {
	kind: "clip",
	codex: false,
	files: [THUMBNAIL],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg"],
	plan: [
		`Start an Archboard server over a copy of examples/web-shop; open the agent's terminal page and the shell on ${BOARD}, presented, side by side in a private headless Chromium, dark.`,
		`Film archboard claim on ${BOARD}, the pointer pressing Take back control in the pane, and the agent's next write (archboard semantic branch) refused.`,
		`Encode the two windows side by side as a 1440 px lossless WebP at 30 frames a second, in the scratch directory to attach by hand, opening on its last frame, and cut ${THUMBNAIL} from the claim banner.`,
	],
	/**
	 * Film the take and encode it.
	 * @returns Once the files are written.
	 */
	make: async () =>
		withTake("take-back", "examples/web-shop", false, async (server, browser) => {
			const terminal = await Terminal.open(browser, "dark", PANE.height);
			const page = await browser.open({
				url: `${server.url}/?paneA=${encodeURIComponent(BOARD)}`,
				theme: "dark",
				cursor: true,
				...PANE,
			});
			await page.atRest();
			await present(page);
			await page.moveTo({ x: 1100, y: 700 }, 1);
			await Bun.sleep(1200);
			const { version } = await readBoard(server, BOARD);
			const take = await filmTogether("take-back", [terminal.page, page], async () => {
				await Bun.sleep(400);
				await terminal.you("Propose an event-sourced orders store on the web shop board.");
				await Bun.sleep(500);
				await terminal.command(`archboard claim --board "${BOARD}" --reason "${REASON}"`);
				await server.cli(["claim", "--board", BOARD, "--reason", REASON, "--for", "10m"]);
				await terminal.done(`claimed ${BOARD}`);
				await page.waitFor(`!!document.querySelector("${BANNER} button")`, "the claim banner");
				await Bun.sleep(1600);
				const claimed = await moment(page, [BANNER], 960, { x: TERMINAL_WIDTH, y: 0 });
				await page.click(`${BANNER} button`, 420);
				await Bun.sleep(1400);
				const branch = [
					"semantic",
					"branch",
					BOARD,
					"--as",
					PROPOSAL,
					"--expect-version",
					String(version),
					"--doing",
					REASON,
				];
				await terminal.command(
					`archboard semantic branch "${BOARD}" --as "${PROPOSAL}" --expect-version ${version} --doing "${REASON}"`,
				);
				const refused = await server.attempt(branch);
				if (refused.status === 0) {
					throw new Error("The agent's write after Take back control was not refused.");
				}
				const why = refused.stderr.split("\n").find((line) => line.trim() !== "") ?? "";
				await terminal.refused(`refused · exit ${refused.status}`, why.replace(/^Error:\s*/, ""));
				await Bun.sleep(900);
				await terminal.say("You took the board back, so I stopped. Nothing was written.");
				await Bun.sleep(2600);
				return claimed;
			});
			await encodeTake(take, {
				clip: CLIP,
				width: 1440,
				leadWithEnd: 1.6,
				hold: 0.8,
				thumbnail: THUMBNAIL,
			});
		}),
};

export { takeBack };
