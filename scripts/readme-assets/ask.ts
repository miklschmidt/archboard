// The ask clip: a person picks a part out, chooses Explain selection from Explain with Codex in the
// Right panel, and a real Codex agent answers from the captured reading: its activity line and its
// answer stream under the picture, and the conversation beside it holds the same turn. It runs on a
// server with the machine's Archboard Codex sign-in and spends Codex usage. The wait before the
// answer begins is played faster, so it lasts about seven seconds.

import {
	encodeTake,
	filmTogether,
	moment,
	now,
	attachmentFile,
	readmeFile,
	withTake,
	type Page,
	type Producer,
	// oxlint-disable-next-line archboard/absolute-imports -- scripts/ has no # imports; sibling imports stay relative
} from "./kit.ts";

const MODEL = "Shop";
const SCOPE = "Shop/MKhTEYqf#lwmpnaVU";
const PART = "Timeout guard";
const CLIP = attachmentFile("ask.webp");
const THUMBNAIL = readmeFile("idx-ask.webp");
const STATUS = "document.querySelector(\"[data-slot='agent-status']\")?.textContent.trim() ?? ''";
const EXPLANATION_STATUS =
	"document.querySelector(\"[data-slot='model-explanation']\")?.getAttribute('data-status') ?? ''";
const EXPLAIN = "[data-slot='model-explain']";
const SELECTION = "[data-explanation-action='explain-selection']";
const ANSWER = "[data-slot='model-explanation']";

/** How long the wait before the answer begins lasts once it is played faster. */
const FAST_WAIT_SECONDS = 7;

/** How much of the answer's streaming plays at its own pace; an answer that streams longer is sped up. */
const STREAM_SECONDS = 12;

/** How long the agent may take to answer. */
const ANSWER_MS = 240_000;

/**
 * A script for the page that keeps a person's machine out of every frame. The agent's activity rows
 * name the shell it runs commands in and the files it reads, by their whole paths, and the
 * conversation's first turn is the captured request: a sentence, and a line of JSON that names a
 * temporary file. A clip in a public README should carry none of it:
 *
 * - the prompt of the turn is not drawn at all;
 * - the JSON line that names the capture file is cut from any text;
 * - a path in a temporary directory shows only its last name, and a home directory shows as `~`.
 *
 * A mutation observer runs before the next paint, so no frame shows the words before it changes them.
 */
const SCRUB = `(() => {
	const style = document.createElement("style");
	style.textContent = "[data-slot='prompt'] { display: none !important; }";
	document.head.appendChild(style);
	const capture = /\\{\\s*"captureFile"[^}]*\\}/g;
	const temporary = /\\/(?:var\\/)?tmp(?:\\/[^\\s"'\`)\\]}]*)?/g;
	const home = /\\/home\\/[^/\\s]+/g;
	const last = (path) => path.split("/").filter(Boolean).pop() ?? "";
	const clean = (text) => text.replace(capture, "").replace(temporary, last).replace(home, "~");
	const scrub = () => {
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		for (let node = walker.nextNode(); node; node = walker.nextNode()) {
			const text = node.nodeValue;
			if (text !== null && clean(text) !== text) node.nodeValue = clean(text);
		}
	};
	new MutationObserver(scrub).observe(document.body, { childList: true, subtree: true, characterData: true });
	scrub();
})()`;

/** How long the dock may take to settle on a status or on none. */
const SETTLE_MS = 90_000;

/** How many looks in a row must find the dock's status empty before the agent counts as ready. */
const READY_LOOKS = 8;

/** How long to wait between two looks at the dock's status. */
const LOOK_MS = 500;

/**
 * Refuse a status that says Codex is not signed in or could not start.
 * @param status What the agent dock says.
 * @throws {Error} When the status says so, before anything is spent.
 */
function refuse(status: string): void {
	if (status.startsWith("Sign in") || status.startsWith("Finish signing in")) {
		throw new Error(
			"Codex is not signed in on this machine's Archboard. Sign in from the agent dock of any Archboard server, then run this again.",
		);
	}
	if (status.startsWith("Codex is unavailable")) {
		throw new Error(`The agent dock says: ${status}. Nothing was asked, so nothing was spent.`);
	}
}

/**
 * Look at the agent dock's status until it says what is wrong, or until it has said nothing for a
 * while: a signed-in agent that is ready says nothing, because the keys say it.
 * @param page The shell.
 * @param quiet How many looks in a row have found the status empty.
 * @param deadline When to give up, as a timestamp.
 * @returns Once the agent is ready.
 * @throws {Error} When Codex is not signed in or is unavailable, or when the dock never settles.
 */
async function requireSignedIn(
	page: Page,
	quiet = 0,
	deadline = Date.now() + SETTLE_MS,
): Promise<void> {
	const status = String(await page.evaluate(STATUS).catch(() => ""));
	refuse(status);
	const calm = status === "" ? quiet + 1 : 0;
	if (calm >= READY_LOOKS) return;
	if (Date.now() > deadline) {
		throw new Error(`The agent dock never settled: its status read "${status}".`);
	}
	await Bun.sleep(LOOK_MS);
	return requireSignedIn(page, calm, deadline);
}

/**
 * Await the answer and any captured action that the workhorse queues for itself. A captured
 * explanation shows its answer as markdown in the body of its own section, under its header.
 * @param page The live conversation and captured explanation.
 */
async function requireAnswer(page: Page): Promise<void> {
	await page.waitFor(
		`(() => {
			const agent = (${STATUS});
			const explanation = (${EXPLANATION_STATUS});
			return /^(Failed|Stopped)/.test(agent) ||
				['failed', 'cancelled', 'unavailable'].includes(explanation) ||
				(agent.startsWith('Done') && ['', 'completed'].includes(explanation));
		})()`,
		"the completed answer",
		ANSWER_MS,
	);
	const explanation = String(await page.evaluate(EXPLANATION_STATUS));
	if (explanation !== "" && explanation !== "completed")
		throw new Error(`The captured explanation did not complete: ${explanation}.`);
	if (!String(await page.evaluate(STATUS)).startsWith("Done"))
		throw new Error("The agent did not finish its answer.");
	if (
		explanation === "completed" &&
		!String(
			await page.evaluate(
				"document.querySelector(\"[data-slot='model-explanation'] > div\")?.textContent.trim() ?? ''",
			),
		)
	)
		throw new Error("The completed explanation contains no answer.");
}

/**
 * Wait until the answer's text begins, or the explanation ends without one.
 * @param page The shell.
 * @returns Once the text is drawn, or the explanation has ended.
 */
async function awaitText(page: Page): Promise<void> {
	await page.waitFor(
		`!!document.querySelector("${ANSWER} [data-slot='model-explanation-text']") ||
			['failed', 'cancelled', 'unavailable', 'completed'].includes(${EXPLANATION_STATUS})`,
		"the answer's first words",
		ANSWER_MS,
	);
}

/**
 * The stretch of a take that plays faster: the wait before the answer begins, and the start of an
 * answer that streams for longer than a viewer needs.
 * @param noted The seconds that the take noted.
 * @param noted.sent When Explain selection was chosen.
 * @param noted.began When the answer's text began.
 * @param noted.done When the answer was whole.
 * @param from The take's first second.
 * @returns The stretch, or nothing when the wait is too short to be worth speeding up.
 */
function fastStretch(
	noted: { readonly sent: number; readonly began: number; readonly done: number },
	from: number,
) {
	const start = noted.sent - from + 1.5;
	const end = Math.max(noted.began, noted.done - STREAM_SECONDS) - from - 0.5;
	if (end - start < FAST_WAIT_SECONDS + 1) return undefined;
	return { from: start, to: end, speed: (end - start) / FAST_WAIT_SECONDS };
}

const ask: Producer = {
	kind: "clip",
	codex: true,
	files: [THUMBNAIL],
	attachments: [CLIP],
	needs: ["chromium", "ffmpeg", "codex"],
	plan: [
		`Start an Archboard server over a copy of examples/web-shop that uses this machine's Archboard Codex sign-in, and open the shell on ${MODEL} at 1920x1080, light, with the conversation open; refuse when Codex is not signed in. Keep the prompt of the conversation's first turn, any temporary path and the home directory out of every frame.`,
		`Film the pointer selecting ${PART}, opening Explain with Codex in the Right panel and choosing Explain selection: the panel's activity line and the Codex agent's answer stream under the picture, and the conversation holds the same turn. This spends Codex usage.`,
		`Encode the take as a 1440 px lossless WebP at 30 frames a second, in the scratch directory to attach by hand, with the wait before the answer begins played in about ${FAST_WAIT_SECONDS} seconds, and cut ${THUMBNAIL} from the finished answer.`,
	],
	/**
	 * Film the take and encode it.
	 * @returns Once the files are written.
	 */
	make: async () =>
		withTake("ask", "examples/web-shop", true, async (server, browser) => {
			const page = await browser.open({
				url: `${server.url}/?modelA=${MODEL}&scopeA=${encodeURIComponent(SCOPE)}`,
				theme: "light",
				cursor: true,
			});
			await page.atRest();
			await page.evaluate(SCRUB);
			await requireSignedIn(page);
			const open = "button[aria-label='Open the conversation']";
			if (await page.evaluate(`!!document.querySelector("${open}")`)) await page.click(open);
			await Bun.sleep(1500);
			await page.atRest();
			await page.moveTo({ x: 1250, y: 300 }, 1);
			const take = await filmTogether("ask", [page], async () => {
				await Bun.sleep(1000);
				await page.click(await page.card(PART));
				await Bun.sleep(1200);
				await page.atRest();
				await page.click(EXPLAIN);
				await Bun.sleep(700);
				await page.click(SELECTION);
				const sent = now();
				await page.moveTo({ x: 1250, y: 300 }, 20);
				await awaitText(page);
				const began = now();
				await requireAnswer(page);
				const done = now();
				await page.evaluate("document.activeElement && document.activeElement.blur()");
				await Bun.sleep(1000);
				const answered = await moment(page, [ANSWER, await page.card(PART)], 960);
				await Bun.sleep(3000);
				return { answered, sent, began, done };
			});
			await encodeTake(
				{ ...take, noted: take.noted.answered },
				{
					clip: CLIP,
					width: 1440,
					fast: fastStretch(take.noted, take.from),
					thumbnail: THUMBNAIL,
				},
			);
		}),
};

export { ask };
