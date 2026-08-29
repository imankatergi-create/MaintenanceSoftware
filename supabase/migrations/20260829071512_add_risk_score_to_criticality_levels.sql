ALTER TABLE criticality_levels ADD COLUMN IF NOT EXISTS risk_score integer DEFAULT 50;

-- Set default risk scores based on existing levels
UPDATE criticality_levels SET risk_score = 90 WHERE id = 'life';
UPDATE criticality_levels SET risk_score = 75 WHERE id = 'high';
UPDATE criticality_levels SET risk_score = 50 WHERE id = 'med';
UPDATE criticality_levels SET risk_score = 50 WHERE id = 'low';
