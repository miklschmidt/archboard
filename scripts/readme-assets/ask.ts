// The ask clip: a person picks a part out, types a question into the agent dock, and a real Codex
// agent answers from the board. It runs on a server with the machine's Archboard Codex sign-in and
// spends Codex usage. The wait for the answer is played faster, so it lasts about seven seconds.

import {
	encodeTake,
	filmTogether,
	moment,
	now,
	readmeFile,
	withTake,
	type Page,
	type Producer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no alias root; @/ resolves only into src/
} from "./kit.ts";

const BOARD = "Web shop";
const PART = "Timeout guard";
const QUESTION = "Why does this part exist, and what would break without it?";
const CLIP = readmeFile("ask.webp");
const THUMBNAIL = readmeFile("idx-ask.webp");
const STATUS = "document.querySelector(\"[data-slot='agent-status']\")?.textContent.trim() ?? ''";

/** How long the wait for the answer lasts once it is played faster. */
const FAST_WAIT_SECONDS = 7;

/** How long the agent may take to answer. */
const ANSWER_MS = 240_000;

/**
 * Wait until the agent dock knows whether Codex is signed in, and refuse when it is not or when
 * Codex could not start.
 * @param page The shell.
 * @throws {Error} When Codex is not signed in or is unavailable, before anything is spent.
 */
async function requireSignedIn(page: Page): Promise<void> {
	const status = String(
		await page.waitFor(
			`(() => { const s = ${STATUS}; return s === "" || s.startsWith("Connecting") || s.startsWith("Starting") ? null : s; })()`,
			"the agent dock's status",
			60_000,
		),
	);
	if (status.startsWith("Sign in") || status.startsWith("Finish signing in")) {
		throw new Error(
			"Codex is not signed in on this machine's Archboard. Sign in from the agent dock of any Archboard server, then run this again.",
		);
	}
	if (status.startsWith("Codex is unavailable")) {
		throw new Error(`The agent dock says: ${status}. Nothing was asked, so nothing was spent.`);
	}
}

const ask: Producer = {
	kind: "clip",
	codex: true,
	files: [CLIP, THUMBNAIL],
	needs: ["chromium", "ffmpeg", "codex"],
	plan: [
		`Start an Archboard server over a copy of examples/web-shop that uses this machine's Archboard Codex sign-in, and open the shell on ${BOARD} at 1920x1080, light, with the conversation open; refuse when Codex is not signed in.`,
		`Film the pointer picking ${PART} out and typing "${QUESTION}" into the agent dock, and the Codex agent's answer; this spends Codex usage.`,
		`Encode the take as a 1440 px WebP at 30 frames a second, with the wait for the answer played in about ${FAST_WAIT_SECONDS} seconds, and cut ${THUMBNAIL} from the answer.`,
	],
	/**
	 * Film the take and encode it.
	 * @returns Once the files are written.
	 */
	make: async () =>
		withTake("ask", "examples/web-shop", true, async (server, browser) => {
			const page = await browser.open({
				url: `${server.url}/?paneA=${encodeURIComponent(BOARD)}`,
				theme: "light",
				cursor: true,
			});
			await page.atRest();
			await requireSignedIn(page);
			const open = "button[aria-label='Open the conversation']";
			if (await page.evaluate(`!!document.querySelector("${open}")`)) await page.click(open);
			await Bun.sleep(1500);
			await page.atRest();
			await page.moveTo({ x: 900, y: 700 }, 1);
			const take = await filmTogether("ask", [page], async () => {
				await Bun.sleep(1000);
				await page.click(await page.card(PART));
				await Bun.sleep(1200);
				await page.click("textarea[aria-label='Message the agent']");
				await page.type(QUESTION);
				await Bun.sleep(500);
				await page.key("Enter");
				const sent = now();
				await page.moveTo({ x: 1300, y: 640 }, 20);
				await Bun.sleep(1500);
				await page.waitFor(`/^(Done|Failed|Stopped)/.test(${STATUS})`, "the answer", ANSWER_MS);
				const done = now();
				if (!String(await page.evaluate(STATUS)).startsWith("Done")) {
					throw new Error("The agent did not finish its answer.");
				}
				await page.evaluate("document.activeElement && document.activeElement.blur()");
				await Bun.sleep(1000);
				const answered = await moment(page, ["[data-slot='agent-panel']"], 960);
				await Bun.sleep(3000);
				return { answered, sent, done };
			});
			const from = take.noted.sent - take.from + 1.5;
			const to = take.noted.done - take.from;
			await encodeTake(
				{ ...take, noted: take.noted.answered },
				{
					clip: CLIP,
					width: 1440,
					fast: { from, to, speed: Math.max(1, (to - from) / FAST_WAIT_SECONDS) },
					thumbnail: THUMBNAIL,
				},
			);
		}),
};

export { ask };
