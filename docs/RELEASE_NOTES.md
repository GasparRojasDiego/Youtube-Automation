# ATRIL 1.0.0

Primera versión del estudio de producción asistida para YouTube.

## Qué descargar

- **`ATRIL_1.0.0_instalador_x64.exe`**: instalador recomendado. Se instala para tu usuario e incluye ffmpeg.
- **`ATRIL_1.0.0_portable_x64.zip`**: versión portátil. Descomprime la carpeta completa.
- `ATRIL_1.0.0_x64.exe`: solo el ejecutable. Para montar video necesita `ffmpeg.exe` y `ffprobe.exe` a su lado o en el PATH, así que conviene usar el zip.
- `ATRIL_1.0.0_x64.msi`: instalador MSI alternativo.

Los instaladores no están firmados. Windows SmartScreen puede advertir al abrirlos: elige «Más información» y luego «Ejecutar de todas formas».

## Incluye

- **Producción diaria** con dos puntos de revisión: el guion verificado y la revisión final. Etapas:
  - banco de temas;
  - investigación con fuentes primarias;
  - guion;
  - verificación;
  - voz;
  - imágenes;
  - miniatura y metadatos;
  - montaje;
  - publicación.
- **Verificación.** Cada afirmación muestra su fuente, la cita y una traducción que solo aparece cuando la pides. Las marcas rojas bloquean la aprobación.
- **Voz.** Google Chirp 3 HD, Gemini TTS o ElevenLabs. También un modo «mi propia voz» con teleprónter y grabación por segmento.
- **Imágenes.**
  - Generadas (Gemini u OpenAI), con un máximo por video.
  - De archivo libre (Wikimedia Commons), con licencia y atribución registradas.
  - Tarjetas propias sin costo: fuente en pantalla, títulos, citas y rótulos.
- **Montaje con ffmpeg.** Ken Burns, transiciones, rótulos, música con compresión lateral y normalización a −14 LUFS. Usa Intel Quick Sync cuando está disponible y vuelve a montar solo los segmentos que cambian.
- **Publicación en YouTube.**
  - Subida reanudable.
  - Programación a la hora de EE. UU.
  - Declaración de contenido sintético.
  - Miniatura.
  - Exportación de paquete para subir a mano mientras la API no esté auditada.
- **Habilidades** editables y versionadas, con historial y diferencias entre versiones. Se pueden importar y exportar como SKILL.md.
- **Referentes (fase cero).** Rúbrica para NotebookLM, lectura de metadatos públicos con borrado a los 30 días, análisis y destilación en borradores de habilidades.
- **Métricas propias.** Retención desde la Analytics API, impresiones y CTR desde la Reporting API, y propuestas de cambio a las habilidades que se aplican solo si las apruebas.
- **Inglés.** Repaso espaciado del vocabulario de tus propios guiones.
- **Control.** Costos por video y por mes con tope en soles, diagnóstico por integración, registro de eventos y modo premium semanal.
