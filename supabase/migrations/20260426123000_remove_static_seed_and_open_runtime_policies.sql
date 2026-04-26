-- Remove static seeded demo rows so all data is user/runtime-generated in Supabase.
DELETE FROM public.alerts
WHERE message ILIKE '%Tachycardia + Hypoxia%'
   OR message ILIKE '%Severe Hypoxia%'
   OR message ILIKE '%Bradycardia%'
   OR message ILIKE '%Fever%';

DELETE FROM public.rules
WHERE name IN ('Tachycardia + Hypoxia', 'Severe Hypoxia', 'Bradycardia', 'Fever');

DELETE FROM public.patients
WHERE display_label IN ('P-001', 'P-002', 'P-003', 'P-004', 'P-005');

-- Allow authenticated runtime writes for patient/rule management from dashboard UI.
DROP POLICY IF EXISTS "patients_admin_all" ON public.patients;
CREATE POLICY "patients_insert_auth" ON public.patients
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "patients_update_auth" ON public.patients
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "patients_delete_auth" ON public.patients
FOR DELETE TO authenticated
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "rules_admin_all" ON public.rules;
CREATE POLICY "rules_insert_auth" ON public.rules
FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "rules_update_auth" ON public.rules
FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "rules_delete_auth" ON public.rules
FOR DELETE TO authenticated
USING (auth.uid() IS NOT NULL);
