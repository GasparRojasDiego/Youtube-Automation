# ATRIL 2.5.10

El video dura lo que pides, eliges la voz escuchándola, y los videos parecidos se configuran una sola vez con campañas. YouTube y TikTok tienen ahora cada uno su estudio.

## Descargar
- **`ATRIL_2.5.10_instalador_x64.exe`** (recomendado). Desde la 2.5.1 o posterior, pulsa el botón de descarga junto a tu perfil.
- `ATRIL_2.5.10_portable_x64.zip` (versión portátil).
- `SHA256SUMS.txt`, con las huellas para comprobar cada descarga.

## La duración se cumple siempre
- **Antes:** un video de 30 s con un guion de 5 palabras duraba unos 3 s, porque la voz mandaba.
- **Ahora** manda la duración pedida y la voz la complementa. Si falta tiempo:
  - primero hay algo más de aire entre frases, con tope para que no suene lento;
  - lo que sigue faltando se convierte en tramos instrumentales al final de cada parte y en un cierre;
  - el storyboard cubre esos tramos con sus propias tomas (en vertical, ninguna dura más de 3,5 s) y la música los sostiene.
- Si la IA escribe el guion, ajusta su largo a la duración pedida. Si un guion propio es más largo que el máximo, no se recorta y la app avisa.
- Un video vertical sin duración propia dura de 30 a 60 s. Antes heredaba la de los videos largos del canal (de 10 a 13 min).

## Voces
- En **Ajustes → Voz**, «Elegir…» abre la lista de voces del proveedor activo, con buscador y filtro mujer/hombre.
- **«Probar»** narra una frase de muestra. La muestra se guarda, así que no se paga dos veces. En ElevenLabs se usa la muestra pública de cada voz.
- **Google Chirp 3 HD:** 30 voces, cada una en español latino y en inglés. Hay una voz por idioma en Ajustes, y cada tarjeta o campaña puede elegir otra. Al cambiar el idioma de una tarjeta, la voz pasa a su versión en el otro idioma.

## Campañas
- Si varios videos comparten formato, se agrupan en una **campaña**: su **plantilla** se configura una vez y cada tarjeta guarda solo lo que cambia.
- La plantilla incluye duración, modo, idioma, estética, colores, tipografía, voz, recursos y llamado a la acción.
- En cada tarjeta, cada campo dice si es **«de la campaña»** o **«propio»**. Con ↺ vuelve al valor de la plantilla.
- Cambiar la plantilla actualiza las tarjetas que aún no empezaron, salvo los campos que cada una cambió.
- **«Crear campaña con esta tarjeta»** convierte una tarjeta ya configurada en la plantilla.
- Borrar una campaña no borra nada: sus tarjetas quedan sueltas con la configuración que tenían.

## Importar tarjetas en bloque (JSON)
- **Cola → Importar:** pegas un bloque JSON con la campaña, su plantilla y sus tarjetas, y ATRIL las crea de una vez.
- Las portadas y los archivos se copian desde la carpeta que elijas.
- Las claves van en español: titulo, de_que_trata, guion, duracion_s, voz, estetica, colores, portada_tiktok, publicacion…
- Si hay un error, no se crea nada y la app dice qué corregir.
- **«Copiar formato de ejemplo»** te da un modelo completo para tu chat de marketing. La guía `docs/guia-cola-marketing.md` explica cada clave.

## Estudios de YouTube y TikTok
- El menú tiene **YouTube** (horizontal 16:9) y **TikTok** (vertical 9:16, también para Shorts) en lugar de Inicio y TikTok.
- Cada estudio tiene su creación rápida, su propia cola (se inicia y se pausa por separado) y solo lo suyo en curso. El formato ya no se elige: lo da el estudio.
- **TikTok → «Listos para publicar»** muestra los verticales que aprobaste, cada uno con:
  - su texto de TikTok y el título y la descripción de Shorts, para copiar (los de la tarjeta si los diste);
  - el botón de descarga;
  - la marca de publicado en TikTok o en Shorts.
- ATRIL no sube nada a TikTok.
- **TikTok → «Recortar videos de YouTube en partes»** reemplaza a la antigua pantalla TikTok.

## Filtros
- **Videos:** por plataforma, modo, estado (por revisar, aceptados, publicados) y título, con varios órdenes. Ahora carga en una sola consulta, no una por video, y las miniaturas verticales se ven completas.
- **Biblioteca:** por forma (horizontal, vertical, cuadrada), estado (descritos, sin describir, «no usar», nunca usados, ya usados), fuente y calidad mínima, con varios órdenes. También funcionan sobre una búsqueda.

## Correcciones
- **Revisión final de un video personal:** ya no ofrece «programar en YouTube», porque un video personal nunca se sube. Ahora hay un solo «Aprobar».
- **Aviso de IA en la descripción:** se escribe en el idioma del video (en español para los videos en español) y menciona las ilustraciones hechas con IA cuando las hay.
- **Texto de TikTok de un vertical:**
  - ya no dice «mira el video completo en YouTube», porque el vertical es el video completo; usa su propio llamado a la acción;
  - se escribe en el idioma del video.
- **Piezas listas:** ahora son lo predeterminado en las animaciones de 16:9. El registro dice cuántas animaciones partieron de una pieza.
- **Ventanas superpuestas:** Escape cierra solo la de arriba; por ejemplo, el selector de voz sin cerrar la tarjeta.
- **Contacto público:** en la web y en la política de seguridad ahora es vt.asvent@gmail.com.

## Qué se quitó o se simplificó
- **Se quitó** elegir el formato en cada video y en cada tarjeta, porque lo da el estudio.
- **Se quitó** la programación de YouTube en los videos personales.
- **Se quitó** la invitación a YouTube en el texto de los verticales.
- **Se quitó** la pantalla TikTok aparte: ahora es parte de su estudio.
- **Se quitó** una consulta por video en Videos y en TikTok.
- **Se simplificó** la configuración repetida tarjeta por tarjeta: ahora va en la plantilla de la campaña o en un JSON.
- **Se simplificó** la duración en vertical: ahora se escribe en segundos.

## Verificado
- TypeScript, compilación, `cargo check` y las 128 pruebas unitarias, incluidas 11 nuevas: herencia de campañas, importación (duraciones, errores, portadas), aviso de IA, duración de verticales y filtros de la biblioteca.
- **Prueba real con Claude:** una tarjeta de campaña vertical con un guion de 5 palabras y un mínimo de 30 s.
  - Dio un video de 1080×1920 de **30,0 s**: 3,9 s de narración y 26,1 s de tramos instrumentales con 11 tomas. Ninguna toma del tramo instrumental dura más de 3,4 s.
  - Tiene audio hasta el final.
  - Heredó la voz de la campaña.
  - No se publicó nada.
  - La voz se simuló, porque la prueba corre sin red.
- Recorrido de la interfaz en un navegador: estudios, importar, plantilla, tarjeta heredada, voces y filtros de Videos y de Biblioteca.

## Sin verificar
- La app instalada en Windows. Lo prueba la compilación del release.
- Escuchar las voces de Google: la prueba corre sin red ni clave.
