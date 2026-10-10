# ATRIL 2.5.3

Producción mucho más rápida, modo Personal para videos a medida con mejora continua, resultados por paso más claros y una interfaz más sobria.

## Descargar
- **`ATRIL_2.5.3_instalador_x64.exe`**: recomendado. Desde la 2.5.1 o la 2.5.2, pulsa el botón de descarga junto a tu perfil.
- `ATRIL_2.5.3_portable_x64.zip`: portátil.
- `SHA256SUMS.txt`: huellas para comprobar cada descarga.

## Velocidad
- **Animaciones en paralelo.** Cada animación avanza por su cuenta: Claude diseña varias a la vez (4 por defecto) y el navegador renderiza 2 a la vez para no agotar la memoria. Ambos valores se cambian en Ajustes → Animaciones.
- **Revisión con vista previa.** Antes de cada revisión se capturan solo 6 cuadros, en unos segundos; el render completo se hace una sola vez, al final.
- **Correcciones por parches.** Claude devuelve solo los cambios (no reescribe toda la animación); si un cambio no encaja, se pide la versión completa.
- **Caché de instrucciones.** Las reglas del canal van en el mensaje de sistema, igual en todas las animaciones del video: Claude lo lee de caché (unos 28 000 tokens por llamada que ya no se vuelven a escribir).
- **También en paralelo:** la búsqueda y descarga de medios (4 a la vez), las imágenes con IA (3), la visión (3 lotes), la narración (3 segmentos), los segmentos del montaje (2), y los títulos, la descripción y las miniaturas, que se preparan mientras se crean las animaciones.
- **Medido con Claude real** (mismo video, mismos modelos, 3 animaciones): la etapa Motion bajó de 43 min a 11,6 min (3,7× más rápida). Un video personal de 30 s con guion propio tardó entre 5 y 10 min en las pruebas.
- Lo terminado se guarda al instante: si algo se interrumpe, no se vuelve a pagar.

## Modo Personal (Inicio)
- Inicio tiene dos modos. **Automatización** queda como antes: una idea escrita o un tema investigado.
- **Personal**, para tareas, proyectos o promoción:
  - Botón **+** para subir imágenes, videos, audio y documentos (PDF, Word, PowerPoint, TXT…).
  - Botón para **subir tu guion**: se respeta palabra por palabra y no se reescribe.
  - Interruptor **Recursos**: encendido, Claude puede usar tu biblioteca, internet e imágenes con IA; apagado, usa solo tus archivos (más animaciones y tarjetas creadas por ATRIL).
  - Interruptor **Mejora continua** (apagado por defecto).
  - **Descripción** del video, **duración** (30 s a 12 min) e **idioma** (español o inglés; la voz de Google pasa a su versión latinoamericana).
- Un video personal no se sube a YouTube: termina en tu revisión y queda en Descargas. Tus directrices de contenido del canal no se aplican (manda tu descripción); las visuales sí.

## Mejora continua
- Con la primera versión lista, escribes qué cambiar. Claude mira un resumen del video y 12 cuadros del resultado, propone cambios puntuales y ATRIL rehace solo lo afectado.
- Ejemplos: «la animación m2 más lenta», «en el 0:40 una imagen de un laboratorio», «otra música». Tu pedido manda sobre el estilo del canal (si pides amarillo, va amarillo). En la prueba, cambiar el título de una animación tardó unos 3 min.
- Cambiar una animación corrige su código; cambiar una imagen, una tarjeta o la música solo vuelve a montar.
- Cambiar la narración es lo más lento: rehace la voz y la edición de esa parte.

## Producción
- Cada paso muestra lo esencial y su paso a paso:
  - **Investigar:** resumen y fuentes.
  - **Guion:** el guion final.
  - **Medios:** cuántos recursos de cada tipo.
  - **Motion:** una línea por animación.
  - **Montaje:** el video.
  - **Publicación:** la revisión.

## Interfaz
- Una sola tipografía en toda la app: la del sistema (Segoe UI).
- Bordes menos redondeados y sin degradados.
- Menú: línea bajo el encabezado, logo y nombre más grandes, y la opción activa en celeste claro.
- Inicio: título más pequeño y recuadro de escritura más bajo.
- Constelación rehecha: más puntos, más visibles y repartidos de forma pareja.
