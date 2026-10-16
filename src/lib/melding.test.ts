import { describe, expect, it } from "vitest";
import { welkeMelding } from "./melding";

describe("welkeMelding", () => {
  it("stuurt bij een fout altijd een foutmail, ook na de dagelijkse periode", () => {
    expect(welkeMelding({ status: "failed", n_fout: 0 }, "2026-12-01", "2026-10-31")).toBe("fout");
    expect(welkeMelding({ status: "partial", n_fout: 2 }, "2026-12-01")).toBe("fout");
  });

  it("stuurt een samenvatting tot en met de einddatum, daarna niets", () => {
    expect(welkeMelding({ status: "success", n_fout: 0 }, "2026-10-31", "2026-10-31")).toBe("samenvatting");
    expect(welkeMelding({ status: "success", n_fout: 0 }, "2026-11-01", "2026-10-31")).toBeNull();
    expect(welkeMelding({ status: "success", n_fout: 0 }, "2026-10-20")).toBeNull();
  });
});
