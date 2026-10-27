-- Migración: marca como "Ruta Lima" a los dealers cuyas unidades pasan mayormente por el almacén de Lima (5.1 / 5.2).
-- Ejecutar después de schema.sql (que actualiza la vista v_units).
USE system_trackin;
UPDATE dealers d
JOIN (
  SELECT dealer_id, SUM(d_alm_lima IS NOT NULL OR d_sal_lima IS NOT NULL) / COUNT(*) ratio
  FROM units WHERE site = 'PCL' AND dealer_id IS NOT NULL GROUP BY dealer_id
) x ON x.dealer_id = d.id
SET d.coast = (x.ratio >= 0.5);
