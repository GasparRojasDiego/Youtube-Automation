# ATRIL 2.5.8

Esta versión trae tres novedades:
- una cola de producción de hasta 50 videos seguidos, que sigue sola aunque se agote el límite del plan;
- videos verticales 9:16 para TikTok y Shorts;
- tus portadas, usadas exactamente como las subes.

## Descargar
- **`ATRIL_2.5.8_instalador_x64.exe`** (recomendado). Desde la 2.5.1 o posterior, pulsa el botón de descarga junto a tu perfil.
- `ATRIL_2.5.8_portable_x64.zip` (versión portátil).
- `SHA256SUMS.txt`, con las huellas para comprobar cada descarga.

## Cola de producción (Inicio)
Es un recuadro nuevo entre «¿Qué video hacemos hoy?» y «En curso». Muestra las tarjetas del modo activo y tiene botones para iniciar, pausar o detener.

- **Tarjetas.** Cada tarjeta es un video. Se apilan, se reordenan, se duplican y se quitan. Al pulsar una, se abre su configuración, que se guarda sola.
- **Tarjeta de Automatización.**
  - Tema: el siguiente aprobado, uno de los que propuso la IA, o una idea propia.
  - Título fijo (opcional).
  - Enfoque o indicaciones.
  - Formato y rango de minutos.
  - Portadas de YouTube y de TikTok.
- **Tarjeta Personal.**
  - Título y de qué trata; para qué es, público y llamado a la acción.
  - Modo: alegre, corporativo, profesional, dinámico, llamativo o uno propio con su descripción.
  - Descripción estética detallada, con un ejemplo que se puede insertar.
  - Colores (fondo, texto y acento) y tipografía de títulos.
  - Guion escrito o en archivo, rango de minutos, idioma y formato.
  - Recursos: por defecto, la biblioteca personal completa; también se pueden elegir algunos o ninguno. Admite archivos solo para ese video y un interruptor para buscar en internet y crear imágenes con IA.
  - Portadas.
- **Hasta 50 videos pendientes.** Se producen uno tras otro y cada uno se detiene en tu revisión final: **nada se publica sin tu aprobación**.
- **Validación.** Una tarjeta incompleta no se produce: queda en rojo con el motivo. Los avisos (sin portada, vertical de más de 3 min…) no bloquean.
- **Guía para llenarla:** `docs/guia-cola-marketing.md`.

## Una cola que no se detiene sin motivo
- **Límite del plan.** ATRIL lee en el mensaje de Claude Code a qué hora se repone y espera hasta esa hora, más 3 minutos de margen. Muestra la cuenta regresiva y sigue sola. Si el mensaje no trae la hora, la toma de la ventana llena del plan; y si tampoco la hay, vuelve a probar en 30 minutos. El botón «Probar ahora» corta la espera.
- **Animaciones y límite.** Si el límite llega mientras se crean las animaciones, la etapa se detiene y espera. Así ningún video se monta con animaciones de menos por culpa del límite; lo ya terminado se conserva.
- **Fallos pasajeros** (red, servidor saturado, tiempo agotado): reintenta a los 2, 10 y 30 minutos, retomando el video desde el paso que falló.
- **Fallo persistente.** Si un video falla de verdad, la cola lo marca y sigue con el siguiente. Puedes devolverlo a la cola cuando quieras.
- **Pausa automática** cuando hace falta algo de tu parte: poco disco (menos de 6 GB) o Claude Code sin sesión. Al reanudar, retoma la tarjeta.
- **Retoma al abrir la app** si se cerró a mitad de un video.
- **El equipo no se suspende** mientras la cola trabaja o espera (Windows). La pantalla sí puede apagarse.
- **Pausar** termina el video en curso y se detiene. **Detener** lo corta, y queda guardado para retomarlo.

## Videos verticales 9:16 (TikTok y YouTube Shorts)
- **Dónde se elige.** Junto a «Crear video», con el botón 16:9 / 9:16, y en cada tarjeta de la cola.
- **El cuadro es vertical de punta a punta:**
  - montaje a 1080×1920, con las fotos y los clips recortados alrededor del sujeto;
  - búsqueda de material vertical;
  - imágenes con IA en 9:16;
  - tarjetas de texto compuestas en vertical;
  - subtítulos más grandes, de 1–2 líneas, por encima de la interfaz de la app;
  - animaciones a 1080×1920 con zonas seguras;
  - guion con gancho en los primeros 2 segundos;
  - revisión visual de las animaciones con criterios de teléfono.
- **Las 35 piezas listas son de 16:9.** En vertical no se usan: Claude compone cada animación con el kit, que ya se adapta al cuadro vertical.
- **Al publicar en YouTube**, un vertical de hasta 3 min lleva #Shorts en la descripción. Si dura más, se avisa de que YouTube lo tratará como video normal.

## Tus portadas, tal cual
- **Portada de YouTube.** Es la miniatura y se sube sin cambios si es JPG o PNG de hasta 2 MB, que es el límite de YouTube. Ya no se recorta a 1280×720. Además, ya no se crean fondos con IA para miniaturas que no se van a usar.
- **Copia en Descargas.** Lleva la portada incrustada con los mismos bytes: es la que muestran el Explorador de Windows y los reproductores. En videos verticales y personales, además, aparece en los primeros cuadros, que es la imagen que toman TikTok y las galerías del teléfono.
- **Partes para TikTok.** Cada parte lleva la portada de TikTok incrustada y en sus primeros cuadros.
- **Revisión final.** Puedes cambiar o quitar las dos portadas; la copia en Descargas se rehace con la nueva.
- **Formatos admitidos:** JPG, PNG y WebP (la WebP se convierte a PNG sin pérdida, porque un MP4 no admite WebP como portada).

## Otros cambios
- **Biblioteca personal en los videos personales.** El storyboard recibe tus recursos más relacionados con el guion, hasta 40, y los usa antes que el material de stock.
- **Colores y tipografía de la tarjeta** en tarjetas, animaciones y miniaturas. La palabra resaltada de los subtítulos toma el color de acento.
- **Título de la tarjeta.** Se usa tal cual, también en Videos y en el nombre de la descarga; las propuestas de la IA quedan como alternativas.
- **Miniatura propia en YouTube.** Ahora se sube con el tipo correcto (JPEG o PNG).

## Verificado
- Pruebas automáticas: TypeScript, 110+ pruebas unitarias, compilación y `cargo check`. Incluyen:
  - la lectura de la hora de reposición en los formatos de Claude Code;
  - la cola sobre una base de datos real;
  - las portadas con ffmpeg real (mismos bytes);
  - el montaje vertical.
- Prueba completa con Claude real: una cola de dos videos personales (uno vertical) y un límite del plan simulado. La cola esperó a la hora de reposición, siguió sola y dejó los dos videos en revisión, con las portadas exactas en las descargas y en la parte de TikTok.

## Pendiente de comprobar en tu equipo
- Que Windows no se suspenda con la cola en marcha (no se puede probar en la nube).
- La calidad de las animaciones verticales en videos largos.
