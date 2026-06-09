import { describe, expect, it } from "vitest";
import { rollupBalances, simplifyDebts, venmoAppUrl, venmoPayUrl } from "../venmo";

describe("venmoPayUrl", () => {
  it("builds a https://venmo.com/<user>?... URL with txn=pay", () => {
    const url = venmoPayUrl({ username: "hank-aaron", amount: 12.5, note: "Skin H7" });
    expect(url.startsWith("https://venmo.com/hank-aaron?")).toBe(true);
    expect(url).toContain("txn=pay");
    expect(url).toContain("amount=12.50");
    expect(url).toContain("note=Skin+H7");
  });
  it("strips a leading @ from the username", () => {
    const url = venmoPayUrl({ username: "@jake", amount: 5 });
    expect(url.startsWith("https://venmo.com/jake?")).toBe(true);
  });
  it("formats amount with 2 decimals", () => {
    expect(venmoPayUrl({ username: "x", amount: 7 })).toContain("amount=7.00");
    expect(venmoPayUrl({ username: "x", amount: 7.1 })).toContain("amount=7.10");
  });
});

describe("venmoAppUrl", () => {
  it("uses the venmo:// scheme and includes recipients param", () => {
    const url = venmoAppUrl({ username: "kyle", amount: 20, note: "CTP #11" });
    expect(url.startsWith("venmo://paycharge?")).toBe(true);
    expect(url).toContain("recipients=kyle");
    expect(url).toContain("amount=20.00");
  });
});

describe("rollupBalances", () => {
  it("nets edges into per-player balances", () => {
    const bal = rollupBalances([
      { from: "A", to: "B", amount: 5 },
      { from: "A", to: "C", amount: 3 },
      { from: "B", to: "A", amount: 1 },
    ]);
    const get = (id: string) => bal.find((b) => b.player_id === id)?.amount ?? 0;
    expect(get("A")).toBe(-7); // owed 5+3, got back 1
    expect(get("B")).toBe(4); // got 5, paid 1
    expect(get("C")).toBe(3);
  });
});

describe("simplifyDebts", () => {
  it("produces N-1 or fewer transfers for a simple 3-way", () => {
    // A owes 6, B is owed 4, C is owed 2.
    const transfers = simplifyDebts([
      { player_id: "A", amount: -6 },
      { player_id: "B", amount: 4 },
      { player_id: "C", amount: 2 },
    ]);
    expect(transfers.length).toBe(2);
    // Every debtor ends up at 0.
    const m = new Map<string, number>([
      ["A", -6],
      ["B", 4],
      ["C", 2],
    ]);
    for (const t of transfers) {
      m.set(t.player_id_from, (m.get(t.player_id_from) ?? 0) + t.amount);
      m.set(t.player_id_to, (m.get(t.player_id_to) ?? 0) - t.amount);
    }
    for (const v of m.values()) expect(Math.abs(v)).toBeLessThan(0.01);
  });

  it("handles a chain that classical pairing would do in 3 transfers in fewer", () => {
    // A → B → C → D pattern. Greedy max-match should resolve in 1 transfer if
    // the chain cancels (it does in this contrived case): -10, +10 cancels first.
    const transfers = simplifyDebts([
      { player_id: "A", amount: -10 },
      { player_id: "B", amount: 0 },
      { player_id: "C", amount: 0 },
      { player_id: "D", amount: 10 },
    ]);
    expect(transfers.length).toBe(1);
    expect(transfers[0]).toMatchObject({ player_id_from: "A", player_id_to: "D", amount: 10 });
  });

  it("ignores zero balances", () => {
    const t = simplifyDebts([
      { player_id: "A", amount: 0 },
      { player_id: "B", amount: 0 },
    ]);
    expect(t).toEqual([]);
  });

  it("rounds to cents (no float drift)", () => {
    const t = simplifyDebts([
      { player_id: "A", amount: -0.1 - 0.2 }, // classic 0.30000000000000004
      { player_id: "B", amount: 0.3 },
    ]);
    expect(t.length).toBe(1);
    expect(t[0].amount).toBeCloseTo(0.3, 2);
  });
});
