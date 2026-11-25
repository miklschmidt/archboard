import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { WAITS as PUBLISHED } from "#shared/constants/published-waits.ts";
import { WAITS } from "#shared/constants/waits.ts";

/** The workspace packages that `@archboard/codex-realtime-voice` bundles when it is published. */
const BUNDLED = ["codex-realtime-voice", "codex-app-server", "process", "diagnostics"];

/** A wait named at one of timing's operations. */
const NAMED =
	/\b(?:within|pollUntil|after|every|expiresAt|lapsed|backoff|ms|TimedOut)\(\s*"([\w.]+)"/g;

test("the published table declares every wait the published package names, as timing does", () => {
	const packages = path.join(import.meta.dir, "../../../..");
	const named = new Set(
		BUNDLED.flatMap((name) =>
			readdirSync(path.join(packages, name, "src"), { recursive: true, withFileTypes: true })
				.filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
				.flatMap((entry) =>
					[...readFileSync(path.join(entry.parentPath, entry.name), "utf8").matchAll(NAMED)].map(
						(match) => match[1] ?? "",
					),
				),
		),
	);
	expect(named.size).toBeGreaterThan(0);
	for (const wait of named) {
		expect({ wait, published: (PUBLISHED as Record<string, unknown>)[wait] }).toEqual({
			wait,
			published: (WAITS as Record<string, unknown>)[wait],
		});
	}
});
