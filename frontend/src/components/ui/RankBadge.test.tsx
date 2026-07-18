import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RankBadge } from "./RankBadge";

describe("RankBadge", () => {
  it("usa cor de medalha pros 3 primeiros", () => {
    render(<RankBadge rank={1} />);
    expect(screen.getByText("1")).toHaveStyle({ background: "var(--ouro)" });
  });

  it("usa cor neutra a partir do 4o lugar", () => {
    render(<RankBadge rank={4} />);
    expect(screen.getByText("4")).toHaveStyle({ background: "var(--superficie)", color: "var(--apagado)" });
  });
});
