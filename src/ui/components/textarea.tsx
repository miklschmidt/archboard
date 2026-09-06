import * as React from "react";
import { cn } from "@/ui/components/class-names";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring disabled:bg-input/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 text-control flex field-sizing-content min-h-16 w-full rounded-lg border bg-transparent px-2.5 py-2 font-normal transition-colors outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
