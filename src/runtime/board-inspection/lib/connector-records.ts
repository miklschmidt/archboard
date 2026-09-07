import type { DecodedRecord } from "@/runtime/board-inspection/lib/decode";

/** The board's decoded records, looked up by the identity they claim. */
type RecordMap = ReadonlyMap<string, DecodedRecord>;

/** One record's raw fields, exactly as the note held them. */
type RawRecord = Readonly<Record<string, unknown>>;

export type { RawRecord, RecordMap };
