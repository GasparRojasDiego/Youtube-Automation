import { describe, it, expect } from "vitest";
import { limiter, mapLimit, sleep } from "./util";

describe("limiter / mapLimit", () => {
  it("nunca supera el límite y conserva el orden de los resultados", async () => {
    let active = 0, peak = 0;
    const out = await mapLimit([30, 5, 20, 10, 1, 15, 8], 3, async (ms, i) => {
      active++; peak = Math.max(peak, active);
      await sleep(ms);
      active--;
      return i;
    });
    expect(peak).toBe(3);
    expect(out).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });
  it("libera el turno aunque la tarea falle", async () => {
    const run = limiter(1);
    await expect(run(async () => { throw new Error("x"); })).rejects.toThrow("x");
    expect(await run(async () => 7)).toBe(7);
  });
  it("con límite 1 ejecuta en serie", async () => {
    const order: string[] = [];
    const run = limiter(1);
    await Promise.all([run(async () => { order.push("a1"); await sleep(10); order.push("a2"); }), run(async () => { order.push("b1"); order.push("b2"); })]);
    expect(order).toEqual(["a1", "a2", "b1", "b2"]);
  });
});
