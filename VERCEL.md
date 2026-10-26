# Subir System Trackin a Vercel

Vercel ejecuta la app, pero **no trae MySQL**. La base va en un proveedor de MySQL en la nube y Vercel se conecta a ella.

## 1. Crear la base MySQL en la nube

Cualquiera compatible con MySQL 8 sirve. Opciones con plan gratis:

- **TiDB Cloud Starter** (tidbcloud.com): compatible con MySQL; el plan gratis alcanza de sobra para los ~40 MB que pesa hoy la base.
- **Aiven for MySQL** (aiven.io): MySQL 8 real, plan gratis pequeño.

Copia la cadena de conexión (`mysql://usuario:clave@host:puerto/base`).

## 2. Pasar los datos de XAMPP a la base nueva

En tu PC:

```bash
/opt/lampp/bin/mysqldump -uroot --single-transaction --skip-lock-tables system_trackin | sed -E 's/DEFINER=`[^`]+`@`[^`]+`//g' > trackin.sql
```

Luego cárgalo en la base nueva (host, puerto y usuario de tu proveedor):

```bash
mysql -h HOST -P PUERTO -u USUARIO -p --ssl-mode=REQUIRED system_trackin < trackin.sql
```

> Para empezar con una base vacía en vez de copiar los datos, carga `database/schema.sql`.

## 3. Variables en Vercel

En el proyecto de Vercel, ve a **Settings → Environment Variables**:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | la cadena del paso 1 |
| `DB_SSL` | `true` |
| `AUTH_SECRET` | una clave larga nueva (genera una con `openssl rand -hex 32`) |
| `DEV_EMAIL` / `DEV_PASSWORD` | solo si la base está vacía; cambia la contraseña de dev |

Al cambiar `AUTH_SECRET` se cierran todas las sesiones abiertas; todos vuelven a ingresar una vez.

## 4. Desplegar

Importa el repositorio de GitHub en Vercel. No hay que configurar nada más: el framework es Next.js y el comando es `next build`.
En **Settings → Functions → Region**, elige la región más cercana a tu base de datos: si están lejos, cada pantalla tarda más.

## Qué cambió en el código para Vercel

- **El Excel se lee en el navegador.** Vercel no acepta subir archivos de más de 4,5 MB, y el HSP-OFICIAL pesa unos 30 MB. El navegador lo lee y envía las filas comprimidas en bloques de 5000, con una barra de avance.
- **La vista previa de la carga por etapa se guarda en la base** (tabla `import_stash`). En Vercel, el paso 2 puede llegar a otro servidor.
- **Hora de Perú.** Vercel corre en UTC: la conexión fija `-05:00` y la fecha de hoy se calcula para `America/Lima`.
- **Pocas conexiones por función** (3), para no agotar el límite de la base.
