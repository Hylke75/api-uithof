import { describe, expect, it } from "vitest";
import { telPerStatus } from "./data";
import { redigeer, systeemStatus } from "./resultaat";

describe("redigeer", () => {
  it("maskeert sleutels en tokens in meldingen", () => {
    expect(redigeer("Invalid API key")).toBe("Invalid API key");
    expect(redigeer("key sb_secret_AbCdEf123456 werkt niet")).toBe("key sb_secret_… werkt niet");
    expect(redigeer("Bearer 0123456789abcdef0123456789abcdef0123456789abcdef")).toBe("Bearer [sleutel verborgen]");
    expect(redigeer("token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop")).toBe("token [token verborgen]");
    expect(redigeer("HTTP 401 https://apidemo.smarteventmanager.com/api")).toBe("HTTP 401 https://apidemo.smarteventmanager.com/api");
    expect(redigeer("SEM JournalEntryBatches/GetJournalEntryBatches: HTTP 401")).toBe("SEM JournalEntryBatches/GetJournalEntryBatches: HTTP 401");
    expect(redigeer("ApiKey 8872adfc-5643-44c2-9d63-3c393d763f39")).toBe("ApiKey [sleutel verborgen]");
  });
});

describe("systeemStatus", () => {
  it("is nooit groen als één onderdeel faalt", () => {
    expect(systeemStatus(["healthy", "healthy", "healthy"])).toBe("healthy");
    expect(systeemStatus(["healthy", "error", "healthy"])).toBe("warning");
    expect(systeemStatus(["healthy", "unknown"])).toBe("warning");
    expect(systeemStatus(["unknown", "unknown"])).toBe("unknown");
    expect(systeemStatus([])).toBe("unknown");
  });
});

describe("telPerStatus", () => {
  it("telt facturen per status", () => {
    expect(telPerStatus([{ status: "proef" }, { status: "proef" }, { status: "fout" }, { status: "geboekt" }])).toEqual({
      totaal: 4,
      proef: 2,
      nieuw: 0,
      geboekt: 1,
      fout: 1,
      gewijzigd_na_boeking: 0,
    });
  });
});
