// Import this fixture before product modules that read the vault at import time.
import { afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const callerVault = process.env["ARCHBOARD_VAULT"];
const PRODUCTION_VAULT = mkdtempSync(join(tmpdir(), "archboard-production-vault-"));
process.env["ARCHBOARD_VAULT"] = PRODUCTION_VAULT;

afterAll(() => {
	if (callerVault === undefined) delete process.env["ARCHBOARD_VAULT"];
	else process.env["ARCHBOARD_VAULT"] = callerVault;
	rmSync(PRODUCTION_VAULT, { recursive: true, force: true });
});

export { PRODUCTION_VAULT };
