import { afterEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	readArchitectureModel,
	watchArchitectureModel,
	readArchitectureClaims,
} from "@archboard/board/store-read";
import {
	editArchitectureModule,
	releaseArchitectureClaim,
	takeBackArchitectureClaim,
	claimArchitectureSubjects,
} from "@archboard/board/store-write";
import type { ArchitectureEvent } from "@archboard/board/model";
import { modelFilesToken } from "#runtime/store/model-files.ts";
import {
	fixture,
	intent,
	readBytes,
	disposeFixtures,
	structureIntent,
} from "#tests/runtime/operations/model-edit/fixture.ts";
afterEach(disposeFixtures);

test("news starts with a coherent snapshot and follows claims, durable completion and stable external content", async () => {
	const { vault } = fixture();
	const events: ArchitectureEvent[] = [];
	let receive: ((event: ArchitectureEvent) => void) | undefined;
	const stop = watchArchitectureModel(vault, (event) => {
		events.push(event);
		receive?.(event);
	});
	const next = (type: ArchitectureEvent["type"]) =>
		new Promise<void>((resolve) => {
			receive = (event) => {
				if (event.type === type) {
					receive = undefined;
					resolve();
				}
			};
		});
	try {
		expect(events).toMatchObject([
			{
				type: "architecture_snapshot",
				reading: { success: true },
				claims: { success: true, claims: [] },
			},
		]);
		const input = await intent(vault);
		expect(readArchitectureClaims(vault)).toMatchObject({
			success: true,
			claims: [{ id: input.claim, writer: "agent", subjects: [input.subject] }],
		});
		const result = await editArchitectureModule(vault, input);
		if (!result.success) throw new Error(JSON.stringify(result));
		expect(events.filter((event) => event.type === "architecture_changed")).toMatchObject([
			{
				reason: "completed",
				revision: result.after,
				subjects: [input.subject],
				operation: {
					operationId: input.operationId,
					checkpoint: { request: { writer: input.writer, doing: input.doing } },
				},
			},
		]);
		const external = JSON.parse(readBytes(vault).toString());
		const changed = next("architecture_changed");
		writeFileSync(
			join(vault, "gateway.module.json"),
			JSON.stringify({ ...external, description: "An external correction" }),
		);
		await changed;
		expect(events.filter((event) => event.type === "architecture_changed")).toMatchObject([
			{ reason: "completed" },
			{ reason: "external", model: input.target.model, state: input.target.state },
		]);
		const invalid = next("architecture_status");
		writeFileSync(join(vault, "gateway.module.json"), "{");
		await invalid;
		expect(events.at(-1)).toMatchObject({
			type: "architecture_status",
			reading: { success: false, code: "MODEL_INVALID" },
		});
		expect(
			await editArchitectureModule(vault, { ...input, operationId: "invalid-input" }),
		).toMatchObject({ success: false, code: "MODEL_INVALID" });
		const reconnect: ArchitectureEvent[] = [];
		const close = watchArchitectureModel(vault, (event) => reconnect.push(event));
		close();
		expect(reconnect).toMatchObject([
			{ type: "architecture_snapshot", reading: { success: false, code: "MODEL_INVALID" } },
		]);
	} finally {
		stop();
	}
});

test("followers of a vault share one observation, and the last to leave ends it", async () => {
	const { vault } = fixture();
	const heard: ArchitectureEvent[][] = [[], []];
	const stopFirst = watchArchitectureModel(vault, (event) => heard[0]!.push(event));
	const stopSecond = watchArchitectureModel(vault, (event) => heard[1]!.push(event));
	const digest = (event: ArchitectureEvent | undefined) =>
		event?.type === "architecture_snapshot" && event.reading.success ? event.reading.digest : null;
	const opening = digest(heard[0]![0]);
	expect(opening).not.toBeNull();
	expect(digest(heard[1]![0])).toBe(opening);
	const external = JSON.parse(readBytes(vault).toString());
	writeFileSync(
		join(vault, "gateway.module.json"),
		JSON.stringify({ ...external, description: "Seen by every follower once" }),
	);
	stopFirst();
	while (heard[1]!.length < 2) await Bun.sleep(10);
	expect(heard[0]).toHaveLength(1);
	expect(heard[1]![1]).toMatchObject({ type: "architecture_changed", reason: "external" });
	stopSecond();
	writeFileSync(
		join(vault, "gateway.module.json"),
		JSON.stringify({ ...external, description: "Written while nothing follows" }),
	);
	const returning: ArchitectureEvent[] = [];
	watchArchitectureModel(vault, (event) => returning.push(event))();
	expect(digest(returning[0])).not.toBe(opening);
});

test("the metadata token holds while nothing changes and moves with any input", () => {
	const { vault } = fixture();
	const idle = modelFilesToken(vault);
	expect(modelFilesToken(vault)).toBe(idle);
	const file = join(vault, "gateway.module.json");
	writeFileSync(file, `${readFileSync(file, "utf8")}\n`);
	const edited = modelFilesToken(vault);
	expect(edited).not.toBe(idle);
	rmSync(file);
	expect(modelFilesToken(vault)).not.toBe(edited);
});

test("explicit scope exclusion and take-back reject the former writer without changing architecture", async () => {
	const { vault } = fixture();
	const input = await intent(vault);
	const before = readArchitectureModel(vault);
	expect(
		await claimArchitectureSubjects(vault, {
			target: input.target,
			writer: "other",
			reason: "another task",
			subjects: [input.subject],
		}),
	).toMatchObject({ success: false, code: "CLAIM_HELD" });
	const other = await claimArchitectureSubjects(vault, {
		target: input.target,
		writer: "other",
		reason: "another task",
		subjects: ["Shop#Worker"],
	});
	expect(other.success).toBe(true);
	expect(await editArchitectureModule(vault, { ...input, subject: "Shop#Worker" })).toMatchObject({
		success: false,
		code: "CLAIM_HELD",
	});
	await takeBackArchitectureClaim(vault, { claim: input.claim, origin: "human" });
	expect(await editArchitectureModule(vault, input)).toMatchObject({
		success: false,
		code: "CLAIM_REVOKED",
	});
	expect(readArchitectureModel(vault)).toEqual(before);
});

test("collection metadata edits respect the collection subject claim", async () => {
	const { vault } = fixture();
	writeFileSync(
		join(vault, "behavior.flows.json"),
		JSON.stringify({ schemaVersion: 1, id: "Behavior", name: "Behavior", flows: [] }),
	);
	const input = await structureIntent(vault, ["Shop"]);
	const original = readArchitectureModel(vault);
	const competing = await claimArchitectureSubjects(vault, {
		target: input.target,
		writer: "other",
		reason: "editing collection metadata",
		subjects: ["Shop#Behavior"],
	});
	if (!competing.success) throw new Error(JSON.stringify(competing));
	const request = {
		...input,
		changes: [{ type: "edit-collection" as const, collection: "Behavior", name: "Renamed" }],
	};
	expect(await editArchitectureModule(vault, request)).toMatchObject({
		success: false,
		code: "CLAIM_HELD",
	});
	expect(readArchitectureModel(vault)).toEqual(original);
	await releaseArchitectureClaim(vault, { claim: competing.claim.id, writer: "other" });
	expect(await editArchitectureModule(vault, request)).toMatchObject({
		success: false,
		code: "CLAIM_REQUIRED",
	});
	await releaseArchitectureClaim(vault, { claim: input.claim, writer: input.writer });
	const complete = await structureIntent(vault, ["Shop", "Shop#Behavior"]);
	expect(
		await editArchitectureModule(vault, {
			...request,
			...complete,
		}),
	).toMatchObject({ success: true, subjects: ["Shop#Behavior"] });
});
