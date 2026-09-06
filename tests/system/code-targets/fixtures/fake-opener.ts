import { closeSync, existsSync, openSync, writeFileSync } from "node:fs";
import path from "node:path";

import { TEST_OPENER_LIFECYCLE } from "../../support/timing.ts";

const [mode, captureDirectory, releaseFile, exitDirectory, target, ...extra] =
	process.argv.slice(2);
if (
	mode === undefined ||
	mode.length === 0 ||
	captureDirectory === undefined ||
	captureDirectory.length === 0 ||
	releaseFile === undefined ||
	releaseFile.length === 0 ||
	exitDirectory === undefined ||
	exitDirectory.length === 0 ||
	target === undefined
) {
	throw new Error(
		"fake-opener requires mode, capture, release, exit, target, and optional literal argv",
	);
}

const captureFile = path.join(captureDirectory, `${process.pid}.json`);
const capture = openSync(captureFile, "wx");
writeFileSync(
	capture,
	JSON.stringify({ pid: process.pid, target, extra, argv: process.argv.slice(2) }),
);
closeSync(capture);

if (mode === "hold") {
	const started = Date.now();
	const waitForRelease = async (): Promise<void> => {
		if (existsSync(releaseFile) || Date.now() - started >= TEST_OPENER_LIFECYCLE.timeoutMs) {
			return;
		}
		await Bun.sleep(TEST_OPENER_LIFECYCLE.pollMs);
		await waitForRelease();
	};
	await waitForRelease();
}

const exit = openSync(path.join(exitDirectory, `${process.pid}.json`), "wx");
writeFileSync(
	exit,
	JSON.stringify({ pid: process.pid, timedOut: mode === "hold" && !existsSync(releaseFile) }),
);
closeSync(exit);
