-- Initieel schema voor de SEM -> CASH synchronisatie.
-- Alle bedragen in centen (bigint) om afrondingsverschillen te voorkomen.
-- RLS staat aan zonder policies: alleen de service role (server-side) heeft toegang.

-- Logboek: één rij per sync-run.
create table public.sync_runs (
  id              uuid primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null default 'running'
                  check (status in ('running', 'success', 'partial', 'failed')),
  dry_run         boolean not null,
  trigger         text not null default 'cron' check (trigger in ('cron', 'handmatig')),
  -- Batches gewijzigd vanaf window_from worden opgehaald; window_to is de rundatum.
  window_from     date not null,
  window_to       date not null,
  n_batches       integer not null default 0,
  n_opgehaald     integer not null default 0,
  n_geboekt       integer not null default 0,
  n_proef         integer not null default 0,
  n_overgeslagen  integer not null default 0,
  n_fout          integer not null default 0,
  -- Meldingen en fouten van de run, één per regel.
  error           text
);

create index sync_runs_started_at_idx on public.sync_runs (started_at desc);

-- Journaalpostbatches uit SEM (met de hand aangemaakt in SEM).
create table public.sem_batches (
  batch_number         integer not null,
  company_code         text not null default '',
  naam                 text,
  sem_created_at       timestamptz,
  n_facturen           integer not null default 0,
  fout                 text,
  laatste_run_id       uuid references public.sync_runs (id),
  eerst_gezien_at      timestamptz not null default now(),
  laatst_opgehaald_at  timestamptz not null default now(),
  primary key (batch_number, company_code)
);

-- Mapping: SEM-grootboek -> CASH-grootboek. Alleen nodig waar ze verschillen;
-- zonder rij wordt het SEM-nummer 1-op-1 gebruikt.
create table public.map_grootboek (
  sem_grootboek      text primary key,
  grootboekrekening  text not null,
  omschrijving       text,
  actief             boolean not null default true,
  updated_at         timestamptz not null default now()
);

-- Mapping: SEM-btw-code (bijv. 'Hoog') -> CASH-btw-code. Verplicht voor elke gebruikte code;
-- een lege SEM-btw-code heeft sleutel ''.
create table public.map_btwcode (
  sem_btw_code   text primary key,
  cash_btw_code  text not null,
  omschrijving   text,
  updated_at     timestamptz not null default now()
);

-- Mapping: SEM-debiteurnummer -> CASH-debiteurnummer. Alleen nodig waar ze verschillen.
create table public.map_debiteur (
  sem_debiteurnummer   text primary key,
  cash_debiteurnummer  text not null,
  naam                 text,
  updated_at           timestamptz not null default now()
);

-- Facturenhistorie: één rij per SEM-factuur (InvoiceID), met de status van de boeking.
create table public.sem_facturen (
  id                  uuid primary key default gen_random_uuid(),
  sem_factuur_id      text not null unique,
  factuurnummer       text not null,
  factuurdatum        date,
  soort               text not null default 'factuur'
                      check (soort in ('factuur', 'creditnota')),
  sem_debiteurnummer  text not null,
  sem_batch_number    integer not null,
  sem_company_code    text,
  totaal_excl_cents   bigint not null,
  totaal_btw_cents    bigint not null,
  totaal_incl_cents   bigint not null,
  sem_payload         jsonb not null,
  content_hash        text not null,
  status              text not null default 'nieuw'
                      check (status in ('nieuw', 'proef', 'geboekt', 'fout', 'gewijzigd_na_boeking')),
  cash_boeking_id     text,
  cash_payload        jsonb,
  foutmelding         text,
  laatste_run_id      uuid references public.sync_runs (id),
  geboekt_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index sem_facturen_status_idx on public.sem_facturen (status);
create index sem_facturen_factuurdatum_idx on public.sem_facturen (factuurdatum);
create index sem_facturen_batch_idx on public.sem_facturen (sem_batch_number);

alter table public.sync_runs     enable row level security;
alter table public.sem_batches   enable row level security;
alter table public.map_grootboek enable row level security;
alter table public.map_btwcode   enable row level security;
alter table public.map_debiteur  enable row level security;
alter table public.sem_facturen  enable row level security;
