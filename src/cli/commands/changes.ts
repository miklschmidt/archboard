import { parseArgs, CliUsageError } from "./args.js";
import { printJson } from "./util.js";
import { ensureCanvasRunning } from "../../runtime/engine/spawn.js";
import { getChanges } from "../../runtime/engine/canvas-client.js";

// `changes` — what the board became, since a cursor.
//
// The feed is cursor-based rather than time-based because its second consumer
// is a `UserPromptSubmit` hook: a short-lived process, once per turn, holding a
// state file of what it last reported. "Since I last looked" is the only
// question that has a correct answer for such a caller, and a timestamp is not
// it — clocks and turn boundaries do not line up.
//
// Two modes, and the difference matters:
//   plain        every event after the cursor, each already narrated
//   --coalesce   ONE diff from the cursor to now — the net difference, which
//                is what a hook that missed four turns actually wants
export async function changes(argv: string[]): Promise<void> {
	const { flags } = parseArgs(argv, {
		since: { takesValue: true },
		coalesce: { takesValue: false },
		detail: { takesValue: false },
		text: { takesValue: false },
	});

	const since = flags.since === undefined ? 0 : Number(flags.since);
	if (!Number.isFinite(since) || since < 0) {
		throw new CliUsageError("--since takes a cursor from a previous `changes` response");
	}

	await ensureCanvasRunning();
	const report = await getChanges({
		since,
		coalesce: Boolean(flags.coalesce),
		detail: Boolean(flags.detail),
	});

	if (flags.text) {
		const lines: string[] = [];
		if (report.truncated) {
			lines.push(report.message ?? "The feed no longer reaches back that far.");
		} else if (flags.coalesce) {
			const net = report.coalesced;
			if (!net || net.significance === "none") {
				lines.push(`Nothing has changed on "${String(report.board)}" since then.`);
			} else {
				lines.push(`${String(report.board)}: ${net.headline}`);
				if (typeof net.text === "string") lines.push(net.text);
			}
		} else if (report.events.length === 0) {
			lines.push(`Nothing has changed on "${report.board}" since then.`);
		} else {
			for (const event of report.events) {
				lines.push(
					`[${event.cursor}] ${event.at} — ${event.origin} ${event.significance}: ${event.headline}`,
				);
					if (typeof event.text === "string") lines.push(event.text);
			}
		}
		// The cursor is part of the answer in text mode too: without it the caller
		// cannot ask the next question. The feed id goes with it, because a cursor
		// only means anything within the canvas process that issued it.
		lines.push(`(cursor ${report.cursor}${report.feedId ? `, feed ${report.feedId}` : ""})`);
		process.stdout.write(lines.join("\n") + "\n");
		return;
	}

	printJson(report);
}
