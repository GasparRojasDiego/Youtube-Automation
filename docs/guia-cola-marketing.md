# Guía para llenar la cola de producción de ATRIL

*Versión 2.5.8. Para el gerente de marketing. La envía Diego.*

## 0. Tu papel y qué debes entregar

ATRIL es la app de escritorio con la que Diego produce videos.

- **La cola de producción** fabrica hasta 50 videos seguidos, uno tras otro.
- **Cada video es una tarjeta.** La tarjeta dice qué video hacer y cómo debe verse.
- **Tu trabajo** es entregarle a Diego, por cada video, una **ficha** con todos los campos de su tarjeta, lista para copiar y pegar. Las plantillas están en la §6.
- **Las portadas son imágenes** que Diego subirá. Tú das el concepto, el texto exacto y las medidas (§5).

**Antes de escribir:**
1. Pregunta a Diego qué modo usará (**Automatización** o **Personal**) y cuántos videos quiere.
2. Pregunta el formato de cada video: **16:9** para YouTube o **9:16** para TikTok y Shorts.
3. Entrega las fichas numeradas, en el orden en que deben producirse.

**Lo que no necesitas especificar, porque ATRIL lo resuelve solo:**
- la voz;
- los subtítulos, que resaltan cada palabra mientras se dice;
- la música de fondo, que baja sola cuando se habla;
- los efectos de sonido;
- la investigación, en Automatización;
- la búsqueda de imágenes y clips con licencia libre;
- la cantidad de animaciones: al menos una por minuto;
- el montaje;
- la mezcla de audio a −14 LUFS;
- la descarga del video terminado.

**Nada se publica sin que Diego lo apruebe en la revisión final.**

---

## 1. Cómo funciona la cola

- Produce los videos **en orden, de uno en uno**. Cada video se detiene en la revisión final de Diego.
- **Si se agota el límite del plan de Claude:**
  - lee a qué hora se repone;
  - espera;
  - sigue sola.
- **Si algo falla por un momento** (la red, un servidor saturado), reintenta a los 2, 10 y 30 minutos. Si aun así falla, marca esa tarjeta y pasa a la siguiente.
- **Se pausa sola** si queda poco disco o si Claude Code pierde la sesión.
- **Retoma** donde iba si se cierra la app.
- Evita que Windows suspenda el equipo mientras trabaja.
- **Una tarjeta incompleta no se produce.** La app la marca en rojo con el motivo. Por eso cada ficha tiene que traer todos los campos obligatorios.

---

## 2. Formato y duración

| Formato | Para qué | Duración recomendada |
|---|---|---|
| **Horizontal 16:9** (1920×1080) | YouTube normal | Lo que pida el contenido. Es el formato del canal. |
| **Vertical 9:16** (1080×1920) | TikTok, YouTube Shorts, Reels | **De 0,5 a 3 min.** YouTube trata como Short un video vertical de **hasta 3 minutos**. Si dura más, lo trata como video normal. |

- **La duración** es un rango en minutos, de mínimo a máximo. Ejemplos: `0.5–0.75`, `8–10`.
- **El narrador lee unas 150 palabras por minuto.** Para 30 s calcula unas 75 palabras; para 1 min, unas 150.
- **Si entregas guion propio, su largo manda.** La app no lo recorta, así que escríbelo con las palabras que correspondan al rango.

**Particularidades del vertical:**
- Gancho en los primeros 2 segundos.
- Una sola idea, frases cortas y pocas palabras en pantalla, pero muy grandes.
- Las fotos y los clips se recortan en alto alrededor del sujeto. Por eso conviene material con **un sujeto claro y centrado** (retratos, objetos, primeros planos) antes que paisajes anchos.
- **Las 35 «piezas listas» (§7.1) están diseñadas para 16:9.** En los videos verticales no se usan: Claude compone cada animación desde cero con el kit de efectos (§7.2), respetando las zonas seguras del teléfono.

---

## 3. Modo Automatización (videos del canal)

| Campo | Cómo llenarlo |
|---|---|
| **Tema** | Una de tres opciones:<br>• **«Siguiente tema aprobado»**: el primero que Diego tenga aprobado en *Temas*.<br>• **«Tema propuesto»**: copia el título **exacto** de uno de los temas que la IA propuso en *Temas*. Pídele a Diego la lista.<br>• **«Mi propia idea»**: una pregunta o idea concreta en 1–3 frases. Ejemplo: «¿Qué pasaría si 200 soldados modernos aparecieran en la antigua Roma?».<br>Dos tarjetas no pueden usar el mismo tema. |
| **Título** *(opcional)* | Si lo escribes, se usa **tal cual**; si no, la IA propone y elige uno. Debe cumplir estas reglas:<br>• máximo 100 caracteres, y lo ideal es 45–65;<br>• promete solo lo que el video cumple;<br>• sin MAYÚSCULAS completas ni clickbait engañoso. |
| **Enfoque o indicaciones** *(opcional)* | El ángulo, qué destacar o evitar, y el público si difiere del habitual. Ejemplo: «Enfócate en el caso peruano; evita tecnicismos; termina con una pregunta al público». |
| **Formato** | 16:9 o 9:16 (§2). |
| **Duración** | Rango en minutos (§2). |
| **Portada de YouTube** y **Portada de TikTok** | Ver §5. |

---

## 4. Modo Personal (videos a medida: proyectos, promociones, startup)

Un video personal **nunca se sube a YouTube**: termina en la revisión de Diego y en su carpeta de Descargas.

| Campo | Obligatorio | Cómo llenarlo |
|---|---|---|
| **Título del video** | Sí, salvo que haya «De qué trata» o guion | Se usa tal cual: en pantalla, en la descarga y en la nota del video. Máximo 100 caracteres. |
| **Modo** | Recomendado | Uno de cinco modos, o uno propio (ver tabla siguiente). |
| **Idioma** | Sí | Español (latino neutro) o inglés. Aplica a la narración, los textos en pantalla y los subtítulos. |
| **De qué trata** | Recomendado | El tema, el **mensaje principal** y los puntos que no pueden faltar, en 3–8 líneas. Con esto la IA escribe el guion si no hay guion propio. |
| **Para qué es** | Opcional | El objetivo. Ejemplos: «presentar la app a inversionistas», «anuncio para TikTok». |
| **Público** | Opcional | Concreto. Ejemplo: «universitarios peruanos de 18–24 que estudian y trabajan». |
| **Llamado a la acción** | Opcional | Lo que debe hacer quien lo vea. Ejemplo: «Descarga la app: enlace en la bio». |
| **Estética del video** | Muy recomendado | **El campo más importante para el resultado visual.** Manda sobre el estilo del canal. Ver §4.1. |
| **Colores** *(fondo, texto, acento)* | Opcional | En hexadecimal. Ejemplo: `#0B0D12`, `#F2F2F0`, `#4C7DFF`. Se aplican de verdad a tarjetas, animaciones y miniaturas. **Un solo acento.** |
| **Tipografía de títulos** | Opcional | Una de las incluidas: Anton, Archivo Black, Archivo, Bebas Neue, Courier Prime, DM Serif Display, Inter, JetBrains Mono, Oswald, Playfair Display, Poppins o Source Serif 4. Una fuente que no está en la lista no se puede usar. |
| **Guion** | Opcional | Si lo das, **se respeta palabra por palabra**: la IA solo lo divide en partes. Ver §4.2. |
| **Duración** | Sí | Rango en minutos (§2). Con guion propio, el largo del guion manda. |
| **Formato** | Sí | 16:9 o 9:16. |
| **Recursos** | — | Ver §4.3. |
| **Portadas** | Recomendado | Ver §5. |

**Los modos disponibles:**

| Modo | Cómo se escribe | Cómo se ve |
|---|---|---|
| **Alegre** | Cálido, cercano, optimista. | Luminoso, acento vivo, formas redondeadas, movimiento juguetón y música alegre. |
| **Corporativo** | Claro, confiable, sin exagerar. | Sobrio, mucho espacio vacío, transiciones suaves, datos en gráficos limpios. |
| **Profesional** | Experto y preciso. | Documental: diagramas rotulados, cámara estable, música discreta. |
| **Dinámico** | Rápido y enérgico. | Planos de 1,5–3 s, zooms sobre palabras clave, tipografía en movimiento y música con golpes. |
| **Llamativo** | Gancho fuerte y contrastes. | Alto contraste, letras enormes, transiciones de impacto, cifras grandes. |
| **Propio** | Nombre + descripción. Describe ritmo, voz, emociones, tipo de música y cómo se ve. | Ejemplo: «Inspirador: pausado al inicio y creciente; voz cálida; música orquestal suave que sube al final; planos amplios y luz dorada». |

### 4.1 Cómo escribir la estética (lo que más mejora el resultado)

Escribe como un **director de arte** que da instrucciones a un editor que no puede preguntarte nada. Usa viñetas y sé concreto y medible. Cubre siempre estos 10 puntos:

1. **Concepto en una línea.** El referente o la sensación general.
2. **Fondo.** Color con código, textura (grano, papel, liso) y si cambia.
3. **Color.** Paleta con códigos y **un solo acento**, diciendo para qué se usa.
4. **Tipografía.** Fuente de títulos (de la lista), tamaño relativo y cuántas palabras por pantalla.
5. **Ritmo.** Cada cuántos segundos cambia el plano y dónde hay pausas.
6. **Transiciones.** Cuál es la predominante y cuándo se usa la especial (lista en §7.3).
7. **Animaciones.** Qué tipo y para qué ideas, citando efectos de la §7 por su nombre.
8. **Imágenes.** Qué mostrar, qué gradación de color (§7.3) y qué evitar.
9. **Subtítulos y sonido.** Color de la palabra resaltada, estilo de música y efectos clave.
10. **Evitar.** Lo que arruinaría el video.

**Reglas:**
- Usa **datos verificables**: «cada 2–3 s», «#4C7DFF», «títulos de 2–4 palabras». Evita «moderno» o «bonito» sin concretar.
- No te contradigas con el modo elegido.
- Pide efectos que existen (§7). Si inventas uno, Claude lo aproxima con lo que tiene.
- En vertical, recuerda que el texto importante va en el centro-arriba. Abajo están los subtítulos y los botones de la app.

**Ejemplo de estética muy detallada** (para una startup; la app trae uno parecido en el botón «Insertar ejemplo»):

```
Estética editorial y minimalista, entre una presentación de producto premium y un documental moderno.
• Fondo: casi negro (#0B0D12) con grano fino de película; nunca blanco puro. En el cierre, un fundido lento al acento.
• Color: un solo acento, azul eléctrico (#4C7DFF), solo para cifras y palabras clave; el resto en blanco roto (#F2F2F0) y gris (#8A8F98).
• Tipografía: títulos en Bebas Neue, enormes, de 2 a 4 palabras por pantalla; textos de apoyo en Inter. Nada de párrafos en pantalla.
• Ritmo: un cambio de plano cada 2–3 s; un «punch-in» (zoom rápido) en cada dato importante; un respiro de 1 s antes del cierre.
• Gancho (0–2 s): la pregunta principal en pantalla completa, palabra por palabra, con un golpe grave al final.
• Transiciones: cortes secos casi siempre; un barrido rápido (whip) o una cortina de color solo al cambiar de sección.
• Animaciones:
  – la interfaz de la app dentro de un teléfono en perspectiva que se ilumina paso a paso («plano en perspectiva» + «pantalla que despierta»);
  – contadores que suben hasta cada cifra;
  – flechas que se dibujan y conectan problema → solución;
  – íconos de línea fina que se dibujan solos;
  – al cierre, el logo con un destello de luz.
• Imágenes: fotos reales con gradación fría y viñeta suave; primeros planos de manos usando el teléfono y de escritorios de estudiantes. Evitar el stock genérico de gente sonriendo a cámara y las oficinas corporativas.
• Subtítulos: grandes, blancos, con la palabra que se dice resaltada en el azul de acento.
• Sonido: música electrónica ambiental con pulsos suaves que sube en el clímax; «whoosh» sutil en cada transición; «pop» suave cuando aparece cada ícono; golpe grave al revelar la cifra principal.
• Evitar: degradados arcoíris, brillos de neón, texto que tiembla, emojis, más de un color de acento, transiciones de PowerPoint (estrellas, giros de cubo).
```

### 4.2 Cómo escribir un guion propio

- **Escribe solo lo que se dice en voz alta.** Los encabezados y las acotaciones (por ejemplo «[música]», «ESCENA 1») se descartan automáticamente. Aun así, las indicaciones visuales van en **Estética**, no en el guion.
- Usa frases cortas, de 8–18 palabras, y una idea por frase. En vertical, la **primera frase es el gancho**.
- **Ajusta el largo:** unas 150 palabras por minuto.
- Escribe las cifras como deben pronunciarse cuando haya ambigüedad. Ejemplo: «1,5 millones» → «un millón y medio».
- Las siglas raras, deletreadas o explicadas la primera vez.
- Si citas datos, que sean ciertos: la app no los verifica en los videos personales con guion propio.
- Cierra con el llamado a la acción, si lo hay.

### 4.3 Recursos

| Opción | Qué hace |
|---|---|
| **Biblioteca personal: Completa** *(predeterminada)* | Claude puede usar cualquier foto o video de la biblioteca personal de Diego que encaje con el guion. Si hay muchos, se queda con los 40 más relacionados. |
| **Solo algunos** | Diego elige recursos concretos (logo, capturas de la app, fotos del equipo). Indica en la ficha **cuáles** y para qué momento. |
| **Ninguna** | No se usa la biblioteca. |
| **Archivos solo para este video** | Imágenes, videos, audios o documentos (PDF, DOCX, PPTX, TXT) que solo sirven para este video. Las imágenes y los videos se muestran al menos una vez; los documentos se usan como fuente de información. |
| **Buscar en internet y crear imágenes con IA** | Activado: además de lo anterior, busca fotos y clips con licencia libre y puede generar ilustraciones. Desactivado: solo el material de Diego, más animaciones y tarjetas. |

En la ficha, nombra los archivos que Diego debe preparar. Ejemplo: «captura-inicio.png: pantalla principal de la app».

---

## 5. Portadas (se usan exactamente como se suben)

| Portada | Medidas | Formato | Dónde aparece |
|---|---|---|---|
| **YouTube** | **1280×720** (16:9) | JPG o PNG de **hasta 2 MB** (así YouTube la recibe sin cambios) | • miniatura del video en YouTube;<br>• portada del archivo descargado de un video horizontal. |
| **TikTok / Shorts** | **1080×1920** (9:16) | JPG o PNG (una WebP se convierte a PNG sin pérdida) | • portada del archivo vertical descargado;<br>• portada de cada parte para TikTok;<br>• **sus primeros cuadros**, que es la imagen que toman TikTok y las galerías del teléfono. |

- **La app no recorta, no recomprime y no le añade texto a la portada.** Lo que se sube es lo que se ve. Por eso debe venir terminada, con su texto.
- Un video horizontal personal también muestra la portada en sus primeros cuadros, en la copia descargada.

**Qué entregar por portada:**
- el **concepto**, en una línea;
- el **texto exacto** (máximo 3–5 palabras, enorme y legible en el teléfono);
- la **imagen o el fondo**;
- los **colores** con código;
- dónde va el sujeto.

**Recomendaciones de diseño:**
- YouTube:
  - un sujeto o un objeto grande;
  - alto contraste;
  - el texto no repite el título, lo complementa;
  - nada importante en la esquina inferior derecha, donde YouTube pone la duración.
- TikTok:
  - texto y cara en la **franja central**, aproximadamente el 60 % central del alto, porque la cuadrícula del perfil y la interfaz recortan o tapan arriba y abajo;
  - fondo limpio.

---

## 6. Plantillas de ficha (entrégalas así, una por video)

### 6.1 Automatización

```
### Video N · Automatización
- Tema: [Siguiente tema aprobado | Tema propuesto: «título exacto» | Mi propia idea: …]
- Título (opcional): …
- Enfoque o indicaciones: …
- Formato: [16:9 | 9:16]
- Duración (min): [mín]–[máx]
- Portada de YouTube (1280×720): concepto · texto · fondo · colores
- Portada de TikTok (1080×1920): concepto · texto · fondo · colores
```

### 6.2 Personal

```
### Video N · Personal
- Título: …
- Modo: [Alegre | Corporativo | Profesional | Dinámico | Llamativo | Propio: «nombre» — descripción]
- Idioma: [Español | Inglés]
- De qué trata: …
- Para qué es: …
- Público: …
- Llamado a la acción: …
- Estética:
  (10 puntos de la §4.1)
- Colores: fondo #…, texto #…, acento #…
- Tipografía de títulos: …
- Guion: (texto completo, o «sin guion: que lo escriba la IA»)
- Duración (min): [mín]–[máx]   · palabras del guion: N
- Formato: [16:9 | 9:16]
- Recursos: biblioteca [Completa | Solo: … | Ninguna] · archivos para este video: … · internet e IA: [sí | no]
- Portada de YouTube (1280×720): …
- Portada de TikTok (1080×1920): …
```

**Ejemplo completo:**

```
### Video 1 · Personal
- Título: Tu canal de YouTube, en piloto automático
- Modo: Llamativo
- Idioma: Español
- De qué trata: ATRIL produce videos de YouTube casi solo: investiga, escribe el guion, narra, elige imágenes, anima y monta. El creador solo revisa y aprueba. Puntos clave: ahorro de horas por video, calidad de estudio, control total antes de publicar.
- Para qué es: anuncio de lanzamiento para TikTok y Shorts
- Público: creadores de contenido hispanohablantes de 18–30 que no tienen tiempo para editar
- Llamado a la acción: Pruébala gratis: enlace en la bio
- Estética: (el ejemplo de la §4.1)
- Colores: fondo #0B0D12, texto #F2F2F0, acento #4C7DFF
- Tipografía de títulos: Bebas Neue
- Guion: ¿Y si tu canal de YouTube se produjera solo? ATRIL investiga el tema, escribe el guion y lo narra. Después elige imágenes, crea animaciones y monta el video completo. Tú solo revisas el resultado final y decides si se publica. Horas de edición, convertidas en minutos. Pruébala gratis: el enlace está en la bio.
- Duración (min): 0.4–0.6   · palabras del guion: 56
- Formato: 9:16
- Recursos: biblioteca Solo: logo-atril.png (cierre), captura-produccion.png (minuto 0:10) · archivos: — · internet e IA: sí
- Portada de YouTube (1280×720): la interfaz de ATRIL en un portátil, a la izquierda · texto «EDITA SOLO» en blanco con «SOLO» en #4C7DFF · fondo #0B0D12
- Portada de TikTok (1080×1920): teléfono con la app en el centro · texto arriba del centro «TU CANAL EN PILOTO AUTOMÁTICO» en 3 líneas · fondo #0B0D12 con grano
```

---

## 7. Efectos que ya existen en la app (cítalos por su nombre en la estética)

### 7.1 Piezas listas (solo en videos 16:9)

Animaciones probadas que Claude usa tal cual, modifica o reemplaza.

- **Apertura y estructura:**
  - Título de apertura;
  - Separador de capítulo;
  - Pregunta gancho.
- **Cifras y datos:**
  - Cifra protagonista;
  - Barras comparativas;
  - N de cada M (por ejemplo, «27 de cada 100»);
  - Porcentaje en anillo;
  - Tendencia;
  - Partes de un todo;
  - Ranking;
  - Escala real.
- **Tiempo y lugar:**
  - Línea de tiempo;
  - Salto temporal;
  - Ubicación en el mapa.
- **Relaciones y procesos:**
  - Proceso en pasos;
  - Causa y efecto;
  - Versus;
  - Red de actores.
- **Texto y evidencia:**
  - Cita;
  - Definición;
  - Documento o evidencia;
  - Lista que se marca;
  - Mito o realidad;
  - Conversación (chat);
  - Búsqueda;
  - Titulares.
- **Con imágenes:**
  - Foto con foco;
  - Texto detrás del sujeto;
  - Antes y después.
- **Sobre el video (capas):**
  - Rótulo de nombre;
  - Señalador;
  - Fuente;
  - Sello («CONFIRMADO», «FALSO»…);
  - Lugar y fecha;
  - Cifra sobre el video.

### 7.2 Kit de efectos (16:9 y 9:16)

- **Cámara:**
  - vuelo y zoom hacia cualquier detalle (y alejarse para revelar);
  - sacudida;
  - inclinación 3D;
  - empuje lento.
- **Texto:**
  - aparición por letras, palabras o líneas (subir, desenfoque, escala, caída, «scramble», máquina de escribir);
  - contador;
  - cronómetro;
  - cifra gigante;
  - números o palabras que ruedan;
  - palabra que cicla fuentes y fondos cada vez más rápido;
  - línea tecleada con la cámara siguiendo el cursor;
  - corte de luz que parte una palabra.
- **Formas e íconos:**
  - íconos que se dibujan;
  - transformación de una forma en otra (morph);
  - estallido de formas que giran y se transforman;
  - anillos radiales;
  - flechas que se dibujan y por las que corre el color;
  - marcador resaltador;
  - etiquetas flotantes.
- **Pantallas y planos:**
  - una app o una imagen proyectada en perspectiva que se endereza;
  - pilas de planos en profundidad;
  - pantalla de app que «despierta» paso a paso;
  - ventana de código que se teclea;
  - panel de vidrio líquido;
  - imagen curvada como monitor.
- **Galerías:**
  - carrusel curvo;
  - galería que aparece y se dispersa en profundidad;
  - una imagen que crece hasta llenar el cuadro;
  - pincel que revela una imagen.
- **Ruptura y tiempo:**
  - explosión de palabras o tarjetas con cámara lenta;
  - congelado y cámara lenta.
- **Generativos:**
  - campo de puntos 3D (rejilla → esfera → toroide);
  - flujo de partículas;
  - ondas;
  - manchas orgánicas;
  - rejilla isométrica.
- **Transiciones dentro de la animación:**
  - cortina de color (círculo, rectángulo o rombo);
  - mosaico diagonal;
  - barrido (whip);
  - destellos;
  - apagón.
- **Datos:**
  - barras;
  - anillo de porcentaje;
  - mapas con rutas y fronteras.

### 7.3 Edición

- **Transiciones entre tomas:**
  - corte;
  - fundido;
  - disolvencia;
  - fundido a negro;
  - fundido a blanco;
  - deslizamientos suaves (izquierda, derecha, arriba);
  - deslizamiento;
  - cortinilla;
  - apertura circular;
  - zoom;
  - desenfoque;
  - fundido a gris;
  - cobertura;
  - revelado;
  - radial.
- **Gradación de color:**
  - neutra;
  - fría;
  - cálida;
  - noir (blanco y negro);
  - sepia;
  - desaturada;
  - intensa.
- **Cámara sobre fotos:**
  - acercar;
  - alejar;
  - paneo a izquierda o derecha;
  - fija;
  - golpe de zoom en una palabra;
  - flotación lenta.
- **Sonido:**
  - whoosh;
  - impacto;
  - pop;
  - riser (subida);
  - glitch;
  - máquina de escribir;
  - obturador de cámara;
  - golpe grave;
  - música de fondo que baja sola cuando se habla.

---

## 8. Lista de control antes de entregar

1. Cada ficha tiene **formato, duración y portadas**.
2. En Personal, cada ficha tiene además **título o «de qué trata»**.
3. Si hay guion, sus palabras suman ≈ 150 × minutos.
4. Si el video es vertical, el gancho entra en ≤ 2 s.
5. La estética cubre los 10 puntos de la §4.1, con códigos de color y **un solo acento**.
6. La tipografía elegida está en la lista de la §4.
7. Las portadas traen texto exacto, medidas y colores, y la de YouTube pesa ≤ 2 MB.
8. Ninguna afirmación ni cifra es inventada.
9. El llamado a la acción coincide con lo que de verdad existe (enlace, app, producto).
10. Las fichas están numeradas en el orden de producción, con un máximo de 50.
