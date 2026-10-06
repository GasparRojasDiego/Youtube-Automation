# ATRIL 2.0.0

Versión personal: todo gira alrededor de tu plan de Claude Max y de material gratuito con licencia libre.

## Qué descargar

- **`ATRIL_2.0.0_instalador_x64.exe`**: instalador recomendado (actualiza la 1.0.0 conservando tus datos). Incluye ffmpeg, fuentes y el motor de animaciones.
- **`ATRIL_2.0.0_portable_x64.zip`**: versión portátil. Descomprime la carpeta completa (con `resources`).
- `ATRIL_2.0.0_x64.exe` y `ATRIL_2.0.0_x64.msi`: alternativas.

Los instaladores no están firmados: en SmartScreen elige «Más información» → «Ejecutar de todas formas».

## Novedades

### Edición nueva, por capas
Las etapas «Imágenes» y «Montaje» se reemplazan por:
1. **Storyboard** (Sonnet). Decide qué se ve y qué se oye en cada frase, con los tiempos exactos de la voz.
2. **Medios y casting.**
   - Busca primero en tu biblioteca y después en fuentes libres: Pexels, Pixabay, Wikimedia Commons, Openverse, NASA, The Met y Freesound.
   - Descarga varios candidatos por toma.
   - Sonnet los mira **una sola vez** y escribe una descripción detallada en español.
   - Luego elige el mejor para cada toma, con su punto de interés.
3. **Retoques (Opus).** Opus no rehace el video. Pule el corte existente con:
   - transiciones por corte;
   - golpes de zoom en las palabras clave;
   - etalonaje;
   - efectos de sonido sincronizados;
   - animaciones donde más explican.
4. **Animaciones (Opus).**
   - Opus escribe cada pieza en HTML + GSAP: mapas reales, líneas de tiempo, contadores y llamadas sobre fotos.
   - ATRIL la renderiza cuadro a cuadro con Microsoft Edge sin ventana.
   - Sonnet revisa una hoja de cuadros, y Opus corrige la pieza si tiene defectos.
5. **Montaje por capas.** Combina:
   - imágenes con movimiento de cámara y clips de video;
   - animaciones a pantalla completa y capas con alfa;
   - subtítulos quemados que resaltan la palabra que se dice;
   - música por capítulo con compresión lateral;
   - efectos de sonido, grano y viñeta.

### Biblioteca de medios
- Todo lo descargado queda en `Documentos\ATRIL\Biblioteca` con su licencia, autor y página de origen.
- Se busca por lo que muestra cada archivo, en español o en inglés.
- Puedes importar material propio, marcar favoritos o «no usar», y buscar en internet a mano.
- Solo se aceptan licencias aptas para videos monetizados. GIPHY y Tenor quedan excluidos por derechos de terceros.

### Estudio en vivo
- Muestra paso a paso lo que hacen la IA y el motor: búsquedas, páginas leídas, imágenes encontradas, decisiones, animaciones y segmentos montados.
- Incluye la vista previa del último cuadro y una línea de tiempo con pistas de imagen, animación, efectos y música.

### Consumo preciso
- La barra superior muestra siempre el uso de tu plan de Claude: ventana de 5 horas y límite semanal, con la hora en que se reponen. Son los datos oficiales que informa Claude Code.
- La página **Consumo** detalla cada tarea:
  - tokens de entrada y cuántos salieron de caché;
  - tokens de salida y búsquedas web;
  - el % del plan, medido y estimado.
- Muestra también la cuota gratuita de Google TTS del mes y las llamadas a cada API de medios frente a sus límites oficiales.

### Otros cambios
- La revisión final permite cambiar cualquier toma por otro candidato, por algo de la biblioteca o por una tarjeta, sin repetir llamadas a Opus. Solo se vuelve a montar el segmento afectado.
- La música se puede cambiar por capítulo.
- Subtítulos SRT con los tiempos reales de la voz.
- Los créditos obligatorios (CC BY/BY-SA) se escriben solos en la descripción.
- Hay nuevos parámetros de habilidad: `atril:subtitulos` y, en `atril:montaje`, `humor`, `grain` y `vignette`.
- Diagnóstico revisa el plan de Claude, el motor de animaciones, la biblioteca y las claves de las fuentes.
- Los videos de la 1.0.0 se conservan. Para rehacerlos con la edición nueva, usa «Rehacer desde aquí» en Storyboard.

## Configuración nueva (gratuita)
Ajustes → Medios: claves de Pexels, Pixabay y Freesound, y registro en Openverse. Los pasos están en la Guía.
