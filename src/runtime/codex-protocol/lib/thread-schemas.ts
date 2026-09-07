import { z } from "zod";

import {
	SessionSourceSchema,
	ThreadHistoryModeSchema,
	ThreadSectionSchema,
	ThreadStatusSchema,
	ThreadRealtimeItemSchema,
	TurnErrorSchema,
	TurnStatusSchema,
} from "@/runtime/codex-protocol/lib/core-schemas";
import { ThreadItemSchema } from "@/runtime/codex-protocol/lib/item-schemas";
import { FiniteNumberSchema, looseObject } from "@/runtime/codex-protocol/lib/scalars";

const TurnItemsViewSchema = z.enum(["notLoaded", "summary", "full"]);

const TurnSchema = z.lazy(() =>
	looseObject({
		id: z.string(),
		items: z.array(ThreadItemSchema),
		itemsView: TurnItemsViewSchema,
		status: TurnStatusSchema,
		error: TurnErrorSchema.nullable(),
		startedAt: FiniteNumberSchema.nullable(),
		completedAt: FiniteNumberSchema.nullable(),
		durationMs: FiniteNumberSchema.nullable(),
	}),
);

const ThreadSchema = z.lazy(() =>
	looseObject({
		id: z.string(),
		extra: z.strictObject({}).nullable(),
		sessionId: z.string(),
		forkedFromId: z.string().nullable(),
		parentThreadId: z.string().nullable(),
		preview: z.string(),
		ephemeral: z.boolean(),
		section: ThreadSectionSchema.nullable(),
		sectionEnteredAt: FiniteNumberSchema.nullable(),
		projectId: z.string().nullable(),
		historyMode: ThreadHistoryModeSchema,
		modelProvider: z.string(),
		createdAt: FiniteNumberSchema,
		updatedAt: FiniteNumberSchema,
		recencyAt: FiniteNumberSchema.nullable(),
		status: ThreadStatusSchema,
		path: z.string().nullable(),
		cwd: z.string(),
		cliVersion: z.string(),
		source: SessionSourceSchema,
		canAcceptDirectInput: z.boolean().nullable(),
		threadSource: z.string().nullable(),
		agentNickname: z.string().nullable(),
		agentRole: z.string().nullable(),
		gitInfo: looseObject({
			sha: z.string().nullable(),
			branch: z.string().nullable(),
			originUrl: z.string().nullable(),
		}).nullable(),
		name: z.string().nullable(),
		turns: z.array(TurnSchema),
	}),
);

const ThreadTimelineEntrySchema = z.discriminatedUnion("type", [
	looseObject({
		type: z.literal("item"),
		position: FiniteNumberSchema,
		turnId: z.string(),
		item: ThreadItemSchema,
	}),
	looseObject({
		type: z.literal("realtime"),
		position: FiniteNumberSchema,
		item: ThreadRealtimeItemSchema,
	}),
	looseObject({
		type: z.literal("turnStarted"),
		position: FiniteNumberSchema,
		turnId: z.string(),
		startedAt: FiniteNumberSchema.nullable(),
	}),
	looseObject({
		type: z.literal("turnCompleted"),
		position: FiniteNumberSchema,
		turnId: z.string(),
		status: TurnStatusSchema,
		error: TurnErrorSchema.nullable(),
		startedAt: FiniteNumberSchema.nullable(),
		completedAt: FiniteNumberSchema.nullable(),
		durationMs: FiniteNumberSchema.nullable(),
	}),
]);

const ThreadRealtimeTimelineStateSchema = looseObject({
	data: z.array(ThreadTimelineEntrySchema),
	nextCursor: z.string().nullable(),
	activeRealtimeSessionAtPageStart: z.string().nullable(),
});

const ThreadItemPageSchema = looseObject({
	data: z.array(looseObject({ turnId: z.string(), item: ThreadItemSchema })),
	nextCursor: z.string().nullable(),
	backwardsCursor: z.string().nullable(),
});

const ThreadTurnPageSchema = looseObject({
	data: z.array(TurnSchema),
	nextCursor: z.string().nullable(),
	backwardsCursor: z.string().nullable(),
});

const ThreadPageSchema = looseObject({
	data: z.array(ThreadSchema),
	nextCursor: z.string().nullable(),
	backwardsCursor: z.string().nullable(),
});

const LoadedThreadPageSchema = looseObject({
	data: z.array(z.string()),
	nextCursor: z.string().nullable(),
});

const ThreadReadSchema = looseObject({ thread: ThreadSchema });
const TurnStartSchema = looseObject({ turn: TurnSchema });
const QueueStartSchema = looseObject({ turn: TurnSchema });

export {
	TurnItemsViewSchema,
	TurnSchema,
	ThreadSchema,
	ThreadTimelineEntrySchema,
	ThreadRealtimeTimelineStateSchema,
	ThreadItemPageSchema,
	ThreadTurnPageSchema,
	ThreadPageSchema,
	LoadedThreadPageSchema,
	ThreadReadSchema,
	TurnStartSchema,
	QueueStartSchema,
};
