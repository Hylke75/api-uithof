import { z } from "zod";

const schema = z.object({
  SYNC_DRY_RUN: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  SYNC_START_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  CRON_SECRET: z.string().min(16),
  ADMIN_USER: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(12),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SEM_BASE_URL: z.url(),
  SEM_API_KEY: z.string().min(1),
  CASH_BASE_URL: z.url().default("https://www.cashweb.nl/api/4.0"),
  CASH_API_KEY: z.string().min(1),
  CASH_ADMINISTRATIE: z.string().min(1),
  CASH_DAGBOEK: z.string().min(1).max(6),
  CASH_GB_DEBITEUREN: z.string().min(1).max(6),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Leest en valideert de omgevingsvariabelen; faalt hard bij ontbrekende of ongeldige waarden. */
export function env(): Env {
  cached ??= schema.parse(process.env);
  return cached;
}
