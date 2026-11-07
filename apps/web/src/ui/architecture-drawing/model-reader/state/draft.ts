import { createContext } from "react";

/** Fill the composer of the focused pane's conversation, and show it. */
const ModelDraftContext = createContext<((text: string) => void) | null>(null);

export { ModelDraftContext };
