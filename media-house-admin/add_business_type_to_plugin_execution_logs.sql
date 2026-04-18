-- Add BusinessType column to plugin_execution_logs table
-- Migration date: 2026-04-18

ALTER TABLE plugin_execution_logs ADD COLUMN business_type TEXT;

-- Add index for BusinessType for performance
CREATE INDEX IF NOT EXISTS idx_plugin_execution_logs_business_type ON plugin_execution_logs(business_type);
