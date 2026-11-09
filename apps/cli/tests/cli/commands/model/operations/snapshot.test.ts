import { afterAll, expect, spyOn, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { readArchitectureModel } from "@archboard/model/store-read";
import { makeStandInVault } from "#tests/cli/support/stand-in-vault/stand-in-vault.ts";

const current = readArchitectureModel(
	resolve(import.meta.dir, "../../../../../../../examples/canonical-model/.archboard/vault"),
);
if (!current.success || current.selectedState === null) throw new Error(JSON.stringify(current));
const selected = {
	...current,
	comparison: {
		reason: "explicit" as const,
		against: current.selectedState,
		revision: current.revision,
		interfaceChanges: { changed: [], unchanged: [] },
		interfaceMeasures: { states: [], containers: [] },
		subjects: [],
	},
};
const vault = makeStandInVault();
let replies: unknown[] = [];
const server = Bun.serve({
	hostname: "127.0.0.1",
	port: 0,
	fetch(request) {
		const { pathname } = new URL(request.url);
		if (pathname === "/health") return Response.json({ service: "archboard-server", status: "ok" });
		if (pathname === "/api/architecture/model") return Response.json(replies.shift());
		if (pathname === "/api/vault/check")
			return Response.json({
				policy: current.policy,
				configurationValid: true,
				configurationFile: join(vault.path, ".archboard/config.yaml"),
				fingerprint: "policy",
				diagnostics: [],
			});
		return new Response(null, { status: 404 });
	},
});
const environment = {
	ARCHBOARD_URL: process.env["ARCHBOARD_URL"],
	ARCHBOARD_NO_AUTOSTART: process.env["ARCHBOARD_NO_AUTOSTART"],
};
process.env["ARCHBOARD_URL"] = `http://127.0.0.1:${server.port}`;
process.env["ARCHBOARD_NO_AUTOSTART"] = "1";
const { runCli } = await import("#cli/routing/operations/run.ts");

afterAll(async () => {
	for (const [key, value] of Object.entries(environment)) {
		if (value === undefined) delete process.env[key];
		else process.env[key] = value;
	}
	await server.stop(true);
	vault.restore();
});

test.each([
	{ name: "revision", base: { ...current, revision: { ...current.revision, digest: "changed" } } },
	{ name: "model", base: { ...current, manifest: { ...current.manifest, id: "Other" } } },
	{
		name: "state",
		base: { ...current, selectedState: { ...current.selectedState, id: "Other" } },
	},
	{ name: "checkpoint", base: current, checkpoint: "a".repeat(40) },
])(
	"a changed comparison $name refuses the snapshot and preserves the destination",
	async (item) => {
		replies = [
			{
				...selected,
				comparison: {
					...selected.comparison,
					...(item.checkpoint ? { checkpoint: item.checkpoint } : {}),
				},
			},
			item.base,
		];
		const file = join(vault.path, `${item.name}.json`);
		let stdout = "";
		const out = spyOn(process.stdout, "write").mockImplementation((chunk) => {
			stdout += String(chunk);
			return true;
		});
		const err = spyOn(process.stderr, "write").mockImplementation(() => true);
		const exitCode = process.exitCode;
		process.exitCode = 0;
		try {
			await runCli(vault.argv(["model", "snapshot", "--against", "current", "--out", file]));
			expect(process.exitCode).toBe(2);
			expect(JSON.parse(stdout)).toMatchObject({ success: false, code: "STALE_REVISION" });
			expect(existsSync(file)).toBeFalse();
		} finally {
			out.mockRestore();
			err.mockRestore();
			process.exitCode = exitCode ?? 0;
		}
	},
);
