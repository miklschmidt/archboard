import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "#ui/rules/class-names.ts";

const badgeVariants = cva(
	"group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden border border-transparent whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
	{
		variants: {
			// Archboard sizes (TASK-150.08): `technical` is the 16px mono mark for a
			// level, a type or a pane letter; `chip` is the 24px flat state chip.
			size: {
				default: "h-5 rounded-chip px-2 py-0.5 text-body font-medium",
				technical: "text-technical h-4 rounded-chip px-1 font-mono font-medium",
				chip: "text-body h-6 gap-1.5 rounded-chip px-2 font-normal",
				// The site's chip: 22px, 2px corners, the words at 12px.
				label: "text-body h-[22px] gap-1.5 rounded-chip px-2",
			},
			variant: {
				default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
				// Archboard: how many of something, as the low slab the picture draws for its
				// small parts. Its front edge stands under its box. On a chosen tab, which is a
				// raised face, the count sits in a well cut into it instead. It has no border, so
				// its highlight lies on its edge: the glint on a slab's top, the lip at a well's
				// foot. The number stands in the middle of the face below the glint, or of the
				// floor above the lip.
				count:
					"mb-0.5 min-w-5 border-0 bg-slab-face tabular-nums text-foreground shadow-slab group-data-active/tab:mb-0 group-data-active/tab:pb-0.5 group-data-active/tab:bg-tray-sink group-data-active/tab:shadow-well",
				// Archboard: the site's chips. A solid chip says changed in full, and a tinted one says
				// it quietly. Their words keep APCA Lc 60: white on the chalk orange, near black on the
				// graphite one, and ink on the tint, because the orange itself reads only Lc 51 to 56
				// there.
				changed: "bg-standing-changed text-white dark:text-[oklch(0.12_0.02_50)] font-semibold",
				"changed-tint":
					"bg-standing-changed/14 text-foreground font-semibold inset-ring inset-ring-standing-changed/50",
				secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
				destructive:
					"bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
				outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
				ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
				link: "text-primary-text decoration-primary-mark underline underline-offset-4 hover:decoration-2",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Badge({
	className,
	variant = "default",
	size = "default",
	render,
	...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
	return useRender({
		defaultTagName: "span",
		props: mergeProps<"span">(
			{
				className: cn(badgeVariants({ variant, size }), className),
			},
			props,
		),
		render,
		state: {
			slot: "badge",
			variant,
		},
	});
}

export { Badge, badgeVariants };
