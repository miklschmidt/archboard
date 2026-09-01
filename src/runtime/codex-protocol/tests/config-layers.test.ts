import { expect, test } from "bun:test";

import { decodeResponse } from "../index.js";
import { responseFixtures } from "./fixtures.js";

test("config/read accepts enabled layers that omit disabledReason", () => {
	const configResponse = responseFixtures["config/read"] as {
		readonly config: Record<string, unknown>;
		readonly origins: Record<string, unknown>;
		readonly layers: null;
	};
	expect(() =>
		decodeResponse("config/read", {
			...configResponse,
			layers: [
				{
					name: { type: "system", file: "/etc/codex/config.toml" },
					version: "sha256:fixture",
					config: {},
				},
			],
		}),
	).not.toThrow();
});
