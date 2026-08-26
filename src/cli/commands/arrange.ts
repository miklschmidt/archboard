import { parseArgs, CliUsageError } from "./args.js";
import { printJson } from "./util.js";
import { ensureCanvasRunning } from "../../runtime/engine/spawn.js";
import {
	alignElements,
	distributeElements,
	setElementsLocked,
	groupElements,
	ungroupElements,
	duplicateElements,
} from "../../runtime/engine/element-ops.js";
import type { Alignment, Direction } from "../../runtime/engine/element-ops.js";

const ALIGNMENTS = new Set(["left", "center", "right", "top", "middle", "bottom"]);
const DIRECTIONS = new Set(["horizontal", "vertical"]);

function parseIds(value: unknown, usage: string): string[] {
	if (typeof value !== "string" || !value.trim()) {
		throw new CliUsageError(usage);
	}
	return value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export async function arrange(argv: string[]): Promise<void> {
	const { positionals, flags } = parseArgs(argv, {
		ids: { takesValue: true },
		to: { takesValue: true },
		group: { takesValue: true },
		offset: { takesValue: true },
	});

	const op = positionals[0];
	const tail = arrangeTail(flags);
	switch (op) {
		case "align":
			return arrangeAlign(tail);
		case "distribute":
			return arrangeDistribute(tail);
		case "group":
			return arrangeGroup(tail);
		case "ungroup":
			return arrangeUngroup(tail);
		case "lock":
			return arrangeLock(tail);
		case "unlock":
			return arrangeUnlock(tail);
		case "duplicate":
			return arrangeDuplicate(tail);
		default:
			throw new CliUsageError(
				"Usage: arrange align|distribute|group|ungroup|lock|unlock|duplicate ...",
			);
	}
}

const ARRANGE_FLAGS = {
	ids: { takesValue: true },
	to: { takesValue: true },
	group: { takesValue: true },
	offset: { takesValue: true },
} as const;

function arrangeTail(flags: Record<string, unknown>): string[] {
	return Object.entries(flags).flatMap(([name, value]) =>
		typeof value === "string" ? [`--${name}`, value] : value ? [`--${name}`] : [],
	);
}

export async function arrangeAlign(argv: string[]): Promise<void> {
	const { flags } = parseArgs(argv, ARRANGE_FLAGS);
	await ensureCanvasRunning();
	const ids = parseIds(
		flags.ids,
		"Usage: arrange align --ids a,b,c --to left|center|right|top|middle|bottom",
	);
	const to = flags.to as string | undefined;
	if (!to || !ALIGNMENTS.has(to)) {
		throw new CliUsageError("arrange align requires --to left|center|right|top|middle|bottom");
	}
	printJson(await alignElements(ids, to as Alignment));
	return;
}

export async function arrangeDistribute(argv: string[]): Promise<void> {
	const { flags } = parseArgs(argv, ARRANGE_FLAGS);
	await ensureCanvasRunning();
	const ids = parseIds(flags.ids, "Usage: arrange distribute --ids a,b,c --to horizontal|vertical");
	const to = flags.to as string | undefined;
	if (!to || !DIRECTIONS.has(to)) {
		throw new CliUsageError("arrange distribute requires --to horizontal|vertical");
	}
	printJson(await distributeElements(ids, to as Direction));
	return;
}

export async function arrangeGroup(argv: string[]): Promise<void> {
	const { flags } = parseArgs(argv, ARRANGE_FLAGS);
	await ensureCanvasRunning();
	const ids = parseIds(flags.ids, "Usage: arrange group --ids a,b,c");
	printJson(await groupElements(ids));
	return;
}

export async function arrangeUngroup(argv: string[]): Promise<void> {
	const { flags } = parseArgs(argv, ARRANGE_FLAGS);
	await ensureCanvasRunning();
	const groupId = flags.group as string | undefined;
	if (!groupId) throw new CliUsageError("Usage: arrange ungroup --group <groupId>");
	printJson(await ungroupElements(groupId));
	return;
}

async function arrangeLockState(argv: string[], locked: boolean): Promise<void> {
	const { flags } = parseArgs(argv, ARRANGE_FLAGS);
	await ensureCanvasRunning();
	const ids = parseIds(flags.ids, `Usage: arrange ${locked ? "lock" : "unlock"} --ids a,b,c`);
	const result = await setElementsLocked(ids, locked);
	printJson({ [locked ? "locked" : "unlocked"]: true, ...result });
	return;
}

export async function arrangeLock(argv: string[]): Promise<void> {
	return arrangeLockState(argv, true);
}

export async function arrangeUnlock(argv: string[]): Promise<void> {
	return arrangeLockState(argv, false);
}

export async function arrangeDuplicate(argv: string[]): Promise<void> {
	const { flags } = parseArgs(argv, ARRANGE_FLAGS);
	await ensureCanvasRunning();
	const ids = parseIds(flags.ids, "Usage: arrange duplicate --ids a,b,c [--offset 20,20]");
	let offsetX = 20,
		offsetY = 20;
	if (typeof flags.offset === "string") {
		const parts = flags.offset.split(",").map((s) => Number(s.trim()));
		if (parts.length !== 2 || parts.some(Number.isNaN)) {
			throw new CliUsageError('--offset expects "x,y"');
		}
		[offsetX, offsetY] = parts as [number, number];
	}
	const result = await duplicateElements(ids, offsetX, offsetY);
	printJson({
		success: true,
		count: result.duplicates.length,
		offsetX: result.offsetX,
		offsetY: result.offsetY,
		elements: result.canvasElements,
	});
	return;
}
