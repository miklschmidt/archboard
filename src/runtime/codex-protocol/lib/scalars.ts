import { z } from "zod";

export const JsonValueSchema = z.json();
export const ObjectSchema = z.looseObject({});
export const StringRecordSchema = z.record(z.string(), z.string());
export const JsonRecordSchema = z.record(z.string(), JsonValueSchema);
export const FiniteNumberSchema = z.number().finite();
export const IntegerSchema = FiniteNumberSchema.int();
export const NonNegativeIntegerSchema = IntegerSchema.nonnegative();
export const RequestIdSchema = z.union([z.string(), IntegerSchema]);

export const NullableStringSchema = z.string().nullable();
export const NullableNumberSchema = FiniteNumberSchema.nullable();
export const NullableIntegerSchema = IntegerSchema.nullable();

export function looseObject<Shape extends z.ZodRawShape>(shape: Shape) {
	return z.looseObject(shape);
}
