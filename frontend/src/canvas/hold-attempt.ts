export interface HoldAttempt {
  board: string
  generation: number
  promise: Promise<void> | null
}

/** True only for the exact hold request still owned by this pane generation. */
export function ownsHoldAttempt(
  current: HoldAttempt | null,
  attempt: HoldAttempt,
  promise: Promise<void>,
  generation: number
): boolean {
  return current === attempt
    && attempt.promise === promise
    && attempt.generation === generation
}
