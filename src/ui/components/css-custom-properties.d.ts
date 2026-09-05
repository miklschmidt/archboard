// The official shadcn Base UI components set CSS custom properties through the
// React style prop (sidebar width, toggle-group gap, skeleton width). React's
// CSSProperties has no index for `--*` names, which is why upstream asserts;
// this augmentation types those names instead so no assertion is needed.

/** A CSS custom property name as it appears in a React style object. */
export type CssCustomPropertyName = `--${string}`;

declare module "react" {
	interface CSSProperties {
		[customProperty: CssCustomPropertyName]: string | number | undefined;
	}
}
