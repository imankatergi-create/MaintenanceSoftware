CREATE TABLE IF NOT EXISTS public.work_order_types (
  id text PRIMARY KEY,
  name text NOT NULL,
  competencies text[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 99,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.work_order_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_wo_types" ON public.work_order_types FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_wo_types" ON public.work_order_types FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_wo_types" ON public.work_order_types FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_wo_types" ON public.work_order_types FOR DELETE
  TO authenticated USING (true);

INSERT INTO public.work_order_types (id, name, competencies, sort_order) VALUES
  ('corrective', 'Corrective', ARRAY['Ventilators','Defibrillators','Patient Monitors','Infusion Pumps','Sterilizers','Medical Gases'], 1),
  ('preventive', 'Preventive', ARRAY['Ventilators','Defibrillators','Patient Monitors','Infusion Pumps','Sterilizers','Medical Gases','MRI','CT','Ultrasound','X-Ray','HVAC','Generators'], 2),
  ('calibration', 'Calibration', ARRAY['Patient Monitors','Infusion Pumps','MRI','CT','Ultrasound','X-Ray'], 3),
  ('safety_test', 'Safety Test', ARRAY['Defibrillators','Patient Monitors','Sterilizers','Medical Gases'], 4)
ON CONFLICT (id) DO NOTHING;
