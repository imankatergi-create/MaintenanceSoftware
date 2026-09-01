CREATE TABLE IF NOT EXISTS email_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  user_email text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '30 days'),
  used boolean DEFAULT false
);

ALTER TABLE email_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "insert_email_tokens" ON email_tokens FOR INSERT
  TO anon, authenticated WITH CHECK (true);

CREATE POLICY "select_email_tokens" ON email_tokens FOR SELECT
  TO anon, authenticated USING (true);

CREATE POLICY "update_email_tokens" ON email_tokens FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_email_tokens_token ON email_tokens(token);
