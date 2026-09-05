import type { CodexIngressConformance, CodexOutputConformance } from "../index.js";

type Equal<Left, Right> =
	(<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
		? true
		: false;
type Assert<Value extends true> = Value;

declare const brand: unique symbol;
type Brand = number & { readonly [brand]: "wire" };
type OutputFailure = { readonly __schemaOutputMustExtendCodexGeneratedWire: never };
type InputFailure = { readonly __codexGeneratedWireMustExtendSchemaInput: never };

export type OptionalObjectValuesAreEquivalent = Assert<
	Equal<
		CodexOutputConformance<
			{ nested?: { rows: ({ value?: string } | null)[] } },
			{ nested?: { rows: ({ value?: string | undefined } | null)[] } | undefined }
		>,
		unknown
	>
>;

export type IngressChecksBothDirections = Assert<
	Equal<
		CodexIngressConformance<
			{ value?: string },
			{ value?: string | undefined },
			{ value?: string | undefined }
		>,
		unknown
	>
>;

export type RequiredKeysRemainRequired = Assert<
	Equal<CodexOutputConformance<{ value: string }, { value?: string }>, OutputFailure>
>;

export type RequiredUndefinedRemainsObservable = Assert<
	Equal<CodexOutputConformance<{ value: string }, { value: string | undefined }>, OutputFailure>
>;

export type NarrowSchemaInputStillFails = Assert<
	Equal<
		CodexIngressConformance<{ value?: string }, { value: string }, { value: string }>,
		InputFailure
	>
>;

export type BrandsRemainObservable = Assert<
	Equal<CodexOutputConformance<{ value: Brand }, { value: number }>, OutputFailure>
>;
