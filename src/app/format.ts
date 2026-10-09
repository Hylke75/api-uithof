const euroFormat = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const tijdFormat = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Amsterdam" });

export const euro = (cents: number) => euroFormat.format(cents / 100);
export const tijd = (iso: string) => tijdFormat.format(new Date(iso));
