-- Update business_type column to use enum values
-- Migration date: 2026-04-18

-- No changes needed for SQLite as it stores enums as strings anyway
-- The enum PluginBusinessType will be stored as: "None", "Staging", "Media", "Custom"

-- Optional: Update existing null values to "None"
-- UPDATE plugin_execution_logs SET business_type = 'None' WHERE business_type IS NULL;

-- Add index if not exists (already added in previous migration)
-- CREATE INDEX IF NOT EXISTS idx_plugin_execution_logs_business_type ON plugin_execution_logs(business_type);
