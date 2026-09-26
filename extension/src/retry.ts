/**
 * Retries an operation that fails until Google has stored a new event. The
 * wait between attempts can be cut short by `wake`, for example when the page
 * shows "Event saved".
 */
export interface Waker {
  wait(ms: number): Promise<void>;
  wake(): void;
}

export function makeWaker(sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Waker {
  let resolveEarly: (() => void) | null = null;
  let woken = false;
  return {
    wait(ms: number) {
      if (woken) {
        woken = false;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        resolveEarly = () => {
          resolveEarly = null;
          resolve();
        };
        void sleep(ms).then(() => resolveEarly?.());
      });
    },
    wake() {
      if (resolveEarly) resolveEarly();
      else woken = true; // the next wait returns at once
    },
  };
}

/** Attempt times after the first try: dense around the ~2 s Google takes to store a new event. */
export const COMMIT_WAITS = [250, 400, 400, 400, 400, 500, 600, 800, 1200];

/**
 * Runs `attempt` until it returns a value. `attempt` returns undefined to ask
 * for another try (the event is not stored yet); anything else ends the loop.
 */
export async function retryUntilStored<T>(attempt: () => Promise<T | undefined>, waker: Waker, waits: number[] = COMMIT_WAITS): Promise<T | undefined> {
  let result = await attempt();
  for (const ms of waits) {
    if (result !== undefined) return result;
    await waker.wait(ms);
    result = await attempt();
  }
  return result;
}

/** The id to label: the series for a recurring instance ("<series>_<date>"), else the id itself. */
export function seriesOf(id: string): string {
  const m = id.match(/^(.+)_\d{8}(?:T\d{6}Z)?$/);
  return m ? m[1] : id;
}
