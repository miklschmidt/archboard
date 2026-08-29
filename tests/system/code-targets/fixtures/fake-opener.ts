import { closeSync, existsSync, openSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { TEST_OPENER_LIFECYCLE } from "../../../../src/shared/timing/timing.ts";

const [mode, captureDirectory, releaseFile, exitDirectory, target, ...extra] =
	process.argv.slice(2);
if (!mode || !captureDirectory || !releaseFile || !exitDirectory || target === undefined) {
	throw new Error(
		"fake-opener requires mode, capture, release, exit, target, and optional literal argv",
	);
}

const captureFile = join(captureDirectory, `${process.pid}.json`);
const capture = openSync(captureFile, "wx");
writeFileSync(
	capture,
	JSON.stringify({ pid: process.pid, target, extra, argv: process.argv.slice(2) }),
);
closeSync(capture);

if (mode === "hold") {
	const started = Date.now();
	while (!existsSync(releaseFile) && Date.now() - started < TEST_OPENER_LIFECYCLE.timeoutMs) {
		await Bun.sleep(TEST_OPENER_LIFECYCLE.pollMs);
	}
}

const exit = openSync(join(exitDirectory, `${process.pid}.json`), "wx");
writeFileSync(
	exit,
	JSON.stringify({ pid: process.pid, timedOut: mode === "hold" && !existsSync(releaseFile) }),
);
closeSync(exit);
