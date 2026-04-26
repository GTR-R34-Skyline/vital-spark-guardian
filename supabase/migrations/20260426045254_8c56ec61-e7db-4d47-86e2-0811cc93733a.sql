
-- Roles enum & user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'doctor');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto-create profile + assign default 'doctor' role on signup; first signup becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, display_name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'doctor');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Patients
CREATE TABLE public.patients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hashed_external_id TEXT NOT NULL UNIQUE,
  encrypted_name TEXT NOT NULL,
  display_label TEXT NOT NULL,
  baseline_hr NUMERIC NOT NULL DEFAULT 75,
  baseline_spo2 NUMERIC NOT NULL DEFAULT 97,
  baseline_temp NUMERIC NOT NULL DEFAULT 36.8,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vitals time-series
CREATE TABLE public.vitals (
  id BIGSERIAL PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  hr NUMERIC NOT NULL,
  spo2 NUMERIC NOT NULL,
  temp NUMERIC NOT NULL,
  smoothed_hr NUMERIC NOT NULL,
  smoothed_spo2 NUMERIC NOT NULL,
  smoothed_temp NUMERIC NOT NULL,
  is_anomaly BOOLEAN NOT NULL DEFAULT false,
  anomaly_score NUMERIC NOT NULL DEFAULT 0
);
CREATE INDEX idx_vitals_patient_ts ON public.vitals(patient_id, ts DESC);

-- Rules
CREATE TABLE public.rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  compiled_ast JSONB,
  enabled BOOLEAN NOT NULL DEFAULT true,
  severity_default TEXT NOT NULL DEFAULT 'WARNING',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Alerts
CREATE TABLE public.alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.rules(id) ON DELETE SET NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ
);
CREATE INDEX idx_alerts_ts ON public.alerts(ts DESC);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;

-- Profiles: users can view all, update own
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- user_roles: users can read own; admins read all and manage
CREATE POLICY "roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "roles_admin_all" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Patients: any authenticated user can read; admin manages
CREATE POLICY "patients_select_auth" ON public.patients FOR SELECT TO authenticated USING (true);
CREATE POLICY "patients_admin_all" ON public.patients FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Vitals: any authenticated user can read; inserts allowed for authenticated (simulator runs as user)
CREATE POLICY "vitals_select_auth" ON public.vitals FOR SELECT TO authenticated USING (true);
CREATE POLICY "vitals_insert_auth" ON public.vitals FOR INSERT TO authenticated WITH CHECK (true);

-- Rules: any authenticated reads enabled rules; admin manages
CREATE POLICY "rules_select_auth" ON public.rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "rules_admin_all" ON public.rules FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Alerts: any authenticated reads/inserts; doctors+admins can acknowledge (update)
CREATE POLICY "alerts_select_auth" ON public.alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "alerts_insert_auth" ON public.alerts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "alerts_update_auth" ON public.alerts FOR UPDATE TO authenticated USING (true);
