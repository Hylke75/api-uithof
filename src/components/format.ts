const euroFormat = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const tijdFormat = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Amsterdam" });

export const euro = (cents: number) => euroFormat.format(cents / 100);
export const tijd = (iso: string) => tijdFormat.format(new Date(iso));
const datumFormat = new Intl.DateTimeFormat("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
/** YYYY-MM-DD naar 30-09-2026; leeg blijft leeg. */
export const datum = (d: string | null | undefined) => (d ? datumFormat.format(new Date(`${d.slice(0, 10)}T00:00:00Z`)) : "");
