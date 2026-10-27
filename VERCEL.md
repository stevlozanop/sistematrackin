# Subir System Trackin a Vercel con Supabase

El sistema usa **PostgreSQL en Supabase**. Antes usaba MySQL (XAMPP), y las consultas se mantienen casi iguales: las funciones de MySQL que usa (`IF`, `DATE_FORMAT`, `CURDATE`…) existen en la base como funciones equivalentes (ver `database/schema.sql`).

## 1. Seguridad primero

Si alguna clave de Supabase se compartió por chat o quedó en un archivo, cámbiala:

- **Project Settings → Database → Reset database password**
- **Project Settings → API**: rota la `service_role` / `secret` key y el JWT secret.

El sistema no usa esas claves de la API. Solo necesita la cadena de conexión a la base.

## 2. Crear las tablas y copiar los datos de XAMPP

En tu PC, con XAMPP encendido:

1. En Supabase pulsa **Connect** y elige **Session pooler** (puerto **5432**). Copia la cadena y pon tu contraseña nueva.
2. En el archivo `.env` del proyecto escribe:
   ```
   DATABASE_URL=postgres://postgres.xxxx:TU-CLAVE@aws-0-us-east-1.pooler.supabase.com:5432/postgres
   MYSQL_URL=mysql://root@127.0.0.1:3306/system_trackin
   ```
3. Ejecuta:
   ```bash
   npm run db:migrar
   ```
   El script crea las tablas (`database/schema.sql`), copia todo y compara los conteos. Debe terminar con «Listo: todos los datos están en Postgres».
   Si lo ejecutas otra vez, se detiene para no pisar datos. Con `npm run db:migrar -- --reemplazar` borra lo que haya en Supabase y copia de nuevo.

Para empezar con una base vacía, en vez del script: Supabase → **SQL Editor** → pega `database/schema.sql` → **Run**.

## 3. Variables en Vercel

Si conectaste Supabase desde Vercel (**Storage → Supabase**), Vercel ya creó `POSTGRES_URL` y el sistema la usa sola: es la del pooler en modo transacción (puerto 6543), la indicada para Vercel.

Agrega a mano en **Settings → Environment Variables**:

| Variable | Valor |
|---|---|
| `AUTH_SECRET` | una clave larga nueva: `openssl rand -hex 32` |
| `DATABASE_URL` | solo si **no** usas la integración; la cadena del pooler con puerto **6543** |

Al cambiar `AUTH_SECRET` se cierran las sesiones abiertas: todos vuelven a ingresar una vez.

## 4. Desplegar

Importa el repositorio de GitHub en Vercel; no hay que configurar nada más.
En **Settings → Functions → Region**, deja **Washington, D.C. (iad1)**: es la misma zona de Supabase (us-east-1).

## Actualizar el esquema (funciones y vista)

Cuando cambie `database/schema.sql`, aplícalo a Supabase sin tocar los datos:
```bash
npm run db:esquema
```

## Conexiones (importante)

El pooler de Supabase en **modo sesión (puerto 5432)** admite solo **15 conexiones**. Varias funciones de Vercel lo llenan y todo se pone lento o falla con «max clients reached».
Por eso el sistema siempre se conecta por el **modo transacción (puerto 6543)**, aunque la cadena diga 5432. Los scripts `db:migrar` y `db:esquema` sí usan 5432.

## Trabajar en tu PC

`npm run dev` usa la `DATABASE_URL` del `.env`, o sea la misma base de Supabase. XAMPP ya no hace falta, salvo para volver a copiar datos.

## Qué cambió para Vercel y Supabase

- **Base de datos:** de MySQL a PostgreSQL.
  - Los textos no distinguen mayúsculas («sorsa» = «SORSA»), igual que en MySQL.
  - La hora es la de Perú: la base queda en `America/Lima`.
  - Al ordenar, los vacíos van donde los ponía MySQL.
- **El Excel se lee en el navegador.** Vercel no acepta subir más de 4,5 MB, y el HSP-OFICIAL pesa unos 30 MB. Las filas se envían comprimidas en bloques de 5000, con una barra de avance.
- **La vista previa de la carga por etapa se guarda en la base** (tabla `import_stash`), porque en Vercel el paso 2 puede llegar a otro servidor.
- **Pocas conexiones por función** (3), para no agotar el límite de la base.
