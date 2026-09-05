import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
	createCodexEpochStore,
	type CodexEpochStore,
	type EpochExecutionProof,
	type EpochOperationRecord,
	type EpochStageInput,
} from "../../codex-epoch/index.ts";
import {
	createIdentityAuthority,
	type IdentityAuthority,
} from "../../../shared/codex-workbench-identity/index.ts";
import type { ThreadLinkTarget } from "../index.ts";

const INSTRUCTION_HASH = "1".repeat(64);
const MANIFEST_HASH = "2".repeat(64);

export interface RealEpochFixture {
	readonly authority: IdentityAuthority;
	readonly store: CodexEpochStore;
	readonly record: EpochOperationRecord;
	readonly proof: EpochExecutionProof | null;
	readonly target: ThreadLinkTarget;
	readonly cleanup: () => void;
}

export interface RealEpochOptions {
	readonly source?: string;
	readonly operationId?: string;
	readonly kind?: string;
	readonly rpc?: string | null;
	readonly unknownReason?: string;
	readonly threadId?: string | null;
	readonly turnId?: string | null;
}

export function realEpochFixture(
	authority: IdentityAuthority = createIdentityAuthority(),
	options: RealEpochOptions = {},
): RealEpochFixture {
	const parent = mkdtempSync(join("/tmp", "archboard-thread-link-epoch-"));
	const root = join(parent, "epoch");
	const codexHome = join(parent, "codex-home");
	const sqliteHome = join(parent, "codex-sqlite");
	mkdirSync(root, { recursive: true, mode: 0o700 });
	mkdirSync(codexHome, { recursive: true, mode: 0o700 });
	mkdirSync(sqliteHome, { recursive: true, mode: 0o700 });
	const store = createCodexEpochStore({
		rootDirectory: root,
		codexHome,
		sqliteHome,
		now: () => 100,
	});
	const operationId = options.operationId ?? "link-1";
	const threadId =
		options.threadId === null
			? null
			: authority.decoder.adoptThreadId(options.threadId ?? "target");
	const turnId =
		options.turnId === null
			? null
			: options.turnId === undefined
				? null
				: authority.decoder.adoptTurnId(options.turnId);
	try {
		store.startEpoch(epochInput(authority, "epoch-start", "epoch_start"));
		const transaction = store.stageOperation(
			epochInput(
				authority,
				operationId,
				options.kind ?? "create_thread",
				store.snapshot().cas,
				options.rpc === undefined ? "thread/start" : options.rpc,
			),
		);
		const record =
			options.unknownReason === undefined
				? store.commitOperation(transaction, {
						threadId,
						turnId,
						threadSource: options.source ?? "appServer",
					})
				: store.markOutcomeUnknown(transaction, options.unknownReason, { threadId, turnId });
		const proof =
			record.status === "committed"
				? store.assertCurrent({
						childId: authority.validator.childId,
						epoch: authority.validator.epoch,
						operationId,
						threadId,
					})
				: null;
		const target: ThreadLinkTarget = {
			threadId: authority.decoder.adoptThreadId(options.threadId ?? "target"),
			childId: authority.validator.childId,
			epoch: authority.validator.epoch,
			operationId,
			provenance: proof,
		};
		let cleaned = false;
		return {
			authority,
			store,
			record,
			proof,
			target,
			cleanup: () => {
				if (cleaned) return;
				cleaned = true;
				store.close();
				rmSync(parent, { recursive: true, force: true });
			},
		};
	} catch (error) {
		store.close();
		rmSync(parent, { recursive: true, force: true });
		throw error;
	}
}

function epochInput(
	authority: IdentityAuthority,
	operationId: string,
	kind: string,
	expected?: EpochStageInput["expected"],
	rpc: string | null = kind === "epoch_start" ? "epoch/start" : "turn/start",
): EpochStageInput {
	return {
		childId: authority.validator.childId,
		epoch: authority.validator.epoch,
		operationId,
		kind,
		rpc,
		workspaceRoot: "/workspace/archboard",
		instructionHash: INSTRUCTION_HASH,
		manifestHash: MANIFEST_HASH,
		expected,
	};
}
