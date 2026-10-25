-- System Trackin · esquema MySQL/MariaDB (ábrelo en MySQL Workbench y ejecútalo completo: ⚡)
-- Replica el Excel HSP-OFICIAL: módulos PCL (Pucallpa) y YUR (Yurimaguas).
CREATE DATABASE IF NOT EXISTS system_trackin
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE system_trackin;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;  -- los textos de la vista v_units usan esta colación

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  role          ENUM('dev','admin','operator') NOT NULL,   -- dev/admin = super admin · operator = encargado de etapa
  last_seen     DATETIME NULL,
  area          VARCHAR(40) NULL,    -- área del encargado (src/lib/workflow.ts → AREAS)
  carrier       VARCHAR(120) NULL,   -- empresa de transporte: si tiene valor, solo ve esas unidades
  can_import    TINYINT(1) NOT NULL DEFAULT 0,  -- puede subir Excel con las fechas de su etapa
  guide_seen    TINYINT(1) NOT NULL DEFAULT 0,  -- ya terminó la guía del sistema (si no, se abre sola al entrar)
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS dealers (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(160) NOT NULL UNIQUE,   -- tienda (PCL: Nombre Tienda · YUR: Destinatario)
  department VARCHAR(60),
  district   VARCHAR(60),
  coast      TINYINT(1) NOT NULL DEFAULT 0   -- 1 = Ruta Lima: sus unidades pasan por 5.1 (almacén Lima) y 5.2 (tránsito dealer 2)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS units (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  site          ENUM('PCL','YUR') NOT NULL,
  chassis       VARCHAR(40) NOT NULL,
  motor         VARCHAR(40),
  lote          VARCHAR(40),
  material      VARCHAR(60),
  category      VARCHAR(10),              -- Tipo: 2W / 3W
  order_sap     VARCHAR(30),
  invoice       VARCHAR(40),
  delivery      VARCHAR(30),
  guia          VARCHAR(40),
  billing_date  DATE,
  center        VARCHAR(10),              -- CL: 3101, 3106, 3114
  dealer_id     INT UNSIGNED,
  dealer_group  VARCHAR(160),             -- YUR: columna "Dealer"
  department    VARCHAR(60),              -- PCL: define el plazo
  district      VARCHAR(60),
  route         VARCHAR(60),              -- YUR: define el plazo (RUTA ORIENTE 2, ...)
  nave          VARCHAR(60),
  container     VARCHAR(40),
  carrier       VARCHAR(120),             -- PCL: TRAMO FINAL
  plan_almacen  VARCHAR(40),
  driver        VARCHAR(80),              -- YUR: CHOFER
  gm_com        VARCHAR(20),
  observation   VARCHAR(500),
  delay_reason  VARCHAR(60),              -- motivo de demora (DETALLE / DEMORA)
  -- Fechas de seguimiento (el estado es la última con fecha)
  d_carga       DATE,                     -- YUR: Fecha de carga
  d_zarpe       DATE,                     -- Zarpe IQT / Fecha de zarpe
  d_arribo      DATE,                     -- Arribo PCL / Arribo Yurimaguas
  d_almacen     DATE,                     -- Entrega almacén / ENAPU Yurimaguas
  d_despacho    DATE,                     -- Despacho de almacén / Fecha despacho
  d_alm_lima    DATE,                     -- PCL: entrega almacén transportista Lima
  d_sal_lima    DATE,                     -- PCL: salida almacén transportista Lima
  d_entrega     DATE,                     -- Entrega dealer / Fecha entrega R.
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_units_site_chassis (site, chassis),
  KEY idx_units_billing (site, billing_date),
  KEY idx_units_dealer (dealer_id),
  KEY idx_units_carrier (site, carrier),
  CONSTRAINT fk_units_dealer FOREIGN KEY (dealer_id) REFERENCES dealers(id)
) ENGINE=InnoDB;

-- Plazos (lead time) en días. PCL: zona = departamento. YUR: zona = ruta.
CREATE TABLE IF NOT EXISTS lead_times (
  site     ENUM('PCL','YUR') NOT NULL,
  zone     VARCHAR(60) NOT NULL,
  days_cre SMALLINT NOT NULL,   -- meses de creciente
  days_vac SMALLINT NOT NULL,   -- meses de vaciante
  PRIMARY KEY (site, zone)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS settings (
  id               TINYINT NOT NULL PRIMARY KEY DEFAULT 1,
  target           TINYINT NOT NULL DEFAULT 85,        -- meta % a tiempo
  creciente_months VARCHAR(40) NOT NULL DEFAULT '1,2,3,4',
  alert_days       TINYINT NOT NULL DEFAULT 2             -- avisar "por vencer" cuando falten estos días o menos
) ENGINE=InnoDB;
INSERT IGNORE INTO settings (id) VALUES (1);

INSERT IGNORE INTO lead_times (site, zone, days_cre, days_vac) VALUES
  ('PCL','UCAYALI',16,16), ('PCL','CORONEL PORTILLO',16,16), ('PCL','MADRE DE DIOS',25,25),
  ('PCL','JUNIN',21,21), ('PCL','HUANUCO',21,21), ('PCL','SATIPO',21,21), ('PCL','AREQUIPA',21,21),
  ('PCL','SAN MARTIN',19,19), ('PCL','PASCO',19,19), ('PCL','LIMA',19,19),
  ('PCL','CAJAMARCA',18,18), ('PCL','AMAZONAS',8,8), ('PCL','LORETO',7,7),
  ('YUR','RUTA ORIENTE 1',12,13), ('YUR','RUTA ORIENTE 2',13,14), ('YUR','RUTA ORIENTE 3',15,16),
  ('YUR','RUTA ORIENTE 4',15,16), ('YUR','RUTA ORIENTE 5',18,19), ('YUR','RUTA NORTE 1',19,20);

-- Etapas (columnas de fecha) que llena cada encargado, por módulo
CREATE TABLE IF NOT EXISTS user_stages (
  user_id INT UNSIGNED NOT NULL,
  site    ENUM('PCL','YUR') NOT NULL,
  field   VARCHAR(20) NOT NULL,
  PRIMARY KEY (user_id, site, field),
  CONSTRAINT fk_user_stages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Registro de cada cambio hecho en el sistema
CREATE TABLE IF NOT EXISTS unit_events (
  id        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  unit_id   INT UNSIGNED NOT NULL,
  user_id   INT UNSIGNED NULL,
  field     VARCHAR(20) NOT NULL,
  old_value VARCHAR(500) NULL,
  new_value VARCHAR(500) NULL,
  at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_events_at (at),
  KEY idx_events_unit (unit_id),
  KEY idx_events_user (user_id, at),
  CONSTRAINT fk_events_unit FOREIGN KEY (unit_id) REFERENCES units(id) ON DELETE CASCADE,
  CONSTRAINT fk_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- Vista con los campos calculados del Excel: plazo, fecha estimada, estado y nivel de servicio.
CREATE OR REPLACE VIEW v_units AS
SELECT x.*,
  CASE WHEN x.est_date IS NULL THEN NULL
       WHEN COALESCE(x.d_entrega, CURDATE()) <= x.est_date THEN 'A TIEMPO'
       ELSE 'FUERA DE TIEMPO' END AS service,
  DATEDIFF(x.d_entrega, x.billing_date) AS real_days,
  -- Alertas (solo unidades sin entregar): días que faltan para la fecha estimada
  IF(x.d_entrega IS NULL, DATEDIFF(x.est_date, CURDATE()), NULL) AS days_left,
  CASE WHEN x.d_entrega IS NOT NULL OR x.est_date IS NULL THEN NULL
       WHEN x.est_date < CURDATE() THEN 'VENCIDA'
       WHEN DATEDIFF(x.est_date, CURDATE()) <= x.alert_days THEN 'POR VENCER'
       END AS alert
FROM (
  SELECT u.*, d.name AS dealer, IFNULL(d.coast, 0) AS via_lima, s.alert_days,
    IF(u.site = 'PCL', u.department, u.route) AS zone,
    IF(FIND_IN_SET(MONTH(u.billing_date), s.creciente_months), 'CRECIENTE', 'VACIANTE') AS season,
    IF(FIND_IN_SET(MONTH(u.billing_date), s.creciente_months), lt.days_cre, lt.days_vac) AS lead_time,
    DATE_ADD(u.billing_date, INTERVAL IF(FIND_IN_SET(MONTH(u.billing_date), s.creciente_months), lt.days_cre, lt.days_vac) DAY) AS est_date,
    CASE
      WHEN u.d_entrega  IS NOT NULL THEN 'ENTREGADO'
      WHEN u.d_sal_lima IS NOT NULL THEN 'TRANSITO DEALER 2'
      WHEN u.d_alm_lima IS NOT NULL THEN 'EN ALMACÉN LIMA'
      WHEN u.d_despacho IS NOT NULL THEN 'TRANSITO DEALER'
      WHEN u.d_almacen  IS NOT NULL THEN 'EN ALMACÉN'
      WHEN u.d_arribo   IS NOT NULL THEN 'ARRIBO PUERTO'
      WHEN u.d_zarpe    IS NOT NULL THEN 'TRANSITO FLUVIAL'
      ELSE 'IQT-PORT' END AS status,
    -- Siguiente etapa a llenar (después de la última con fecha)
    CASE
      WHEN u.d_entrega  IS NOT NULL THEN NULL
      WHEN u.site = 'PCL' THEN CASE
        WHEN u.d_sal_lima IS NOT NULL THEN 'd_entrega'
        WHEN u.d_alm_lima IS NOT NULL THEN 'd_sal_lima'
        -- Ruta Lima: 5 despacho -> 5.1 almacén Lima -> 5.2 salida Lima -> 6 entrega
        WHEN u.d_despacho IS NOT NULL THEN IF(IFNULL(d.coast, 0) = 1, 'd_alm_lima', 'd_entrega')
        WHEN u.d_almacen  IS NOT NULL THEN 'd_despacho'
        WHEN u.d_arribo   IS NOT NULL THEN 'd_almacen'
        WHEN u.d_zarpe    IS NOT NULL THEN 'd_arribo'
        ELSE 'd_zarpe' END
      ELSE CASE
        WHEN u.d_despacho IS NOT NULL THEN 'd_entrega'
        WHEN u.d_almacen  IS NOT NULL THEN 'd_despacho'
        WHEN u.d_arribo   IS NOT NULL THEN 'd_almacen'
        WHEN u.d_zarpe    IS NOT NULL THEN 'd_arribo'
        WHEN u.d_carga    IS NOT NULL THEN 'd_zarpe'
        ELSE 'd_carga' END
    END AS next_step
  FROM units u
  CROSS JOIN settings s
  LEFT JOIN dealers d ON d.id = u.dealer_id
  LEFT JOIN lead_times lt ON lt.site = u.site AND lt.zone = IF(u.site = 'PCL', u.department, u.route)
  WHERE s.id = 1
) x;

-- Usuario dev inicial:  dev@trackin.local  /  Dev12345!   (cámbialo después)
INSERT IGNORE INTO users (name, email, password_hash, role)
VALUES ('Desarrollador', 'dev@trackin.local',
        '$2b$10$MC6ibUpcCnEine1wH97p0OIUmHLLYLD0uUMrTef6Fig3rUZw/lg/K', 'dev');
