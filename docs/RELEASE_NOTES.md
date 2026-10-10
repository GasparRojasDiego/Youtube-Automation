# ATRIL 2.5.4

Las animaciones vuelven a funcionar en Windows.

## Descargar
- **`ATRIL_2.5.4_instalador_x64.exe`**: recomendado. Desde la 2.5.1 o posterior, pulsa el botón de descarga junto a tu perfil.
- `ATRIL_2.5.4_portable_x64.zip`: portátil.
- `SHA256SUMS.txt`: huellas para comprobar cada descarga.

## Correcciones
- **Motion: todas las animaciones fallaban en segundos.** En la 2.5.3 las directrices visuales pasaron al mensaje de sistema (para la caché), que se enviaba a Claude Code por la línea de comandos. Windows la limita a unos 32 000 caracteres y unas directrices extensas la superan, así que el proceso ni arrancaba. Ahora ese mensaje viaja en un archivo. Lo comprueba una prueba real con 80 000 caracteres, y otra vigila que ningún argumento se acerque al límite.
- **Los fallos de animaciones ya no son silenciosos.** Quedan en el informe de errores. Si no sale ninguna, la etapa Motion falla con el motivo (antes el video seguía sin animaciones). Pulsa «Reintentar» en Motion.
- **TikTok:** si el video o una parte está abierta en tu reproductor, ATRIL usa otro nombre o una carpeta nueva en vez de fallar. Los errores de archivos dicen qué archivo era.
- **Modelos:** los valores predeterminados son Sonnet para casi todo y Haiku para lo simple. Ningún paso usa Opus por defecto. Los textos ya no mencionan a Opus.
