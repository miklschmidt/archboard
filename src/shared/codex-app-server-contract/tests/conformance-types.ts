import type { CodexIngressConformance, CodexOutputConformance } from "../index.js";

type Equal<Left, Right> = [Left] extends [Right] ? ([Right] extends [Left] ? true : false) : false;
type Assert<Value extends true> = Value;

declare const brand: unique symbol;
type Brand = number & { readonly [brand]: "wire" };
interface OutputFailure {
	readonly __schemaOutputMustExtendCodexGeneratedWire: never;
}
interface InputFailure {
	readonly __codexGeneratedWireMustExtendSchemaInput: never;
}

type OptionalObjectValuesAreEquivalent = Assert<
	Equal<
		CodexOutputConformance<
			{ nested?: { rows: ({ value?: string } | null)[] } },
			{ nested?: { rows: ({ value?: string | undefined } | null)[] } | undefined }
		>,
		unknown
	>
>;

type IngressChecksBothDirections = Assert<
	Equal<
		CodexIngressConformance<
			{ value?: string },
			{ value?: string | undefined },
			{ value?: string | undefined }
		>,
		unknown
	>
>;

type RequiredKeysRemainRequired = Assert<
	Equal<CodexOutputConformance<{ value: string }, { value?: string }>, OutputFailure>
>;

type RequiredUndefinedRemainsObservable = Assert<
	Equal<CodexOutputConformance<{ value: string }, { value: string | undefined }>, OutputFailure>
>;

type NarrowSchemaInputStillFails = Assert<
	Equal<
		CodexIngressConformance<{ value?: string }, { value: string }, { value: string }>,
		InputFailure
	>
>;

type BrandsRemainObservable = Assert<
	Equal<CodexOutputConformance<{ value: Brand }, { value: number }>, OutputFailure>
>;

export {
	type OptionalObjectValuesAreEquivalent,
	type IngressChecksBothDirections,
	type RequiredKeysRemainRequired,
	type RequiredUndefinedRemainsObservable,
	type NarrowSchemaInputStillFails,
	type BrandsRemainObservable,
};
