-- Migración: encargados por etapa, bloqueo de fechas y registro de actividad (seguimiento en vivo).
USE system_trackin;
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE users MODIFY role ENUM('dev','admin','operator') NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen DATETIME NULL;

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
