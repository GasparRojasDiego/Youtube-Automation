# ATRIL 2.2.0

Escribes la idea y la app hace el video sola. Solo revisas el final.

## Descargar
- **`ATRIL_2.2.0_instalador_x64.exe`**: recomendado (conserva tus datos).
- `ATRIL_2.2.0_portable_x64.zip` y `ATRIL_2.2.0_x64.msi`: alternativas.

## Cambios
- **Sin supervisión.** En **Hoy** escribes la idea y pulsas «Crear video». No hay que aprobar el guion: lo único que te espera es la revisión final antes de subir.
- **La revisión de datos ya no bloquea.** Si algo sale en rojo, se corrige solo y el video sigue. Se puede desactivar en Ajustes → Producción.
- **Animaciones arregladas.** El error «gsap is not defined» venía de cómo Windows escribe la ruta de instalación. Ahora las bibliotecas van dentro de cada animación. Si el motor falla, no se gasta Opus intentando «corregir» el código.
- **Motion design de verdad.** Nuevo kit para Opus: papel con retícula, HUD con código de tiempo, títulos enormes, contadores, cronómetros, etiquetas flotantes, glitch, destellos, diagramas que se transforman y puntos 3D. Al menos una secuencia por minuto.
- **Imágenes con IA.** OpenAI (gpt-image-2) o Gemini (Nano Banana 2), según la clave que tengas. Se usan en escenas difíciles y cuando no hay material libre.
- **Menos tarjetas.** Como máximo 4 por video, solo para énfasis. Si falta material, primero se busca con palabras más generales, luego se crea una imagen con IA y solo al final se usa una tarjeta.
- **Efectos de sonido siempre.** Para cada efecto: tu biblioteca → Freesound → ElevenLabs (opcional) → síntesis propia. Ya no se omite ninguno.
- **Plantillas de habilidades** en `docs/habilidades/` (guion, imágenes, motion).
- El modelo de imagen `gemini-2.5-flash-image` (retirado el 2 de octubre de 2026) se cambia solo por el actual.
