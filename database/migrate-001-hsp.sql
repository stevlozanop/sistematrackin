-- Migración: pasa del esquema anterior (units + unit_stages) al esquema HSP (PCL / YUR).
-- Borra las unidades del esquema anterior (se vuelven a cargar desde el Excel). Ejecútalo una vez y luego schema.sql.
USE system_trackin;
DROP VIEW IF EXISTS v_units;
DROP TABLE IF EXISTS unit_stages;
DROP TABLE IF EXISTS units;
