CREATE TABLE IF NOT EXISTS public.units_of_measure (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  symbol text NOT NULL,
  value_type text NOT NULL DEFAULT 'number',
  sort_order integer NOT NULL DEFAULT 99,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.units_of_measure ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_uom" ON public.units_of_measure FOR SELECT
  TO anon, authenticated USING (true);
CREATE POLICY "insert_uom" ON public.units_of_measure FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_uom" ON public.units_of_measure FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_uom" ON public.units_of_measure FOR DELETE
  TO authenticated USING (true);

INSERT INTO public.units_of_measure (id, name, symbol, value_type, sort_order) VALUES
  ('ohm', 'Ohms', 'Ω', 'number', 1),
  ('milliamp', 'Milliamps', 'mA', 'number', 2),
  ('microamp', 'Microamps', 'µA', 'number', 3),
  ('milliliter', 'Milliliters', 'mL', 'number', 4),
  ('cmh2o', 'cmH₂O', 'cmH₂O', 'number', 5),
  ('percent', 'Percent', '%', 'number', 6),
  ('bpm', 'Breaths per min', 'bpm', 'number', 7),
  ('joules', 'Joules', 'J', 'number', 8),
  ('seconds', 'Seconds', 's', 'number', 9),
  ('kvp', 'kVp', 'kVp', 'number', 10),
  ('mgy', 'Milligray', 'mGy', 'number', 11),
  ('tempc', 'Temperature (°C)', '°C', 'number', 12),
  ('tempf', 'Temperature (°F)', '°F', 'number', 13),
  ('pressure_bar', 'Bar', 'bar', 'number', 14),
  ('pressure_psi', 'PSI', 'psi', 'number', 15),
  ('voltage', 'Volts', 'V', 'number', 16),
  ('frequency', 'Hertz', 'Hz', 'number', 17),
  ('rpm', 'RPM', 'RPM', 'number', 18),
  ('boolean', 'Pass/Fail', '—', 'boolean', 19),
  ('text', 'Text/Note', '—', 'text', 20)
ON CONFLICT (id) DO NOTHING;
