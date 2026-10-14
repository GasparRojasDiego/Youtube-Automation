# ATRIL 2.5.9

Catálogo de la biblioteca en un clic, y los videos personales pueden usar toda la biblioteca.

## Descargar
- **`ATRIL_2.5.9_instalador_x64.exe`** (recomendado). Desde la 2.5.1 o posterior, pulsa el botón de descarga junto a tu perfil.
- `ATRIL_2.5.9_portable_x64.zip` (versión portátil).
- `SHA256SUMS.txt`, con las huellas para comprobar cada descarga.

## Biblioteca → «Generar .md»
- Crea en Descargas el archivo `ATRIL - Biblioteca AAAA-MM-DD.md` con todo el material: primero la biblioteca personal y luego la de automatización, agrupadas por tipo (imágenes, videos, íconos, música y efectos).
- De cada recurso incluye el título, el nombre del archivo, las medidas y la orientación o la duración, la descripción que hizo la visión de Claude, las etiquetas, la calidad y si no es utilizable. En el material descargado, también el origen y la licencia.
- Explica al inicio qué puede usar cada modo, así que sirve para dárselo directamente al chat que prepara las tarjetas de la cola.
- Los recursos que aún no tienen descripción aparecen marcados: pulsa «Describir» antes de generar el archivo para que salgan completos.

## Qué material usa cada modo
- **Videos personales** (y tarjetas Personal de la cola): **toda la biblioteca**, la personal y la de automatización. Con «Completa» se eligen los 40 recursos más relacionados con el guion y, a igual parecido, primero los personales. «Solo algunos» permite elegir de toda la biblioteca.
- **Videos de Automatización**: solo la biblioteca de automatización, como hasta ahora. Nunca usan tus archivos personales.

## Verificado
- TypeScript, pruebas unitarias (incluida una nueva para el catálogo) y compilación.
