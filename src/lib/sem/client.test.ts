import { afterEach, describe, expect, it, vi } from "vitest";
import { createSemClient } from "./client";

afterEach(() => vi.unstubAllGlobals());

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("createSemClient", () => {
  it("haalt batches op met ApiKey-header en FromModifiedAt-filter", async () => {
    const fetch = mockFetch(200, { JournalEntryBatches: [{ BatchNumber: 5, CompanyCode: null, CompanyID: 1, CreatedAt: null, Name: "Week 40" }] });
    const sem = createSemClient({ baseUrl: "https://deuithof.smarteventmanager.com/", apiKey: "geheim" });

    const batches = await sem.fetchBatches("2026-10-01");

    expect(batches).toHaveLength(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://deuithof.smarteventmanager.com/api/JournalEntryBatches/GetJournalEntryBatches");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).ApiKey).toBe("geheim");
    expect(JSON.parse(init.body as string)).toEqual({ JournalEntryBatchFilter: { FromModifiedAt: "2026-10-01T00:00" } });
  });

  it("haalt journaalposten en factuurkoppen per batch op", async () => {
    const fetch = mockFetch(200, { JournalEntries: [], Invoices: [] });
    const sem = createSemClient({ baseUrl: "https://deuithof.smarteventmanager.com/api", apiKey: "k" });

    await sem.fetchJournaalposten({ BatchNumber: 41, CompanyCode: "OUT" });
    await sem.fetchFacturen({ BatchNumber: 41, CompanyCode: null });

    const bodies = fetch.mock.calls.map((c) => JSON.parse((c as unknown as [string, RequestInit])[1].body as string));
    expect((fetch.mock.calls[0] as unknown as [string])[0]).toBe("https://deuithof.smarteventmanager.com/api/JournalEntries/GetJournalEntries");
    expect(bodies[0]).toEqual({ JournalEntryFilter: { BatchNumber: "41", CompanyCode: "OUT" } });
    expect(bodies[1]).toEqual({ InvoiceFilter: { BatchNumbers: [41] }, InvoiceLoadOptions: { DoLoadInvoiceLines: false } });
  });

  it("geeft een duidelijke fout bij een HTTP-fout", async () => {
    mockFetch(401, { Message: "Unauthorized" });
    const sem = createSemClient({ baseUrl: "https://x.smarteventmanager.com", apiKey: "fout" });
    await expect(sem.fetchBatches("2026-10-01")).rejects.toThrow("HTTP 401");
  });
});
