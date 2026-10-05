// A variant's lifecycle as the chrome shows it: its mark, whether it recedes,
// the order a board's variants are listed in, and the timeline their list
// draws: one line with branches. The navigator and the header
// use it, and a pane's sidebar can, because it depends on no shell or pane
// composition.

export { VariantMark, type VariantMarkProps } from "@/ui/variant-lifecycle/components/VariantMark";
export { TimelineLane, type LaneGeometry } from "@/ui/variant-lifecycle/components/TimelineLane";
export { timelineLanes, type Lane } from "@/ui/variant-lifecycle/lib/timeline";
export {
	variantOrder,
	variantRecedes,
	type ListedLifecycle,
} from "@/ui/variant-lifecycle/lib/lifecycle";
