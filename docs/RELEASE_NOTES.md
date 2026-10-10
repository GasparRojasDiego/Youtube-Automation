# ATRIL 2.5.2

Corrige errores del informe de la 2.5.1.

## Descargar
- **`ATRIL_2.5.2_instalador_x64.exe`**: recomendado. Desde la 2.5.1, pulsa el botón de descarga junto a tu perfil.
- `ATRIL_2.5.2_portable_x64.zip`: portátil.
- `SHA256SUMS.txt`: huellas para comprobar cada descarga.

## Correcciones
- **Animaciones: «No se pudo conectar con el navegador».** La política de seguridad nueva de la 2.5.1 bloqueaba la conexión local con Edge que usa el motor de animaciones. Ya está permitida (solo hacia el propio equipo) y una prueba automática lo vigila. Pulsa «Reintentar» en el paso Motion.
- **Confirmaciones** («¿Eliminar…?», «¿Rehacer…?»): fallaban con «not allowed by ACL» y no hacían nada. Ya funcionan.
- **Vistas previas de la biblioteca** (fotos, clips y sonidos de Pexels, Pixabay, Wikimedia, Freesound e Iconify) vuelven a verse.
- **Mensajes de error más claros:** si Google pide activar la facturación, el aviso lo dice y trae el enlace; si un sitio responde con una verificación anti-bots, ya no se pega su página entera en el informe; y los errores 401/403 de servicios que no son de Google ya no mencionan Google Cloud.
