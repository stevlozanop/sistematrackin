-- Migración: días de aviso para "por vencer". Luego ejecutar schema.sql (la vista v_units calcula las alertas).
USE system_trackin;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS alert_days TINYINT NOT NULL DEFAULT 2;
