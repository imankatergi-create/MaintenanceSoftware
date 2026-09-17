ALTER TABLE equipment ADD COLUMN IF NOT EXISTS cal_standard text;
ALTER TABLE equipment ADD COLUMN IF NOT EXISTS cal_interval text DEFAULT '12 months';
