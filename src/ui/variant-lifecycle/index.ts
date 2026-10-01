// A variant's lifecycle as the chrome shows it: its mark, whether it recedes,
// and the order a board's variants are listed in. The navigator and the header
// use it, and a pane's sidebar can, because it depends on no shell or pane
// composition.

export { VariantMark, type VariantMarkProps } from "@/ui/variant-lifecycle/components/VariantMark";
export {
	variantOrder,
	variantRecedes,
	type ListedLifecycle,
} from "@/ui/variant-lifecycle/lib/lifecycle";
