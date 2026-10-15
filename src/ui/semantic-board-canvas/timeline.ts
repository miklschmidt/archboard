// A board's variants as one timeline, as an entrypoint of the module. The
// About page draws it itself and needs none of this by name; it is here so
// that where each variant sits on the timeline can be held to from outside the
// module's private folders.

export {
	variantTimeline,
	type TimelineEntry,
} from "@/ui/semantic-board-canvas/lib/variant-timeline";
