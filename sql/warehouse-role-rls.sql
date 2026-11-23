alter policy pur_write_role on public.purchase_batches
  to authenticated
  using (
    exists (select 1 from public.user_profiles up
            where up.user_id = auth.uid()
              and up.role = any (array['admin','fr','cd_supplier','warehouse']))
  )
  with check (
    exists (select 1 from public.user_profiles up
            where up.user_id = auth.uid()
              and up.role = any (array['admin','fr','cd_supplier','warehouse']))
  );

alter policy ship_write on public.shipments
  to authenticated
  using (
    exists (select 1 from public.user_profiles up
            where up.user_id = auth.uid()
              and up.role = any (array['admin','cd_supplier','finance','cd_procurement','warehouse']))
  )
  with check (
    exists (select 1 from public.user_profiles up
            where up.user_id = auth.uid()
              and up.role = any (array['admin','cd_supplier','finance','cd_procurement','warehouse']))
  );
