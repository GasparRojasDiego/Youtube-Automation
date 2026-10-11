# ATRIL 2.5.7

35 piezas de animación listas para usar, Obsidian como memoria del canal, y Producción, Videos y TikTok más cómodos.

## Descargar
- **`ATRIL_2.5.7_instalador_x64.exe`**: recomendado. Desde la 2.5.1 o posterior, pulsa el botón de descarga junto a tu perfil.
- `ATRIL_2.5.7_portable_x64.zip`: portátil.
- `SHA256SUMS.txt`: huellas para comprobar cada descarga.

## Piezas listas (Instrucciones → Piezas listas)
- 35 animaciones completas y universales, en 7 grupos: apertura (título, capítulo, pregunta), cifras (cifra protagonista, barras, «N de cada M», anillo, tendencia, partes de un todo, ranking, escala real), tiempo y lugar (línea de tiempo, salto temporal, mapa), relaciones (proceso, causa y efecto, versus, red), texto y evidencia (cita, definición, documento, lista, mito o realidad, conversación, búsqueda, titulares), imágenes (foto con foco, texto detrás del sujeto, antes y después) y capas sobre el video (rótulo de nombre, señalador, fuente, sello, lugar, cifra).
- Cada una trae su vista previa renderizada, qué hace, cuándo usarla, sus opciones y su código, listo para copiar.
- En cada animación, Retoques elige una de tres formas:
  - **Tal cual**: solo cambian los textos, cifras, íconos e imágenes. Claude escribe unas líneas en lugar de diseñar toda la animación, así que tarda menos y falla menos.
  - **Modificada**: se parte del código de la pieza y se cambia solo la parte que hace falta.
  - **Desde cero**: cuando ninguna encaja.
- Una animación a pantalla completa puede encadenar 2 o 3 piezas con transiciones.
- La guía visual `docs/habilidades/atril-visual.md` (v2.2) ahora remite a las piezas: cada efecto que ya es una pieza conserva su descripción, pero ya no explica cómo hacerlo. Vuelve a importarla en Instrucciones si la usas.

## Movimiento más fino
Se incorporaron a las animaciones y a su revisión visual los principios de las skills de diseño que instalaste: Emil Kowalski, Impeccable y Taste.
- **Curvas de movimiento**: cada tipo de movimiento usa la suya. Las entradas frenan suave, los desplazamientos aceleran y frenan, y el progreso continuo va a velocidad constante.
- **Salidas**: duran menos que las entradas y salen por el mismo camino.
- **Entradas**: nada aparece desde tamaño cero y no hay rebotes por costumbre.
- **Un solo color de acento**.
- **Revisión visual**: ahora detecta los rasgos de plantilla, como la misma entrada en todo, halos brillantes o texto con degradado.

## Obsidian
- ATRIL encuentra tu bóveda sola y escribe en la carpeta `ATRIL`:
  - una nota por video: estado, descripción, capítulos, piezas usadas y archivo;
  - un índice del canal.
- **Memoria para Claude**: una nota breve que escribes tú (hasta 1 500 caracteres). Claude la lee al elegir temas, investigar y escribir el guion. Se abre desde Ajustes → Obsidian.

## Producción
- **Miniatura**: además de las automáticas, puedes elegir una imagen propia. Se ajusta sola a 1280×720.
- **Portada de TikTok**: los primeros cuadros de cada parte la muestran.
- **Descripción más corta**: ya no lleva los bloques de fuentes ni de créditos. Los créditos que exige una licencia CC BY se añaden solos al subir el video.
- **«Aceptar (publicar después)»**: guarda el video en Videos sin publicarlo.

## Videos y TikTok
- **Número del video**: cada tarjeta lo muestra en un triángulo en la esquina.
- **Borrar un video**: la papelera pide que escribas ELIMINAR. Los recursos que usó se conservan en la Biblioteca.
- **Partes de TikTok automáticas**: se cortan solas al aceptar o publicar un video de Automatización.
- **Texto de TikTok**: es uno solo, con botón de copiar, e incluye la descripción, el aviso de que el video completo está en tu canal y 5 hashtags como máximo.

## Biblioteca e inicio
- **Archivos personales separados**: lo que subes para tus videos personales ya no se mezcla con la automatización. La Biblioteca tiene un selector para ver unos u otros, y los archivos que ya habías subido pasan solos a «personales».
- **Selector de modo**: «Automatización / Personal» ahora está en la misma fila que el título, arriba a la derecha.
