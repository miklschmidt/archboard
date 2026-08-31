import { chmodSync, mkdirSync, symlinkSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

import { CodexSessionStorageError } from "../index.js";
import { configFixture, createSessionFixture, requirementsFixture } from "./support.js";

async function rejected(promise: Promise<unknown>): Promise<unknown> {
	try {
		await promise;
	} catch (error) {
		return error;
	}
	throw new Error("expected initialization to reject");
}

describe("Codex session storage proof", () => {
	test("accepts null requirements and a matching managed sqlite root", async () => {
		const first = createSessionFixture();
		await first.session.initialize();
		expect(first.lifecycle.appServerReady()).toBe(1);
		first.close();

		const matching = createSessionFixture();
		matching.transport.prependResponse(
			"configRequirements/read",
			requirementsFixture(matching.storage.sqliteHome) as never,
		);
		await matching.session.initialize();
		expect(matching.lifecycle.appServerReady()).toBe(1);
		matching.close();
	});

	test("refuses a redirected initialize home and colliding prepared roots", async () => {
		const redirected = createSessionFixture();
		redirected.transport.prependResponse("initialize", {
			userAgent: "Codex Desktop/0.151.0",
			codexHome: redirected.storage.sqliteHome,
			platformFamily: "unix",
			platformOs: "linux",
		} as never);
		const redirectedError = await rejected(redirected.session.initialize());
		expect(redirectedError).toBeInstanceOf(CodexSessionStorageError);
		expect(redirected.lifecycle.terminalFailure()).toBe(1);
		redirected.close();

		const collision = createSessionFixture({
			storageTransform: (storage) => ({ ...storage, sqliteHome: storage.codexHome }),
		});
		const collisionError = await rejected(collision.session.initialize());
		expect(collisionError).toBeInstanceOf(CodexSessionStorageError);
		collision.close();
	});

	test("refuses null, missing, aliased, and wrong-origin sqlite configuration", async () => {
		const nullValue = createSessionFixture();
		const nullConfig = configFixture(nullValue.storage.sqliteHome, nullValue.storage.configPath);
		(nullConfig.config as Record<string, unknown>).sqlite_home = null;
		nullValue.transport.prependResponse("config/read", nullConfig as never);
		expect(await rejected(nullValue.session.initialize())).toBeInstanceOf(CodexSessionStorageError);
		nullValue.close();

		const missingValue = createSessionFixture();
		const missingConfig = configFixture(
			missingValue.storage.sqliteHome,
			missingValue.storage.configPath,
		);
		delete (missingConfig.config as Record<string, unknown>).sqlite_home;
		missingValue.transport.prependResponse("config/read", missingConfig as never);
		expect(await rejected(missingValue.session.initialize())).toBeInstanceOf(
			CodexSessionStorageError,
		);
		missingValue.close();

		const aliasValue = createSessionFixture();
		const alias = path.join(aliasValue.root, "sqlite-alias");
		symlinkSync(aliasValue.storage.sqliteHome, alias, "dir");
		aliasValue.transport.prependResponse(
			"config/read",
			configFixture(alias, aliasValue.storage.configPath) as never,
		);
		expect(await rejected(aliasValue.session.initialize())).toBeInstanceOf(
			CodexSessionStorageError,
		);
		aliasValue.close();

		const wrongOrigin = createSessionFixture();
		const wrong = configFixture(wrongOrigin.storage.sqliteHome, wrongOrigin.storage.configPath);
		(wrong.origins.sqlite_home as Record<string, unknown>).name = {
			type: "user",
			file: wrongOrigin.storage.configPath,
			profile: "unexpected",
		};
		wrongOrigin.transport.prependResponse("config/read", wrong as never);
		expect(await rejected(wrongOrigin.session.initialize())).toBeInstanceOf(
			CodexSessionStorageError,
		);
		wrongOrigin.close();
	});

	test("reconciles requirements and rejects conflicts, symlinked roots, and loose modes", async () => {
		const conflict = createSessionFixture();
		const other = path.join(conflict.root, "other-sqlite");
		mkdirSync(other, { mode: 0o700 });
		conflict.transport.prependResponse(
			"configRequirements/read",
			requirementsFixture(other) as never,
		);
		expect(await rejected(conflict.session.initialize())).toBeInstanceOf(CodexSessionStorageError);
		conflict.close();

		const symlinked = createSessionFixture();
		const linkedHome = path.join(symlinked.root, "linked-codex");
		symlinkSync(symlinked.storage.codexHome, linkedHome, "dir");
		const linkedStorage = { ...symlinked.storage, codexHome: linkedHome };
		const linked = createSessionFixture({ storage: linkedStorage });
		expect(await rejected(linked.session.initialize())).toBeInstanceOf(CodexSessionStorageError);
		linked.close();
		symlinked.close();

		const loose = createSessionFixture();
		chmodSync(loose.storage.codexHome, 0o755);
		expect(await rejected(loose.session.initialize())).toBeInstanceOf(CodexSessionStorageError);
		loose.close();

		const looseConfig = createSessionFixture();
		chmodSync(looseConfig.storage.configPath, 0o644);
		expect(await rejected(looseConfig.session.initialize())).toBeInstanceOf(
			CodexSessionStorageError,
		);
		looseConfig.close();
	});
});
