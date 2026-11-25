import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { listArchitectureCheckpoints } from "@archboard/model/store-read";
import {
	ArchiveRecordSchema,
	RECORD_FORMAT,
} from "#runtime/canonical/archive/store/model-archive-record.ts";
import { temporaryHome } from "#tests/runtime/support/temporary-home.ts";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function git(root: string, args: string[], stdin?: string): string {
	const result = Bun.spawnSync(["git", "-C", root, ...args], {
		stdin: stdin === undefined ? "ignore" : Buffer.from(stdin),
		env: {
			...process.env,
			GIT_AUTHOR_NAME: "Record Author",
			GIT_AUTHOR_EMAIL: "record@example.test",
			GIT_COMMITTER_NAME: "Record Author",
			GIT_COMMITTER_EMAIL: "record@example.test",
		},
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return result.stdout.toString().trim();
}

/** A source checkout whose history branch holds one commit with the given record. */
function archiveWith(record: unknown) {
	const home = temporaryHome("archboard-record-format-");
	homes.push(home);
	const root = join(home, "repo");
	const vault = join(root, ".archboard/vault");
	mkdirSync(vault, { recursive: true });
	git(root, ["init", "--quiet", "--initial-branch=main"]);
	const blob = git(root, ["hash-object", "-w", "--stdin"], JSON.stringify(record));
	const tree = git(root, ["mktree"], `100644 blob ${blob}\trecord.json\n`);
	const id = git(root, ["commit-tree", tree, "-m", "record"]);
	git(root, ["update-ref", "refs/heads/archboard-history", id]);
	return { vault, id };
}

test("a record from a newer Archboard says so and says to update, without the schema", async () => {
	const { vault, id } = archiveWith({ schemaVersion: 3, kind: "checkpoint", added: true });
	expect(await listArchitectureCheckpoints(vault)).toMatchObject({
		success: false,
		code: "ARCHIVE_NEWER",
		diagnostics: [
			{
				file: id,
				message: `This vault's history was written by a newer Archboard: record ${id} has format 3, and this Archboard reads formats up to 2.`,
				recovery:
					"Update Archboard to the newest release, then retry. The history is intact: do not restore, fetch or roll back the archboard-history branch.",
			},
		],
	});
});

test("a damaged record says it is damaged and how to recover, without the schema", async () => {
	const { vault, id } = archiveWith({ schemaVersion: 1, kind: "checkpoint", vault: 7 });
	const read = await listArchitectureCheckpoints(vault);
	expect(read).toMatchObject({ success: false, code: "ARCHIVE_UNREADABLE" });
	if (read.success) return;
	const [diagnostic] = read.diagnostics;
	expect(diagnostic!.message).toStartWith(`History record ${id} is damaged: `);
	expect(diagnostic!.message).not.toContain("\n");
	expect(diagnostic!.recovery).toStartWith("Inspect the named archive ref.");
});

test("the record format is raised whenever the record schema changes", () => {
	// Remove prose only from schema nodes. Fields named `description` and
	// their values in defaults and literals still contribute to the hash.
	const schema = z.toJSONSchema(ArchiveRecordSchema, {
		override: ({ jsonSchema }) => {
			delete jsonSchema.description;
		},
	});
	const shape = createHash("sha256").update(JSON.stringify(schema)).digest("hex");
	// A failure here means the history record changed. Raise RECORD_FORMAT, so an
	// older Archboard reading a new record says it needs an update, then pin both.
	expect({ format: RECORD_FORMAT, shape }).toEqual({
		format: 2,
		shape: "1a15140b38d62ad3c67a322938e06c677d2102b4bf6c8882b64dfafca3af3cbc",
	});
});
