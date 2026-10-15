-- Productie: testkoppelingen uit de SEM-testomgeving (apidemo) en vervallen instellingen weg.
-- Het live SEM gebruikt al de rekeningnummers van CASH; CASH vult kostenplaatsen zelf in.
delete from public.map_grootboek where omschrijving like 'SEM-testomgeving:%';
delete from public.instellingen where sleutel in ('kostenplaatsen', 'cash_gb_debiteuren_voorschot');
