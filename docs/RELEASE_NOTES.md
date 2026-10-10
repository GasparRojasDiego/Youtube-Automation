# ATRIL 2.5.6

El montaje ya no corta segmentos, «Reintentar» solo rehace lo que falló y las herramientas de tu toolkit se usan solas.

## Descargar
- **`ATRIL_2.5.6_instalador_x64.exe`**: recomendado. Desde la 2.5.1 o posterior, pulsa el botón de descarga junto a tu perfil.
- `ATRIL_2.5.6_portable_x64.zip`: portátil.
- `SHA256SUMS.txt`: huellas para comprobar cada descarga.

## Correcciones
- **Montaje: «El segmento… se montó con 32,90 s en lugar de 97,43 s».** Si un archivo de video duraba menos de lo que decían sus datos (una animación que terminó antes o un clip de stock con la duración redondeada), la transición de ffmpeg cortaba el segmento entero en ese punto. Ahora cada toma se completa sosteniendo su último cuadro, y ATRIL mide la duración real de cada clip y animación antes de montar. Además, una animación a pantalla completa solo cubre las tomas que dura: antes, si se le asignaba una racha de 90 s a una animación de 20 s, su último cuadro quedaba congelado más de un minuto.
- **Subida a YouTube:** aguanta unos 8 minutos sin conexión (antes, 2) y usa bloques más pequeños cuando la red falla. Si aun así se corta, «Reintentar» continúa desde lo ya subido, y un video que ya está en YouTube no se vuelve a subir.

## «Reintentar» rehace solo lo que falló
- Si un paso falla, su botón dice «Reintentar» y retoma desde la etapa que falló. Antes, «Rehacer» empezaba por la primera etapa del grupo: en Motion rehacía también Retoques.
- Dentro de cada etapa queda guardado lo que salió bien:
  - Guion: cada pasada.
  - Voz: cada segmento y cada trozo narrado.
  - Medios: cada toma resuelta y las imágenes con IA.
  - Retoques: la respuesta de Claude.
  - Motion: las animaciones terminadas, y las aprobadas a las que solo les faltaba el render.
  - Montaje: cada segmento montado.
  - Metadatos: títulos y fondos de miniatura.

## Tu toolkit, sin activar nada
ATRIL busca solo las herramientas: en el PATH, en el PATH de usuario de Windows aunque la app se abriera antes de instalarlas, y en `%USERPROFILE%\tools\video`. Si falta alguna o falla, sigue sin ella. El informe de errores (Ajustes) dice cuáles encontró.
- **whisper.cpp** escucha la narración y obtiene el instante real de cada palabra. Así, el subtítulo resalta la palabra que se está diciendo y los cortes caen en la pausa correcta; antes, esos tiempos se estimaban por la longitud de las palabras. Usa el modelo `base`: el texto ya se conoce y solo hacen falta los tiempos. Corre mientras se narran los demás segmentos.
- **rembg** recorta el sujeto de las imágenes que usan las animaciones mientras Claude diseña. La nueva pieza `K.depth` pone texto o formas detrás de la persona u objeto, con profundidad y paralaje (n.º 174 de la guía visual). Usa `birefnet-general` si ya lo descargaste; si no, `isnet-general-use`, que se descarga una sola vez (179 MB) y tarda unos 4 s por imagen.
- **Escenas:** una toma de video ya no muestra a mitad un cambio de plano del clip. Hace lo mismo que PySceneDetect, pero con el detector de ffmpeg, que no necesita arrancar Python.
- **Sonido:** −14 LUFS en dos pasadas, como recomienda el toolkit: primero se mide y luego se aplica una ganancia constante. Antes era una sola pasada que subía y bajaba el volumen sobre la marcha.
- Las imágenes pequeñas se amplían con Lanczos, más nítido que el método anterior.

## Menos tokens
- Tu `~\.claude\CLAUDE.md` (el inventario del toolkit) se sumaba a cada una de las decenas de llamadas que ATRIL hace por video. Ya no se carga en ellas. Tus skills globales y el MCP de Blender ya estaban excluidos. Tu Claude Code fuera de ATRIL no cambia.
