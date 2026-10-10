# ATRIL 2.5.5

Confirmaciones que funcionan (y que ya no borran sin preguntar), la constelación pasa de la interfaz a las animaciones, y Motion probado otra vez de punta a punta.

## Descargar
- **`ATRIL_2.5.5_instalador_x64.exe`**: recomendado. Desde la 2.5.1 o posterior, pulsa el botón de descarga junto a tu perfil.
- `ATRIL_2.5.5_portable_x64.zip`: portátil.
- `SHA256SUMS.txt`: huellas para comprobar cada descarga.

## Correcciones
- **«Rehacer», «Eliminar» y «Borrar» ahora preguntan de verdad.** El plugin de diálogos de Tauri (v2.8) reemplaza la confirmación del navegador por una que llama a un comando que él mismo eliminó: fallaba con «not allowed by ACL», y como devolvía una promesa, la acción se ejecutaba igual. «Eliminar» en Instrucciones y «Borrar» en Biblioteca borraban sin preguntar. ATRIL tiene ahora su propia ventana de confirmación, y una prueba impide volver a usar las del navegador.
- **Motion:** sigue el arreglo de la 2.5.4 (el mensaje de sistema va en un archivo). Comprobado con la versión exacta de Claude Code que usas (2.1.291): lee bien un archivo de 81 000 caracteres. Las pruebas ahora imitan el límite de 32 767 caracteres de Windows, así que este tipo de fallo ya no puede pasar sin detectarse.
- Si una animación falla, su motivo aparece en el resumen de Motion.
- **Prueba real con Sonnet** (diseño y corrección) y Haiku (revisión), con el límite de Windows simulado: las 3 animaciones del video de prueba quedaron listas en **4,7 min**, frente a 11,6 min con Opus en la 2.5.3 y 43 min en la 2.5.2, con una calidad visual comparable. Cada corrección por parches tardó 15–31 s.

## Cambios
- **La constelación sale de la interfaz** (fondo, Inicio y bienvenida) **y queda como pieza de animación:** `K.constellation`, con puntos repartidos que derivan, titilan y se unen con líneas, estrellas brillantes y aparición progresiva. Está en el catálogo de la guía visual (n.º 113).
- En Ajustes, Sonnet aparece primero en la lista de modelos.
