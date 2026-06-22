import { describe, expect, it } from "vitest";
import { neutralizeCsvValue, toCsvRow, validateSubmissionPayload } from "./api-handlers";

describe("submission validation", () => {
  it("accepts valid payload as text", () => {
    expect(
      validateSubmissionPayload({
        name: "Cliente",
        number16: "0012345678901234",
        number4: "0032",
        number3: "007",
      }),
    ).toEqual({
      name: "Cliente",
      number16: "0012345678901234",
      number4: "0032",
      number3: "007",
    });
  });

  it("rejects invalid sizes", () => {
    expect(
      validateSubmissionPayload({
        name: "Cliente",
        number16: "123",
        number4: "0032",
        number3: "007",
      }),
    ).toBeNull();
  });
});

describe("csv helpers", () => {
  it("neutralizes formula-like values", () => {
    expect(neutralizeCsvValue("=SUM(A1)")).toBe("'=SUM(A1)");
  });

  it("builds csv rows", () => {
    expect(toCsvRow(["Nome", "0012"])).toBe('"Nome","0012"');
  });
});
