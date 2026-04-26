
DROP POLICY IF EXISTS "vitals_insert_auth" ON public.vitals;
DROP POLICY IF EXISTS "alerts_insert_auth" ON public.alerts;
DROP POLICY IF EXISTS "alerts_update_auth" ON public.alerts;

CREATE POLICY "vitals_insert_auth" ON public.vitals FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "alerts_insert_auth" ON public.alerts FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "alerts_update_auth" ON public.alerts FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
