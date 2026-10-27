-- Migración: área de cada encargado y empresa de transporte (opcional).
USE system_trackin;
ALTER TABLE users ADD COLUMN IF NOT EXISTS area VARCHAR(40) NULL;      -- ej. ALMACEN_PCL, TRANSPORTE_PCL (ver src/lib/workflow.ts)
ALTER TABLE users ADD COLUMN IF NOT EXISTS carrier VARCHAR(120) NULL;  -- si tiene valor, solo ve las unidades de esa empresa (Tramo final)
CREATE INDEX IF NOT EXISTS idx_units_carrier ON units (site, carrier);
