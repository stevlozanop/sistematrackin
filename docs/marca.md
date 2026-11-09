# Marca System Tracking

**Idea:** la S es la ruta. Sale de un punto lleno (el origen, Iquitos) y llega a un anillo (el destino, Pucallpa o Yurimaguas).

## Archivos (`public/brand/`)

| Archivo | Uso |
|---|---|
| `logo-horizontal.svg` | Uso principal: encabezados, reportes, documentos |
| `logo-vertical.svg` | Espacios cuadrados: portadas, carteles |
| `logo-horizontal-blanco.svg` | Sobre fondos oscuros o fotos |
| `logo-horizontal-negro.svg` | Impresión a un color, sellos, fax |
| `simbolo.svg` / `simbolo-verde.svg` / `simbolo-blanco.svg` | Solo la S, cuando el nombre ya está cerca |
| `simbolo-chico.svg` | Debajo de 32 px (más grueso, agujero más grande) |
| `nombre.svg` | Solo el nombre |

Íconos de la app y favicon: `src/app/icon.svg`, `src/app/favicon.ico`, `src/app/apple-icon.png`, `public/icons/`.

## Colores

| | HEX | RGB | Uso |
|---|---|---|---|
| Verde Tracking | `#078a04` | 7 138 4 | Símbolo, fondo del ícono de app, botones principales |
| Casi negro | `#0b0b0b` | 11 11 11 | Nombre, fondos oscuros (login) |
| Blanco | `#ffffff` | 255 255 255 | Símbolo sobre verde o sobre oscuro |

El blanco sobre el verde tiene contraste 4.5:1 (pasa AA para texto).

## Tipografía

El nombre es **Inter SemiBold** (licencia OFL, libre para logos), ya convertido a trazos: no hace falta tener la fuente instalada.

## Reglas

- **Espacio libre:** alrededor del logo deja al menos el ancho del anillo de destino (≈ 1/5 de la altura del símbolo).
- **Tamaño mínimo:** símbolo 16 px (con `simbolo-chico.svg`); logo horizontal 120 px de ancho o 25 mm impreso.
- **Fondos:** verde o negro sobre blanco/gris claro; blanco sobre verde, negro o fotos oscuras.
- **No:** estirar ni girar el símbolo, cambiar la tipografía, poner sombras o degradados, separar el punto o el anillo, usar colores fuera de esta tabla, poner el verde sobre fondos de bajo contraste.

## Pendiente

Antes de registrar o imprimir en grande, haz una búsqueda de marcas (INDECOPI) para confirmar que no se parece a una marca registrada.
