-- Testboekingen krijgen een eigen trigger, zodat ze het venster van de nachtelijke sync niet verschuiven.
alter table public.sync_runs drop constraint if exists sync_runs_trigger_check;
alter table public.sync_runs add constraint sync_runs_trigger_check check (trigger in ('cron', 'handmatig', 'test'));

-- Slot: er kan maar één run tegelijk lopen. Zo kan dezelfde factuur nooit door twee runs
-- tegelijk geboekt worden (bijv. cron en de knop "Sync nu"). Een vastgelopen run wordt door
-- de code na 15 minuten op "failed" gezet.
create unique index if not exists sync_runs_een_lopende_run on public.sync_runs ((true)) where status = 'running';
