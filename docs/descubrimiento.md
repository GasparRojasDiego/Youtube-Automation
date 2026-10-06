# Descubrimiento: hechos verificados, costo preliminar y preguntas abiertas

> **Estado (2026-10-06):** fase previa al diseño. Todavía no hay código.
> Este documento registra lo que condiciona el diseño y las preguntas que deben responderse antes de proponer la arquitectura. Se actualizará con las respuestas.

**Cómo se verificó.**
- **Políticas y APIs de Google:** se verificaron con el texto de las páginas oficiales tal como lo indexan los buscadores. El proxy de este entorno bloqueó la lectura directa de `developers.google.com`, `support.google.com` y `ai.google.dev`.
- **Precios de Anthropic:** proceden de la documentación oficial.
- **Precios de otros proveedores:** proceden de sus páginas oficiales a través de buscadores. Pueden cambiar.
- **[no verificado]:** marca inferencias o fuentes secundarias.

Cada integración se volverá a verificar contra la página completa antes de implementarla.

---

## 1. Hallazgos que modifican premisas del documento de requisitos

### 1.1 Monetización: el umbral se duplica el 1 de febrero de 2027

| | Hasta el 31-ene-2027 | Nuevos solicitantes desde el 1-feb-2027 |
|---|---|---|
| Anuncios (YPP completo) | 1.000 suscriptores + 4.000 h en 12 meses, o 10 M de vistas de Shorts en 90 días | 1.000 suscriptores + **8.000 h en 365 días**, o **20 M** de vistas de Shorts en 90 días |
| Nivel inferior (fan funding, Shopping) | 500 suscriptores + 3.000 h o 3 M de vistas de Shorts | sin cambios |

Los socios ya admitidos conservan su estado.

Fuentes:
- [blog.youtube, anuncio del 10-ago-2026](https://blog.youtube/news-and-events/youtube-partner-program-updates-2027-new-opportunities-earn/)
- [Ayuda de YouTube 72851](https://support.google.com/youtube/answer/72851)
- [Music Business Worldwide](https://www.musicbusinessworldwide.com/new-youtube-creators-will-need-8000-watch-hours-to-start-earning-from-ads-double-the-current-bar/)

**Implicación (cálculo propio):**
- 8.000 h equivalen a 480.000 minutos.
- Supongamos que en un video de 13 min la gente ve, en promedio, entre 4 y 6 min.
- Entonces hacen falta unas **80.000–120.000 vistas en 12 meses** antes del primer ingreso por anuncios.

**Impuestos:**
- No existe tratado tributario entre EE. UU. y Perú ([lista del IRS](https://www.irs.gov/businesses/international-businesses/united-states-income-tax-treaties-a-to-z)).
- Si se envían los datos fiscales, Google retiene hasta un **30 %** de lo generado por la audiencia estadounidense.
- Si no se envían, retiene hasta un 24 % del total mundial ([Ayuda de YouTube 10391362](https://support.google.com/youtube/answer/10391362)).
- La estimación de 300–1.500 USD por cada 100.000 vistas es anterior a esa retención.

### 1.2 Contenido inauténtico: la aclaración de julio de 2026

En julio de 2025, YouTube renombró la política *repetitious content* como *inauthentic content*. A mediados de julio de 2026 la precisó en tres categorías ([Ayuda de YouTube 1311392](https://support.google.com/youtube/answer/1311392); [TechCrunch, 2026-07-20](https://techcrunch.com/2026/07/20/youtube-clarifies-policies-around-ai-slop-and-upsetting-videos/)):

1. **Contenido genérico o repetitivo:** intercambiable, de plantilla.
2. **"Unsatisfying or off-putting content".** El documento de requisitos lo llama "perturbar o manipular", pero la etiqueta oficial es otra. Cubre el contenido que *"relies heavily on emotionally manipulative formulas, mimics existing formats… or appears designed to shock or surprise viewers for the sole purpose of getting views"*.
3. **Personas de IA presentadas como expertos humanos** en salud, derecho, finanzas o política.

La política también excluye *"readings of other materials you did not originally create, like text from websites or news feeds"*.

**Implicación para el género "el oscuro secreto de…":**
- El formato del título es en sí mismo una fórmula conocida de impacto, así que la veracidad no basta como defensa.
- Cada video debe aportar un análisis propio que justifique el gancho.
- El guion no puede ser una paráfrasis de sus fuentes, porque eso entraría en "leer materiales ajenos".
- Por eso la etapa de verificación debe comprobar también el **aporte propio**, no solo las fuentes.

No hay ningún texto oficial que declare monetizables, ni tampoco vetados, los canales sin rostro con voz de IA [no verificado en ningún sentido].

### 1.3 Declaración de contenido sintético

**Es obligatoria** solo para contenido realista que cumpla alguna de estas condiciones ([Ayuda de YouTube 14328491](https://support.google.com/youtube/answer/14328491)):
- muestra a una persona real diciendo o haciendo algo que no hizo;
- altera metraje de un evento o lugar real;
- genera una escena realista que no ocurrió;
- usa música generada como foco del video.

**No es obligatoria** para:
- contenido claramente no realista;
- la ayuda de IA en el guion, la miniatura o las infografías.

**Voz de narración sintética genérica (no clonada):** el texto oficial no la menciona [no verificado]. Por el criterio de esa página, parece no obligatoria (inferencia).

**Etiquetado automático:** desde mayo de 2026, YouTube etiqueta por su cuenta el uso fotorrealista significativo que no se haya declarado ([blog.youtube](https://blog.youtube/news-and-events/improving-ai-labels-viewers-creators/)).

**Por API:** existe el campo booleano `status.containsSyntheticMedia`, disponible en `videos.insert` y `videos.update` desde el 2024-10-30. Esto permite que la declaración sea un paso obligatorio del flujo de publicación.

### 1.4 Publicación automatizada: requisitos previos

- **Cuota de subida:** `videos.insert` tiene hoy su propia cuota de subidas, con 100 subidas al día por defecto. Google cambió esto en diciembre de 2025 y en junio de 2026.
- **Bloqueo en privado:**
  - Los videos subidos desde un proyecto de API no verificado (creado después del 28-jul-2020) quedan restringidos a **privado**.
  - El bloqueo dura hasta que el proyecto pase una auditoría de cumplimiento, que se solicita con el formulario *YouTube API Services – Audit and Quota Extension Form*.
  - Google no publica plazos. Según terceros, tarda entre 1–2 semanas y varios meses [no verificado].
  - También según terceros, el formulario pide una política de privacidad, unos términos de uso y una demostración del flujo OAuth [no verificado].
- **Programación:** `status.publishAt` exige que el video esté en privado. Es YouTube quien ejecuta la publicación programada, así que el PC no necesita estar encendido a esa hora.
- **Verificación del canal:** las miniaturas personalizadas y los videos de más de 15 min requieren que el canal esté verificado por teléfono.
- **Límite diario:** existe un límite de subidas por canal cada 24 h, pero su cifra no es pública.

**Implicación:**
- La auditoría debe empezar en paralelo con la fase cero.
- Mientras no se apruebe, la publicación será manual en YouTube Studio, con un paquete completo preparado por la app.

### 1.5 Análisis de canales ajenos: qué se puede obtener y qué no

| Dato | ¿Hay vía oficial? | Vía |
|---|---|---|
| Título, descripción, etiquetas, miniatura, fecha, duración, vistas, likes, nº de comentarios | Sí | YouTube Data API (con clave de API) |
| Dislikes | No; son privados desde dic-2021 | — |
| Retención, CTR, impresiones | No; solo los ve el dueño del canal | — |
| Subtítulos / transcripción | **No por la YouTube Data API**: `captions.download` exige permiso de edición sobre el video | — |
| Contenido del video (audio e imagen) para analizar el guion | Sí, de forma indirecta | La Gemini API acepta URLs públicas de YouTube (detalle abajo) |

Sobre la vía de Gemini:
- Es una función oficial de Google, todavía en *preview*.
- Por ahora es gratuita.
- El nivel gratuito admite 8 h de video al día; el de pago no tiene límite por duración.
- Admite hasta 10 videos por solicitud.

**Restricción de las Políticas para Desarrolladores (§III.E.4):**
- Los datos obtenidos sin las credenciales del dueño del canal no pueden guardarse más de **30 días** sin refrescarlos o borrarlos.
- Tampoco pueden usarse para *"create new or derived data or metrics"*.
- Desde mayo de 2026 existe una excepción, pero solo para desarrolladores auditados con un caso de uso analítico que la soliciten ([derived-metrics policy](https://developers.google.com/youtube/terms/derived-metrics-policy)).

**Implicación:**
- Una base permanente de estadísticas de 100 canales, con correlaciones propias, choca con esas políticas.
- **Diseño conservador:**
  - Los datos crudos de la API se leen de forma temporal y se refrescan o borran a los 30 días.
  - Lo que se conserva es conocimiento cualitativo en prosa, con enlaces a los videos como ejemplos.
- Hay una **zona gris**: no está claro si esa prosa destilada cuenta como "datos derivados". Se resolverá leyendo el texto completo antes de implementar.

**Fragilidad:** la vía Gemini–YouTube está en *preview*, y su precio y límites "probablemente cambien". Es aceptable para la fase cero, que se hace una vez, pero no debe ser una dependencia del flujo diario.

### 1.6 Métricas del canal propio

- **Retención:** está en la YouTube Analytics API (`audienceWatchRatio` y `relativeRetentionPerformance`, con la dimensión `elapsedVideoTimeRatio`).
- **Impresiones y CTR:** solo están en la **YouTube Reporting API**, con los informes `channel_reach_basic_a1` y `channel_reach_combined_a1`, disponibles desde enero de 2026.
  - Esta API entrega informes diarios en bloque y con retraso; no admite consultas al instante.
  - El documento de requisitos acierta en que estos datos están disponibles. El matiz es la vía y el retraso.

### 1.7 Cuentas y titularidad

- AdSense exige tener 18 años o más. Un menor vincula el canal a la cuenta AdSense de un padre o tutor ([Ayuda de AdSense 2533300](https://support.google.com/adsense/answer/2533300)).
- Los términos de ElevenLabs exigen 18 años o más, y es la norma entre los proveedores de IA.
- **Consecuencia práctica:** las cuentas de pago y las claves de API deben estar a nombre del titular adulto, igual que el canal.

### 1.8 Fragilidad confirmada (sección 10.1 de los requisitos)

Un ejemplo reciente: Google retiró **Imagen 4** de la Gemini API el 2026-08-17. El diseño debe aislar cada proveedor detrás de una interfaz sustituible, con detección visible de fallos.

---

## 2. Costo preliminar (orden de magnitud)

Esta tabla no es la propuesta de arquitectura, que depende del presupuesto. Es el rango que permite elegir ese presupuesto con información.

**Supuestos:**
- 30 videos al mes.
- Unos 13 min por video (≈2.000 palabras, ≈12.000 caracteres).
- 60 imágenes por video, más un 20 % de regeneraciones.
- Precios de lista a 2026-10-06.

| Partida (por video) | Económica | Recomendada | Comentario |
|---|---|---|---|
| LLM (investigación, guion, verificación, prompts, metadatos) | ~$2,0 | ~$3,7 | La verificación usa el modelo más capaz en ambas |
| Búsqueda web | ~$0,3 | ~$0,3 | ~30 búsquedas a $10 cada 1.000 |
| Voz | $0–0,4 | ~$1,0 | Económica: Google Chirp 3 HD (1 M de caracteres al mes gratis) u OpenAI (~$0,2). Recomendada: ElevenLabs Multilingual (~$0,08 cada 1.000 caracteres) |
| Imágenes (≈72) | ~$0,4–1,0 | ~$2,7–3,0 | Económica: gpt-image-2 low o FLUX.2 klein. Recomendada: gpt-image-2 medium, FLUX.2 pro o Recraft |
| Miniatura (varias candidatas) | ~$0,2 | ~$0,5–1 | |
| Montaje | $0 | $0 | Se hace en el PC del usuario |
| **Total por video** | **~$3** | **~$8** | |
| **Total al mes (30 videos)** | **~$90** | **~$240** | |
| Música | $0 | $10–18 al mes | Económica: Biblioteca de Audio de YouTube (descarga manual, una sola vez). Recomendada: Epidemic Sound Creator |
| Video semanal premium | +$10–25 por video | | |
| Fase cero (una sola vez) | ~$50–150 | | ~2.000 videos ajenos (20 por canal); transcripción con Gemini; análisis por lotes (50 % de descuento) |

**Qué se pierde con la configuración económica:**
- Una voz menos expresiva, que es uno de los tres pilares de un canal sin rostro.
- Imágenes menos coherentes entre sí y con más "aspecto IA".
- Menos pasadas de reescritura del guion.

**Qué no se recorta en ninguna configuración:** el modelo de la verificación, porque es la defensa legal del canal.

---

## 3. Preguntas abiertas

★ = necesaria antes de proponer la arquitectura.

**Dinero y cuentas**
1. ★ ¿Cuál es el presupuesto mensual en USD? ¿Y cuál es el tope para la fase cero?
2. ★ ¿Existe un medio de pago en USD para proveedores extranjeros? ¿El titular adulto acepta ser titular de las cuentas de Google Cloud, Anthropic, voz e imágenes?
3. ★ La "gran cantidad de uso de IA" para la fase cero, ¿son créditos de API o un plan de suscripción? La app de escritorio solo puede usar claves de API.

**Canal y contenido**
4. ★ ¿Cuál es la lista de canales de referencia? ¿Cuáles pesan más? ¿Se mezclan canales en español y en inglés?
5. ¿Qué nombre y qué concepto tiene el canal?
6. ★ ¿Qué temas o personas se excluyen? La propuesta por defecto está en el mensaje de la sesión.
7. ¿Qué política se sigue para declarar la IA, en el campo `containsSyntheticMedia` y en la descripción?

**Identidad**
8. ¿Dónde está la identidad visual compartida (VT Asvent), si debe tenerse en cuenta?
9. ¿Qué rasgos debe tener la voz? Se propone una escucha a ciegas de 4–5 candidatas.
10. ¿El manual de escritura existente puede servir de molde para el manual de video?
11. ¿En qué idioma se redacta el manual? Propuesta: en español, con todas las reglas de voz y los ejemplos en inglés.

**Operación**
12. ¿La interfaz va en español?
13. ★ ¿Cuánto tiempo real hay para revisar cada día, y en qué franja horaria?
14. ★ ¿Qué características tiene el PC Windows (CPU, RAM, GPU, disco), está disponible a diario y qué velocidad de subida tiene la conexión?
15. ¿La cuenta del canal ya existe? ¿Está verificada por teléfono? ¿Quién tendrá acceso a las credenciales?
16. ¿Se puede publicar una política de privacidad mínima (necesaria para la auditoría)? Mientras dure la auditoría, la publicación será manual.
17. ¿Los Shorts y TikTok quedan para después de la primera versión?
18. Este repositorio es público. ¿Se hace privado?
