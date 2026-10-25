-- Migración: permiso para que un encargado suba un Excel con las fechas de su etapa.
USE system_trackin;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_import TINYINT(1) NOT NULL DEFAULT 0;
