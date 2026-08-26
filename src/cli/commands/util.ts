import fs from "fs";
import { CliUsageError, readStdin } from "./args.js";
import { boardHoldSeen, getHealth } from "../../runtime/engine/canvas-client.js";
import { EXPRESS_SERVER_URL } from "../../runtime/engine/config.js";

// Results go to stdout as JSON; diagnostics belong on stderr.
//
// A board that has stopped saving is added to every answer here rather than by
// each command, for the reason the canvas attaches it to every response: the
// point of it is that nobody working on that board can fail to notice, and a
// command that had to remember would be the one that forgot (ADR 0006,
// TASK-079). It goes to both places on purpose — into the JSON, where an agent
// reads, and as a sentence on stderr, where a person does.
export function printJson(value: unknown): void {
	const held = boardHoldSeen();
	const body =
		held && value && typeof value === "object" && !Array.isArray(value)
			? { ...(value as Record<string, unknown>), held }
			: value;
	process.stdout.write(JSON.stringify(body, null, 2) + "\n");
	if (held) note(held.message);
}

export function note(message: string): void {
	process.stderr.write(message + "\n");
}

// Screenshot / mermaid / viewport need a browser tab rendering the canvas.
export async function requireBrowserClient(what: string): Promise<void> {
	const health = await getHealth();
	if (health.websocket_clients === 0) {
		const error = new Error(
			`${what} requires the canvas to be open in a browser. Open ${EXPRESS_SERVER_URL} and retry.`,
		);
		(error as any).code = "BROWSER_REQUIRED";
		throw error;
	}
}

// Read JSON input from a positional file argument or stdin ("-" = stdin).
export async function readJsonInput(file: string | undefined, what: string): Promise<any> {
	const raw =
		file !== undefined && file !== "-" ? fs.readFileSync(file, "utf-8") : await readStdin();
	if (!raw.trim()) {
		throw new CliUsageError(`No ${what} provided (pass a file argument or pipe JSON to stdin)`);
	}
	try {
		return JSON.parse(raw);
	} catch (error) {
		throw new CliUsageError(`Invalid JSON ${what}: ${(error as Error).message}`);
	}
}
