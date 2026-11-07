"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "#ui/rules/class-names.ts";

function Tabs({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) {
	return (
		<TabsPrimitive.Root
			data-slot="tabs"
			data-orientation={orientation}
			className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
			{...props}
		/>
	);
}

const tabsListVariants = cva(
	"group/tabs-list inline-flex w-fit items-center justify-center rounded-panel p-[3px] text-muted-foreground group-data-horizontal/tabs:h-8 group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none",
	{
		variants: {
			variant: {
				default: "bg-muted",
				line: "gap-1 bg-transparent",
				// Archboard (TASK-150.08): flat 28px tabs on one bottom rule, a 2px primary
				// underline on the active tab.
				underline:
					"w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0 group-data-horizontal/tabs:h-7",
				// Archboard: the site's segmented tabs. A trough holds the choices, and the chosen one
				// rises out of it as a raised face with a gold underline (`trough`, `chosen-face`).
				trough: "trough group-data-horizontal/tabs:h-auto",
				// Archboard: the site's content selector. The same trough holds a few large tabs of
				// equal width, each with an icon, a label and a line that says what it shows.
				selector:
					"trough grid w-full auto-cols-fr grid-flow-col items-stretch gap-1 p-1 group-data-horizontal/tabs:h-auto",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

function TabsList({
	className,
	variant = "default",
	...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
	return (
		<TabsPrimitive.List
			data-slot="tabs-list"
			data-variant={variant}
			className={cn(tabsListVariants({ variant }), className)}
			{...props}
		/>
	);
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
	return (
		<TabsPrimitive.Tab
			data-slot="tabs-trigger"
			className={cn(
				"group/tab text-foreground/60 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring focus-visible:outline-ring dark:text-muted-foreground dark:hover:text-foreground text-control group-data-[variant=default]/tabs-list:data-active:shadow-raised rounded-control relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 border border-transparent px-1.5 py-0.5 whitespace-nowrap transition-all group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start focus-visible:ring-2 focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 aria-disabled:pointer-events-none aria-disabled:opacity-50 group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				"group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
				"data-active:bg-background data-active:text-foreground dark:data-active:border-input dark:data-active:bg-input/30 dark:data-active:text-foreground",
				"after:bg-foreground after:absolute after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
				// Archboard (TASK-150.08) underline variant: flat, inset focus ring. The caller
				// sets the type role on the label: cn drops a theme text size beside a colour.
				// Archboard trough variant: a 28px choice in muted ink, raised in full ink when chosen.
				"group-data-[variant=trough]/tabs-list:text-muted-foreground group-data-[variant=trough]/tabs-list:hover:text-foreground group-data-[variant=trough]/tabs-list:rounded-control group-data-[variant=trough]/tabs-list:data-active:chosen-face group-data-[variant=trough]/tabs-list:h-7 group-data-[variant=trough]/tabs-list:border-0 group-data-[variant=trough]/tabs-list:px-2 group-data-[variant=trough]/tabs-list:font-medium group-data-[variant=trough]/tabs-list:focus-visible:ring-inset dark:group-data-[variant=trough]/tabs-list:data-active:border-0",
				// Archboard selector variant: a large choice that holds its icon, label and gloss from
				// the top left, in muted ink, raised in full ink with a gold icon when chosen.
				"group-data-[variant=selector]/tabs-list:text-muted-foreground group-data-[variant=selector]/tabs-list:hover:text-foreground group-data-[variant=selector]/tabs-list:data-active:chosen-face group-data-[variant=selector]/tabs-list:rounded-control group-data-[variant=selector]/tabs-list:hover:bg-face/50 group-data-[variant=selector]/tabs-list:data-active:[&_svg]:text-primary-mark group-data-[variant=selector]/tabs-list:h-auto group-data-[variant=selector]/tabs-list:items-start group-data-[variant=selector]/tabs-list:justify-start group-data-[variant=selector]/tabs-list:gap-3 group-data-[variant=selector]/tabs-list:border-0 group-data-[variant=selector]/tabs-list:px-4 group-data-[variant=selector]/tabs-list:py-3 group-data-[variant=selector]/tabs-list:text-left group-data-[variant=selector]/tabs-list:whitespace-normal group-data-[variant=selector]/tabs-list:focus-visible:ring-inset dark:group-data-[variant=selector]/tabs-list:data-active:border-0 group-data-[variant=selector]/tabs-list:[&_svg:not([class*='size-'])]:size-[18px]",
				"group-data-[variant=underline]/tabs-list:text-muted-foreground group-data-[variant=underline]/tabs-list:data-active:text-foreground group-data-[variant=underline]/tabs-list:hover:text-foreground group-data-[variant=underline]/tabs-list:focus-visible:ring-ring group-data-[variant=underline]/tabs-list:after:bg-primary group-data-[variant=underline]/tabs-list:h-full group-data-[variant=underline]/tabs-list:flex-none group-data-[variant=underline]/tabs-list:rounded-none group-data-[variant=underline]/tabs-list:border-0 group-data-[variant=underline]/tabs-list:px-2 group-data-[variant=underline]/tabs-list:transition-none group-data-[variant=underline]/tabs-list:after:-bottom-px! group-data-[variant=underline]/tabs-list:focus-visible:ring-2 group-data-[variant=underline]/tabs-list:focus-visible:outline-none group-data-[variant=underline]/tabs-list:focus-visible:ring-inset group-data-[variant=underline]/tabs-list:data-active:bg-transparent group-data-[variant=underline]/tabs-list:data-active:after:opacity-100 dark:group-data-[variant=underline]/tabs-list:data-active:border-0 dark:group-data-[variant=underline]/tabs-list:data-active:bg-transparent",
				className,
			)}
			{...props}
		/>
	);
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
	return (
		<TabsPrimitive.Panel
			data-slot="tabs-content"
			className={cn("text-body flex-1 outline-none", className)}
			{...props}
		/>
	);
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants };
