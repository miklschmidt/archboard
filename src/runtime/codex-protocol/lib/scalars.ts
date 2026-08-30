import { z } from "zod";

/** Use only where Codex's generated 0.151.0 contract deliberately says JsonValue. */
export const JsonValueSchema = z.json();
export const StringRecordSchema = z.record(z.string(), z.string());
/** A JSON object whose keys and values are intentionally supplied by Codex. */
export const JsonObjectSchema = z.record(z.string(), JsonValueSchema);
/** A dynamic string-keyed JSON map allowed by the generated contract. */
export const JsonRecordSchema = z.record(z.string(), JsonValueSchema);
export const FiniteNumberSchema = z.number().finite();
export const IntegerSchema = FiniteNumberSchema.int();
export const NonNegativeIntegerSchema = IntegerSchema.nonnegative();
export const RequestIdSchema = z.union([z.string(), IntegerSchema]);

export const NullableStringSchema = z.string().nullable();
export const NullableNumberSchema = FiniteNumberSchema.nullable();
export const NullableIntegerSchema = IntegerSchema.nullable();

/** Validate the generated fields while retaining forward-compatible object members. */
export function looseObject<Shape extends z.ZodRawShape>(shape: Shape) {
	return z.looseObject(shape);
}
