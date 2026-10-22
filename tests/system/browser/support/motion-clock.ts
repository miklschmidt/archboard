import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { browserTestRoots, type AgentBrowserSession } from "./agent-browser.ts";

let script: Promise<string> | undefined;

/** Compile the existing frame clock into the page, without an application test hook. */
async function motionScript(): Promise<string> {
	const result = await Bun.build({
		entrypoints: [fileURLToPath(new URL("../fixtures/motion-clock.ts", import.meta.url))],
		target: "browser",
		format: "iife",
	});
	if (!result.success || result.outputs.length !== 1) {
		throw new Error(`Could not build the browser motion clock: ${result.logs.join("\n")}`);
	}
	return result.outputs[0]!.text();
}

/**
 * Install controlled motion before application startup and step every 16 ms frame during observations.
 * @param browser The session before its first navigation.
 * @returns The same browser with a clock installed at navigation and advanced before each observation.
 */
export async function stepBrowserMotion(
	browser: AgentBrowserSession,
): Promise<AgentBrowserSession> {
	script ??= motionScript();
	const clock = await script;
	const initPath = join(browserTestRoots().ownerRoot, "motion-clock.js");
	return {
		...browser,
		async run(argv, options) {
			if (argv[0] === "open") {
				await Bun.write(initPath, clock);
				return browser.run(["--init-script", initPath, ...argv], options);
			}
			if (argv[0] === "--init-script") {
				const media = await Bun.file(argv[1]!).text();
				await Bun.write(initPath, `${clock}\n${media}`);
				return browser.run(["--init-script", initPath, ...argv.slice(2)], options);
			}
			return browser.run(argv, options);
		},
		async eval<T>(source: string): Promise<T> {
			return browser.eval<T>(`(async () => {
				const violations = await globalThis.__archboardStepMotion(160);
				if (violations.length) throw new Error(JSON.stringify(violations));
				return (0, eval)(${JSON.stringify(source)});
			})()`);
		},
	};
}
