// The server's thread link: the one explicit link naming one workhorse, and the
// controller that runs each link and sign-in command against the pane it was
// asked from. The agent setup (`@/ui/agent-setup`) drives it; nothing here
// renders.

export { createThreadLinkController } from "@/ui/workbench-thread-link/lib/controller";
