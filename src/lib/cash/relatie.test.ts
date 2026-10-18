import { describe, expect, it } from "vitest";
import { relatieRecord } from "./relatie";

describe("relatieRecord", () => {
  it("vult een organisatie in zoals de boekhouding dat doet", () => {
    expect(
      relatieRecord({
        RelationID: 1,
        DebtorNumber: "152016",
        OrganizationName: "DICTU ",
        Initials: "B.",
        FirstName: "Bert ",
        LastName: "Heemskerk ",
        InvoiceStreetAndNumber: "Pr. Beatrixlaan 116 ",
        InvoicePostalCode: "2595 AL",
        InvoiceCity: "'s-Gravenhage",
        InvoiceCountryCode: "NL",
        EMailAddress: "factuur@voorbeeld.nl",
      }),
    ).toEqual({
      F0101: "152016",
      F0102: "DICTU",
      F0103: "DICTU",
      F0104: "B. Heemskerk",
      F0105: "Pr. Beatrixlaan 116",
      F0107: "2595 AL 's-Gravenhage",
      F0121: "D",
      F0129: "N",
      F0130: "NL",
      F0120: "factuur@voorbeeld.nl",
      F0983: "EUR",
    });
  });

  it("gebruikt de persoon als naam als er geen organisatie is, en weigert zonder plaats", () => {
    const r = relatieRecord({ RelationID: 2, DebtorNumber: "152500", FirstName: "Anna", Prefix: "de", LastName: "Vries", PostalCity: "Utrecht", PostalPostalCode: "3511 AA" });
    expect(r).toMatchObject({ F0102: "ANNA", F0103: "Anna de Vries", F0107: "3511 AA Utrecht", F0130: "NL" });
    expect(r).not.toHaveProperty("F0104");
    expect(relatieRecord({ RelationID: 3, DebtorNumber: "152501", OrganizationName: "X" })).toBeNull();
  });
});
