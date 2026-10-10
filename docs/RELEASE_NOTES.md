# ATRIL 2.5.1

Interfaz más limpia, Producción paso a paso, TikTok en segundos, actualizaciones silenciosas con progreso real y un instalador cerca de la mitad de pesado.

## Descargar
- **`ATRIL_2.5.1_instalador_x64.exe`**: recomendado (conserva tus datos). Desde la 2.5.0, pulsa el botón de descarga junto a tu perfil; esa primera vez se actualiza con el método anterior (sin barra de progreso). Desde la 2.5.1 en adelante, con el nuevo.
- `ATRIL_2.5.1_portable_x64.zip`: portátil (descomprime toda la carpeta).
- `SHA256SUMS.txt`: huellas para comprobar cada descarga (ver `SECURITY.md`).

## Cambios
- **Menú lateral nuevo.** Logo y nombre centrados (pulsarlos oculta o muestra el menú), opción activa en azul sólido, sin encabezado superior y con tu foto y nombre abajo en lugar de «Ajustes». Sin animaciones de letras, ecos ni líneas onduladas.
- **Inicio y Videos más simples.** Siempre voz de IA y una sola calidad (sin Estándar/Premium ni «Mi voz»). Los temas pasan al final de Inicio. Videos muestra solo los terminados.
- **Producción paso a paso.** Siete pasos (Investigar, Guion, Voz, Medios, Motion, Montaje y Publicación) en una línea vertical a la izquierda; vista previa y línea de tiempo a la derecha. Al pulsar un paso ves su resultado y el registro de solo ese paso.
- **Consumo dentro de Producción.** El límite de 5 horas de Claude (dato oficial), los tokens de entrada y salida, el % que gastó cada paso y la voz del mes (de 1 millón de caracteres). La página Consumo desaparece. Claude informa el límite en puntos enteros, así que un paso pequeño aparece como «<1 %».
- **TikTok en segundos.** Cada video terminado se guarda solo en Descargas. «Recortar» lo parte en piezas de ~1:30 sin recodificar (en la prueba, 13 minutos tardaron unos 15 s en vez de horas), con cada corte en la pausa entre dos frases. Si borraste el video, se vuelve a descargar. El texto y los hashtags aparecen desde el principio.
- **Instrucciones** (antes Habilidades) en una sola página: directrices de contenido arriba y visuales abajo.
- **Ajustes en collage.** Tu foto, tu nombre y un ID de 12 caracteres, el tema claro/oscuro/del dispositivo, el modelo de Claude de cada paso (incluido el modelo y el esfuerzo de la corrección de animaciones), las claves, la voz, los medios y la música.
- **Informe de errores en lugar de Diagnosticar.** Cada problema te avisa al momento, y Ajustes muestra un informe completo para copiar, sin claves.
- **Biblioteca primero.** Antes de buscar en internet o generar una imagen con IA, ATRIL revisa tu biblioteca con todas las búsquedas alternativas.
- **Actualización silenciosa.** Muestra el tamaño y un tiempo estimado medido con tu conexión, el progreso real de la descarga y la instalación, y comprueba la huella SHA-256 antes de instalar. No abre consolas. La app se cierra solo en el último momento y se vuelve a abrir sola.
- **Seguridad.** Las claves viajan solo en cabeceras (nunca en direcciones) y se ocultan en registros e informes. La ventana tiene una política de contenido estricta. En GitHub: permisos mínimos, ffmpeg verificado con su huella, acciones fijadas por commit, Dependabot, `SECURITY.md`, `SHA256SUMS.txt` y certificado de procedencia (Sigstore) en cada versión. La web no carga nada de terceros.
- **Más ligero.** Ya no se incluye ffprobe (ffmpeg hace todo), las fuentes solo traen los alfabetos latinos, y se publican solo el instalador y la versión portátil.

## Notas
- El instalador no está firmado con Authenticode (requiere un certificado de pago), así que Windows puede mostrar SmartScreen. Tus datos no se pierden al actualizar: viven en la carpeta de datos de la app y en el Administrador de credenciales de Windows, no junto al programa.
