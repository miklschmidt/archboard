import { Toaster as Sonner, toast } from "sonner";
import type { ComponentProps } from "react";

/** The shared toast viewport, styled with the shell color tokens. */
function Toaster(props: ComponentProps<typeof Sonner>) {
	return <Sonner className="toaster group" style={{ fontFamily: "var(--font-sans)" }} {...props} />;
}

export { Toaster, toast };
