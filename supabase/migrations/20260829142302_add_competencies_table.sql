CREATE TABLE IF NOT EXISTS public.competencies (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 99,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.competencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_competencies" ON public.competencies FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_competencies" ON public.competencies FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_competencies" ON public.competencies FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_competencies" ON public.competencies FOR DELETE
  TO authenticated USING (true);

INSERT INTO public.competencies (id, name, sort_order) VALUES
  ('ventilators', 'Ventilators', 1),
  ('defibrillators', 'Defibrillators', 2),
  ('patient_monitors', 'Patient Monitors', 3),
  ('infusion_pumps', 'Infusion Pumps', 4),
  ('mri', 'MRI', 5),
  ('ct', 'CT', 6),
  ('ultrasound', 'Ultrasound', 7),
  ('x-ray', 'X-Ray', 8),
  ('sterilizers', 'Sterilizers', 9),
  ('hvac', 'HVAC', 10),
  ('generators', 'Generators', 11),
  ('medical_gases', 'Medical Gases', 12)
ON CONFLICT (id) DO NOTHING;
