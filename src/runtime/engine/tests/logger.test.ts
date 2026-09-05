import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import winston from "winston";

import { closeLogger } from "../logger.js";

test("logger lifecycle flushes and closes every owned transport", async () => {
	const root = mkdtempSync(join(tmpdir(), "archboard-logger-lifecycle-"));
	const file = join(root, "owner.log");
	const transport = new winston.transports.File({ filename: file });
	const owner = winston.createLogger({ transports: [transport] });
	try {
		owner.info("terminal record");
		await closeLogger(owner);

		expect(owner.transports).toEqual([]);
		expect(transport.listenerCount("finish")).toBe(0);
		expect(transport.listenerCount("open")).toBe(0);
		expect(readFileSync(file, "utf8")).toContain("terminal record");
	} finally {
		if (!owner.destroyed && !owner.writableFinished) {
			owner.destroy();
		}
		rmSync(root, { recursive: true, force: true });
	}
});
