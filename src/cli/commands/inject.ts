import { parseArgs, CliUsageError } from "./args.js";
import { printJson } from "./util.js";
import { ensureCanvasRunning } from "../../runtime/engine/spawn.js";
import { getInjection, postInjectionTest } from "../../runtime/engine/canvas-client.js";

// `inject status` / `inject test` — is the canvas able to reach the thread?
//
// There is deliberately no `inject on`. Whether the canvas may push to a Codex
// thread is decided when the canvas server starts, from ARCHBOARD_INJECT and
// the address it bound, and a command that could flip it at runtime would
// defeat the point of it being a separate capability (ADR 0005).
export async function inject(argv: string[]): Promise<void> {
	const [sub, ...rest] = argv;
	if (!sub || sub === "status") {
		await ensureCanvasRunning();
		const report = await getInjection();
		const { success: _success, ...body } = report;
		printJson(body);
		return;
	}

	if (sub === "test") {
		const { positionals, flags } = parseArgs(rest, {
			note: { takesValue: true },
			loud: { takesValue: false },
			quiet: { takesValue: false },
		});
		if (flags.loud && flags.quiet) {
			throw new CliUsageError("pass --loud or --quiet, not both");
		}
		await ensureCanvasRunning();
		const note = (flags.note as string) ?? positionals.join(" ") ?? undefined;
		const result = await postInjectionTest({
			...(note ? { note } : {}),
			...(flags.loud ? { loud: true } : {}),
			...(flags.quiet ? { loud: false } : {}),
		});
		const { success: _success, ...body } = result;
		printJson(body);
		return;
	}

	throw new CliUsageError(
		`unknown inject subcommand "${sub}" — try \`inject status\` or \`inject test\``,
	);
}
