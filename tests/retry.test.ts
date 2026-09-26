import { describe, expect, it } from "vitest";
import { makeWaker, retryUntilStored, seriesOf } from "../extension/src/retry";

describe("retryUntilStored", () => {
  it("retries until the event is stored, then stops", async () => {
    let calls = 0;
    const waker = makeWaker(() => Promise.resolve());
    const r = await retryUntilStored(async () => (++calls >= 3 ? "ok" : undefined), waker, [10, 10, 10, 10]);
    expect(r).toBe("ok");
    expect(calls).toBe(3);
  });

  it("gives up after the last wait", async () => {
    let calls = 0;
    const r = await retryUntilStored(async () => { calls++; return undefined; }, makeWaker(() => Promise.resolve()), [1, 1]);
    expect(r).toBeUndefined();
    expect(calls).toBe(3);
  });

  it("a wake cuts the current wait short", async () => {
    const waker = makeWaker((ms) => new Promise((r) => setTimeout(r, ms)));
    let calls = 0;
    const started = Date.now();
    const p = retryUntilStored(async () => (++calls >= 2 ? "ok" : undefined), waker, [5_000]);
    setTimeout(() => waker.wake(), 30);
    expect(await p).toBe("ok");
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("a wake that arrives before the wait is not lost", async () => {
    const waker = makeWaker((ms) => new Promise((r) => setTimeout(r, ms)));
    waker.wake();
    const started = Date.now();
    await waker.wait(5_000);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("seriesOf", () => {
  it("maps recurring instances to their series", () => {
    expect(seriesOf("7j1ltsnk5v21ji3f1vupdsfr9o_20261007T150000Z")).toBe("7j1ltsnk5v21ji3f1vupdsfr9o");
    expect(seriesOf("abc_20261007")).toBe("abc");
    expect(seriesOf("09o49kv1cfqo2p5cco6hdinq2h")).toBe("09o49kv1cfqo2p5cco6hdinq2h");
  });
});
