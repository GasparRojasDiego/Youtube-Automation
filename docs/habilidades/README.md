# Habilidades: cómo escribirlas bien

Una habilidad es un texto Markdown con **reglas concretas** que Claude sigue en cada video. Créala en
**Habilidades → Textual / Visual → Nueva** (pega el texto) o impórtala con **Importar .md**.

Una buena habilidad:

1. **Usa títulos cortos y viñetas.** Una idea por viñeta.
2. **Da reglas comprobables**, no deseos. Mal: «que sea interesante». Bien: «cada 60–90 s, una pregunta o giro».
3. **Incluye ejemplos buenos y malos** (✅ / ❌). Es lo que más mejora el resultado.
4. **Dice qué evitar** y qué hacer en su lugar.
5. **Pone los valores técnicos en bloques `atril:*`** (JSON válido): colores, fuentes, palabras por minuto, etc.
6. **No repite reglas que ya tiene la app**, como el formato de salida, las licencias o el «no inventes datos».
7. **Manda cada sección a su etapa** (ATRIL 2.4+): pon etiquetas al final del título, por ejemplo
   `## Catálogo de efectos [animaciones]`. Esa sección (hasta el siguiente título de su nivel) solo llega a esas
   etapas, aunque la habilidad sea Textual o Visual. Sin etiqueta, llega a todas las etapas de su tipo.
   Debajo del editor verás cuántos caracteres recibe cada etapa.

Etiquetas: `temas`, `investigación`, `guion`, `verificación`, `paquete` (títulos, descripción y miniatura),
`miniatura`, `plan` (storyboard e imágenes con IA), `montaje` (plan y retoques), `retoques`, `animaciones`, `todas`.

Bloques de parámetros que lee ATRIL: `atril:guion` (wordsPerMinute), `atril:visual` (colores, fuentes, photorealistic,
imageStyle), `atril:montaje` (shotSeconds, segmentTransition, kenBurns, musicVolumeDb, musicDuck, humor, grain,
vignette), `atril:subtitulos` y `atril:miniatura` (font, weight, colores, maxWords).

Fuentes disponibles: Anton, Archivo, Archivo Black, Bebas Neue, Courier Prime, DM Serif Display, Inter,
JetBrains Mono, Oswald, Playfair Display, Poppins, Source Serif 4.

## Habilidades de Atril (listas para pegar)

- `atril-guion.md` → **Textual**, nombre «Atril · Guion»: identidad narrativa, ángulo, estructura, verdad, voz y paquete.
- `atril-referentes.md` → **Textual**, nombre «Atril · Referentes»: técnicas de los canales de referencia y límites
  para no copiar (sus secciones visuales llegan solas a las etapas visuales).
- `atril-visual.md` → **Visual**, nombre «Atril · Visual»: identidad visual, plan, imágenes, retoques, animaciones
  (regla de impacto visual, dinamismo, sonido sincronizado, 9 secuencias de referencia y catálogo de 172 efectos) y
  miniatura. Las secuencias de referencia usan piezas de ATRIL 2.5.

## Plantillas genéricas

- `guion.md`: Instrucciones (cómo sale el guion).
- `visual-imagenes.md`: Instrucciones visuales para fotos e imágenes con IA.
- `motion.md`: Instrucciones visuales para las animaciones (estilo «motion reel», visual primero).
