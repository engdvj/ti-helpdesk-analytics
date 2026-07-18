import { describe, expect, it } from "vitest";

import { findLeaderIds } from "./comparison";

describe("comparativo da corrida", () => {
  it("identifica o maior ou o menor conforme a direcao da metrica", () => {
    const values = [{ usersId: 1, value: 83.4 }, { usersId: 2, value: 60 }];
    expect([...findLeaderIds(values, true)]).toEqual([1]);
    expect([...findLeaderIds(values, false)]).toEqual([2]);
  });

  it("mantem empates", () => {
    expect([...findLeaderIds([{ usersId: 1, value: 50 }, { usersId: 2, value: 50 }], true)]).toEqual([1, 2]);
  });
});
