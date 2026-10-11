// Catálogo de piezas listas (resources/motion/pieces.js): qué hace cada una, cuándo usarla,
// sus opciones y los datos de su vista previa. El código de cada pieza se lee del propio
// pieces.js (entre «@piece id» y «@end»), así la app muestra y entrega exactamente lo que corre.
import piecesJs from "../../src-tauri/resources/motion/pieces.js?raw";

export type PieceGroup = "Apertura y estructura" | "Cifras y datos" | "Tiempo y lugar" | "Relaciones y procesos" | "Texto y evidencia" | "Con imágenes" | "Sobre el video";

export interface PieceMeta {
  id: string;
  name: string;               // nombre en español (interfaz)
  group: PieceGroup;
  kind: "fullscreen" | "overlay";
  dur: number;                // duración por defecto (s)
  libs?: ("map" | "d3")[];
  desc: string;               // qué se ve (español)
  use: string;                // cuándo usarla (español)
  en: string;                 // una línea en inglés para el catálogo del prompt
  opts: string;               // opciones (firma) en inglés
  demo: Record<string, unknown>;
  icons?: string[];           // íconos que usa la vista previa
  images?: string[];          // imágenes que usa la vista previa (claves img1, img2…)
}

export const PIECES: PieceMeta[] = [
  // ---------- Apertura y estructura ----------
  { id: "title", name: "Título de apertura", group: "Apertura y estructura", kind: "fullscreen", dur: 5,
    desc: "Una línea de acento se abre, el título sube palabra por palabra a través de máscaras y la bajada aparece desenfocándose. El interletrado del título se abre muy despacio todo el tiempo.",
    use: "Abrir el video o una sección con su tesis en pocas palabras.",
    en: "opening title: accent rule opens, 1–2 line title rises word by word through masks, optional kicker and subtitle",
    opts: "{title, highlight?, kicker?, sub?, align?:'center'|'left', size?}",
    demo: { title: "El precio oculto del café", highlight: "oculto", sub: "Quién gana con cada taza que compras" } },
  { id: "chapter", name: "Separador de capítulo", group: "Apertura y estructura", kind: "fullscreen", dur: 5,
    desc: "Un número enorme se dibuja en contorno y se llena de color desde abajo; la cámara se aleja, se traza una línea vertical y el título del capítulo sube a su derecha.",
    use: "Marcar el inicio de cada parte o capítulo.",
    en: "chapter break: huge outlined number fills from the bottom, camera pulls back, vertical rule, chapter title rises",
    opts: "{n:'02', title, kicker?}",
    demo: { n: "02", kicker: "Capítulo", title: "La ruta del dinero" } },
  { id: "question", name: "Pregunta gancho", group: "Apertura y estructura", kind: "fullscreen", dur: 5,
    desc: "Un punto crece y se convierte en un «?» gigante que gira en 3D al fondo; la pregunta entra por palabras y un resaltador barre la palabra clave.",
    use: "Plantear la pregunta que el video va a responder (gancho, giro, misterio).",
    en: "hook question: a dot grows into a giant rotating '?', question rises word by word, highlighter sweeps the key word",
    opts: "{text, highlight?}",
    demo: { text: "¿Por qué nadie lo vio venir?", highlight: "nadie" } },

  // ---------- Cifras y datos ----------
  { id: "stat", name: "Cifra protagonista", group: "Cifras y datos", kind: "fullscreen", dur: 5,
    desc: "Un punto estalla en ondas, un anillo con marcas se traza alrededor y la cifra cuenta hasta su valor exacto; debajo, la etiqueta y una nota.",
    use: "Una sola cifra que la narración subraya (cantidades, dinero, récords).",
    en: "hero number: dot bursts into ripples, tick ring draws around, number counts to its exact value, label + note",
    opts: "{value, prefix?, suffix?, decimals?, label, note?}",
    demo: { value: 2.4, prefix: "$", suffix: " mil M", label: "Ganancias en 2023", note: "Más que el PIB de 40 países" } },
  { id: "bars", name: "Barras comparativas", group: "Cifras y datos", kind: "fullscreen", dur: 6,
    desc: "Barras horizontales que crecen con su cifra; al final las demás se atenúan, la destacada se ilumina y la cámara se acerca a ella.",
    use: "Comparar de 2 a 6 cantidades (países, empresas, años).",
    en: "horizontal comparison bars (2–6): bars grow with counters, others dim, highlighted bar glows, camera pushes in",
    opts: "{items:[{label, value}], highlight?, prefix?, suffix?, title?}",
    demo: { title: "Precio por kilo", prefix: "$", items: [{ label: "Productor", value: 1.2 }, { label: "Exportador", value: 3.8 }, { label: "Tostador", value: 9.5 }, { label: "Cafetería", value: 38 }] } },
  { id: "units", name: "N de cada M", group: "Cifras y datos", kind: "fullscreen", dur: 5,
    desc: "Una rejilla de puntos aparece en ola y se van encendiendo N mientras la cifra cuenta; los encendidos laten una vez al final.",
    use: "Proporciones fáciles de imaginar: «27 de cada 100», «1 de cada 8».",
    en: "unit chart: grid of M dots appears in a wave, N light up while the number counts",
    opts: "{n, of?:100, label}",
    demo: { n: 27, of: 100, label: "familias cafeteras viven bajo la línea de pobreza" } },
  { id: "ring", name: "Porcentaje en anillo", group: "Cifras y datos", kind: "fullscreen", dur: 5,
    desc: "Un anillo grueso se llena con una cabeza luminosa mientras el porcentaje cuenta; a la derecha, la etiqueta sube por palabras y una nota la completa.",
    use: "Un porcentaje con contexto.",
    en: "percentage ring: thick ring fills with a bright head while % counts; label and note on the right",
    opts: "{pct, label, note?}",
    demo: { pct: 68, label: "del precio se queda en el último eslabón", note: "Según la cadena de valor estimada" } },
  { id: "trend", name: "Tendencia", group: "Cifras y datos", kind: "fullscreen", dur: 6,
    desc: "La curva se traza con una cabeza luminosa y una etiqueta que cuenta; la cámara la sigue de cerca y al final se aleja para mostrar la curva entera.",
    use: "Una evolución en el tiempo (precios, población, temperatura).",
    en: "trend line: curve draws with a glowing head and live value badge, camera follows it then pulls back to show the whole chart",
    opts: "{points:[{x:'2000', v:12}], prefix?, suffix?, unit?}",
    demo: { unit: "USD/lb", prefix: "$", points: [{ x: "2000", v: 0.6 }, { x: "2005", v: 1.1 }, { x: "2010", v: 1.9 }, { x: "2015", v: 1.3 }, { x: "2020", v: 1.1 }, { x: "2024", v: 3.4 }] } },
  { id: "donut", name: "Partes de un todo", group: "Cifras y datos", kind: "fullscreen", dur: 6,
    desc: "Los segmentos de una dona se trazan uno tras otro mientras el centro cuenta el porcentaje destacado; la leyenda nombra cada parte y al final el segmento destacado se separa un poco.",
    use: "Repartos: de qué se compone un precio, un presupuesto, una población (2 a 6 partes).",
    en: "donut breakdown (2–6 parts): segments draw in sequence, centre counts the highlighted %, legend on the right, highlighted slice pops out",
    opts: "{parts:[{label, value}], highlight?}",
    demo: { parts: [{ label: "Cafetería", value: 68 }, { label: "Tostador", value: 17 }, { label: "Exportador", value: 9 }, { label: "Productor", value: 6 }] } },
  { id: "ranking", name: "Ranking", group: "Cifras y datos", kind: "fullscreen", dur: 6,
    desc: "Las filas entran del último puesto al primero; el n.º 1 llega con el color de acento y un pequeño temblor, las demás se atenúan y la cámara se le acerca.",
    use: "Listas ordenadas: los mayores productores, los casos más graves, un top 5.",
    en: "countdown ranking (2–6 rows): rows slide in from last to first, #1 lands in accent with a small shake, others dim, camera pushes in",
    opts: "{items:['A', …] | [{label, value}], title?}",
    demo: { title: "Mayores productores", items: [{ label: "Brasil", value: "37 %" }, { label: "Vietnam", value: "17 %" }, { label: "Colombia", value: "8 %" }, { label: "Indonesia", value: "7 %" }, { label: "Etiopía", value: "5 %" }] } },
  { id: "scale", name: "Escala real", group: "Cifras y datos", kind: "fullscreen", dur: 6,
    desc: "Se ve un círculo pequeño muy de cerca; la cámara se aleja mientras crece desde él uno grande con el área proporcional, y aparece «×N» contando.",
    use: "Diferencias de tamaño difíciles de imaginar (una persona frente a una empresa, un país frente a otro).",
    en: "true-scale comparison: tiny circle seen up close, camera pulls back while a big circle (area-proportional) grows from it, '×N' counts up",
    opts: "{a:{label, value}, b:{label, value}, ratioLabel?}",
    demo: { a: { label: "Lo que gana el productor", value: 1 }, b: { label: "Lo que paga el cliente", value: 32 }, ratioLabel: "veces más" } },

  { id: "timeline", name: "Línea de tiempo", group: "Tiempo y lugar", kind: "fullscreen", dur: 8,
    desc: "La cámara viaja de un hito al siguiente sobre una línea que se va llenando; cada año sube por letras y su punto se enciende. Al final se aleja para ver la historia entera.",
    use: "Secuencias de fechas: orígenes, escaladas, antes y después (2 a 7 hitos).",
    en: "timeline (2–7 events): camera travels event to event along a filling line, years rise letter by letter, then pulls back to show the whole story",
    opts: "{events:[{year, label}]}",
    demo: { events: [{ year: "1720", label: "Llega a América" }, { year: "1850", label: "Plantaciones a gran escala" }, { year: "1962", label: "Primer acuerdo de cuotas" }, { year: "2001", label: "Crisis de precios" }] } },
  { id: "year", name: "Salto temporal", group: "Tiempo y lugar", kind: "fullscreen", dur: 4,
    desc: "Los dígitos del año giran como un odómetro con desenfoque de movimiento y estelas que cruzan el cuadro; el año final aterriza con un golpe y una línea de acento.",
    use: "Saltos en el tiempo: «treinta años después», volver al pasado.",
    en: "time jump: year digits spin like an odometer with motion blur and streaks, final year lands with a hit and an accent rule",
    opts: "{from:'1989', to:'2024', label?}",
    demo: { from: "1989", to: "2024", label: "Treinta y cinco años después" } },
  { id: "map", name: "Ubicación en el mapa", group: "Tiempo y lugar", kind: "fullscreen", dur: 6, libs: ["map"],
    desc: "El contorno del mundo se dibuja, el país se ilumina, la cámara vuela hasta él, cae un pin y aparecen el nombre y las coordenadas descifrándose.",
    use: "Situar la historia: dónde ocurrió, de dónde viene algo.",
    en: "map location (needs libs map): world outline draws, the country lights up, camera flies to it, pin drops, name + coordinates appear",
    opts: "{country:'Colombia' (English name), label?, lon?, lat?, zoom?}",
    demo: { country: "Colombia", label: "Colombia" } },

  // ---------- Relaciones y procesos ----------
  { id: "process", name: "Proceso en pasos", group: "Relaciones y procesos", kind: "fullscreen", dur: 7,
    desc: "Una curva punteada une los pasos y un pulso de luz la recorre; cada paso se enciende al llegar el pulso, con su ícono (o su número) y su nombre.",
    use: "Cómo funciona algo, en orden (2 a 5 pasos).",
    en: "process (2–5 steps): dotted curve links the steps, a light pulse travels along it and lights each step (icon or number + label)",
    opts: "{steps:[{label, icon?}]}",
    demo: { steps: [{ label: "Cosecha", icon: "leaf" }, { label: "Exportación", icon: "ship" }, { label: "Tostado", icon: "factory" }, { label: "Tu taza", icon: "cup" }] }, icons: ["leaf", "ship", "factory", "cup"] },
  { id: "cause", name: "Causa y efecto", group: "Relaciones y procesos", kind: "fullscreen", dur: 6,
    desc: "Cada causa empuja a la siguiente por una flecha que se dibuja y por la que corre el color; el efecto recibe el golpe. La cámara sigue la cadena y al final se aleja.",
    use: "Consecuencias encadenadas (2 o 3 eslabones).",
    en: "cause → effect chain (2–3): arrows draw and flow, each node takes the hit, camera follows the chain then pulls back",
    opts: "{chain:[{label, icon?}]}",
    demo: { chain: [{ label: "Sequía en Brasil", icon: "warning" }, { label: "Menos cosecha", icon: "leaf" }, { label: "Sube el precio", icon: "coin" }] }, icons: ["warning", "leaf", "coin"] },
  { id: "versus", name: "Versus", group: "Relaciones y procesos", kind: "fullscreen", dur: 5,
    desc: "Dos paneles entran desde los lados y se encuentran en una diagonal; el «VS» cae con un golpe y aparecen el ícono, el nombre y el dato de cada lado. Opcionalmente, el ganador gana espacio.",
    use: "Comparar dos cosas cara a cara.",
    en: "versus: two panels slide in and meet on a diagonal, 'VS' slams with a shake, icon + name + value per side; optional winner side expands",
    opts: "{a:{label, value?, icon?}, b:{label, value?, icon?}, winner?:'a'|'b'}",
    demo: { a: { label: "Comercio justo", value: "$1.80 / lb", icon: "scale" }, b: { label: "Mercado libre", value: "$1.10 / lb", icon: "coin" }, winner: "a" }, icons: ["scale", "coin"] },
  { id: "network", name: "Red de actores", group: "Relaciones y procesos", kind: "fullscreen", dur: 6,
    desc: "El centro aparece, las conexiones se trazan hacia cada actor y paquetes de luz corren por ellas en ambos sentidos; al final se enfoca una relación.",
    use: "Quién se relaciona con quién: flujos de dinero, influencia, proveedores.",
    en: "actor network (3–8 nodes around a centre): links draw, light packets flow both ways, optional focus on one relation",
    opts: "{center:{label, icon?}, nodes:[{label, icon?}], focus?}",
    demo: { center: { label: "Bolsa de Nueva York", icon: "coin" }, nodes: [{ label: "Productores", icon: "leaf" }, { label: "Navieras", icon: "ship" }, { label: "Tostadores", icon: "factory" }, { label: "Cadenas", icon: "store" }, { label: "Consumidores", icon: "person" }], focus: 0 }, icons: ["coin", "leaf", "ship", "factory", "store", "person"] },
  // ---------- Texto y evidencia ----------
  { id: "quote", name: "Cita", group: "Texto y evidencia", kind: "fullscreen", dur: 6,
    desc: "Unas comillas enormes se materializan, la cita aparece palabra por palabra, una frase clave se subraya con el acento y entra la atribución.",
    use: "Citas textuales breves de una persona o un documento.",
    en: "quote: giant quote mark materialises, words appear one by one, key phrase gets an accent underline, attribution enters",
    opts: "{text, author?, role?, highlight?}",
    demo: { text: "Pagamos más por el café que nunca, pero quien lo cultiva cobra lo mismo que hace treinta años.", highlight: "cobra lo mismo", author: "Informe de la cadena de valor", role: "Estimación propia" } },
  { id: "definition", name: "Definición", group: "Texto y evidencia", kind: "fullscreen", dur: 6,
    desc: "La palabra se escribe con un cursor; debajo, la pronunciación y la categoría. Una línea se traza y la definición aparece con su palabra clave resaltada.",
    use: "Explicar un término técnico o una palabra clave del tema.",
    en: "dictionary definition: word typed with a caret, phonetics + part of speech, rule draws, definition fades in with a highlighted key word",
    opts: "{word, phonetic?, kind?, def, highlight?}",
    demo: { word: "Commodity", phonetic: "/kəˈmɒd.ə.ti/", kind: "sustantivo", def: "Materia prima que se compra y se vende sin importar quién la produjo: solo cuenta el precio del mercado.", highlight: "solo cuenta el precio" } },
  { id: "document", name: "Documento o evidencia", group: "Texto y evidencia", kind: "fullscreen", dur: 6,
    desc: "Una hoja genérica entra inclinada y se asienta; la barra de censura se retira de la frase clave, un resaltador la marca, la cámara se acerca y cae un sello.",
    use: "Mostrar lo que dice un informe, una carta o un expediente.",
    en: "document / evidence: generic sheet slides in tilted, a redaction bar peels off the key sentence, highlighter marks it, camera pushes in, optional stamp",
    opts: "{title, highlight, kicker?, date?, stamp?}",
    demo: { kicker: "Informe interno", title: "Precios de compra 2023", date: "14/03/2023", highlight: "El productor recibe menos del 7 % del precio final.", stamp: "Confidencial" } },
  { id: "checklist", name: "Lista que se marca", group: "Texto y evidencia", kind: "fullscreen", dur: 5,
    desc: "Las filas entran y cada casilla se llena y se tilda (o se tacha) una tras otra; la última queda resaltada.",
    use: "Requisitos, pasos cumplidos o descartados, pros o contras (3 a 6).",
    en: "checklist (3–6): rows enter, boxes fill and tick (or cross) one after another, last one highlighted",
    opts: "{items:[…], mode?:'check'|'cross', title?}",
    demo: { title: "Para ser comercio justo", items: ["Precio mínimo garantizado", "Prima para la comunidad", "Sin trabajo infantil", "Contratos a largo plazo"] } },
  { id: "myth", name: "Mito o realidad", group: "Texto y evidencia", kind: "fullscreen", dur: 6,
    desc: "La tarjeta del mito se tacha y falla un instante; gira en 3D y por detrás aparece la realidad con una marca que se dibuja.",
    use: "Desmentir una creencia común.",
    en: "myth vs fact: myth card gets struck through and glitches, flips in 3D to the fact with a drawn check mark",
    opts: "{myth, fact, mythLabel?, factLabel?}",
    demo: { myth: "El café caro paga mejor al productor", fact: "El precio en origen casi no cambia" } },
  { id: "chat", name: "Conversación", group: "Texto y evidencia", kind: "fullscreen", dur: 6,
    desc: "Los mensajes aparecen de dos lados, cada uno precedido por un indicador de escritura; la columna sube cuando se llena.",
    use: "Reconstruir un diálogo, un intercambio de mensajes o una negociación.",
    en: "chat (2–8 messages, two sides): typing indicator before each bubble, column scrolls up when full",
    opts: "{messages:[{from:'a'|'b', text}], a?:'name', b?:'name'}",
    demo: { a: "Comprador", b: "Cooperativa", messages: [{ from: "a", text: "¿A cuánto la libra esta temporada?" }, { from: "b", text: "Lo mismo que el año pasado no nos alcanza." }, { from: "a", text: "Es el precio de la bolsa." }, { from: "b", text: "Entonces no hay trato." }] } },
  { id: "search", name: "Búsqueda", group: "Texto y evidencia", kind: "fullscreen", dur: 6,
    desc: "Una barra de búsqueda genérica escribe la consulta, los resultados aparecen en cascada y un cursor hace clic en el primero.",
    use: "Mostrar lo que la gente busca o cómo se encontró un dato.",
    en: "search: generic search bar types the query, results cascade in, cursor clicks the first",
    opts: "{query, results:[…]}",
    demo: { query: "¿cuánto gana un caficultor?", results: ["Menos de 2 dólares al día en muchas regiones", "La brecha entre origen y taza", "Qué es el precio C del café"] } },
  { id: "headlines", name: "Titulares", group: "Texto y evidencia", kind: "fullscreen", dur: 6,
    desc: "Recortes de prensa genéricos (sin logotipos reales) caen uno sobre otro con profundidad; la cámara recorre la mesa y se marca la frase clave del último.",
    use: "Cuando algo fue noticia en varios medios.",
    en: "headlines (2–4 generic newspaper clippings, no real logos): cards drop onto each other with depth, camera roams, key phrase of the last one highlighted",
    opts: "{items:[{source, headline, date?}], highlight?}",
    demo: { highlight: "mínimo histórico", items: [{ source: "El Diario", date: "2001", headline: "Crisis en el campo cafetero" }, { source: "La Gaceta", date: "2019", headline: "Miles abandonan sus fincas" }, { source: "Noticias", date: "2023", headline: "El precio en origen, en su mínimo histórico" }] } },

  // ---------- Con imágenes ----------
  { id: "photo", name: "Foto con foco", group: "Con imágenes", kind: "fullscreen", dur: 5,
    desc: "La imagen se acerca lentamente a un punto, el resto se oscurece, un anillo rodea el detalle y una línea lo une con su etiqueta.",
    use: "Señalar un detalle en una foto (una persona, un objeto, un lugar).",
    en: "photo focus: slow push toward a point, the rest darkens, a ring circles the detail and a leader line links it to its label",
    opts: "{img:'img1', focus:{x:0..1, y:0..1}, label, kicker?}",
    demo: { img: "img1", focus: { x: 0.36, y: 0.32 }, kicker: "Detalle", label: "La silueta del árbol" }, images: ["img1"] },
  { id: "depth", name: "Texto detrás del sujeto", group: "Con imágenes", kind: "fullscreen", dur: 5,
    desc: "Una palabra enorme sube por detrás de la persona u objeto recortado y queda entre el fondo y el sujeto, con un leve avance de cámara. Sin recorte, queda sobre la foto.",
    use: "Portadas de capítulo o momentos clave con una foto potente (necesita el recorte de rembg).",
    en: "text behind subject (needs 'img_cut'): huge word rises behind the cut-out subject, sits between background and subject, slow push",
    opts: "{img:'img1', text, kicker?, y?, size?, color?}",
    demo: { img: "img1", text: "Origen", kicker: "Capítulo 1" }, images: ["img1"] },
  { id: "compare", name: "Antes y después", group: "Con imágenes", kind: "fullscreen", dur: 5,
    desc: "Una línea divisoria barre la imagen revelando la segunda y vuelve al centro para dejar ambas a la vista, con sus etiquetas.",
    use: "Cambios en el tiempo: un lugar, un producto, una persona.",
    en: "before / after: a divider sweeps across revealing the second image, then settles in the middle; corner labels",
    opts: "{a:'img1', b:'img2', labelA?, labelB?}",
    demo: { a: "img1", b: "img2", labelA: "1990", labelB: "Hoy" }, images: ["img1", "img2"] },

  // ---------- Sobre el video ----------
  { id: "lower", name: "Rótulo de nombre", group: "Sobre el video", kind: "overlay", dur: 5,
    desc: "Una barra de acento crece, el nombre sube por una máscara y el cargo se descifra debajo; al final sale por el mismo camino.",
    use: "Presentar a una persona que aparece o habla.",
    en: "lower third (overlay): accent bar grows, name rises through a mask, role scrambles in; exits the same way",
    opts: "{name, role}",
    demo: { name: "María Quispe", role: "Caficultora · Cusco" } },
  { id: "callout", name: "Señalador", group: "Sobre el video", kind: "overlay", dur: 4,
    desc: "Un anillo se traza sobre un punto del video, late una vez y una línea en codo lo une con su etiqueta.",
    use: "Señalar algo dentro de la toma.",
    en: "callout (overlay): ring draws on a point, pulses once, elbow leader line to a label",
    opts: "{x, y (px), label, r?, side?:'left'|'right'}",
    demo: { x: 700, y: 360, label: "Zona de cultivo" } },
  { id: "source", name: "Fuente", group: "Sobre el video", kind: "overlay", dur: 4,
    desc: "Una etiqueta discreta arriba a la izquierda que se escribe sola.",
    use: "Citar de dónde sale un dato o una imagen.",
    en: "source tag (overlay): small top-left chip that types itself",
    opts: "{text}",
    demo: { text: "Fuente: Organización Internacional del Café, 2023" } },
  { id: "stamp", name: "Sello", group: "Sobre el video", kind: "overlay", dur: 3,
    desc: "Una palabra en un recuadro con textura de tinta cae girando sobre el video, golpea y sacude el cuadro.",
    use: "Veredictos: CONFIRMADO, FALSO, CLASIFICADO, VENDIDO.",
    en: "stamp (overlay): inked boxed word slams down rotating and shakes the frame",
    opts: "{text, color?, x?, y?, rot?}",
    demo: { text: "Confirmado" } },
  { id: "where", name: "Lugar y fecha", group: "Sobre el video", kind: "overlay", dur: 4,
    desc: "Un pin cae, el nombre del lugar sube y la línea inferior (coordenadas o fecha) se descifra.",
    use: "Situar una toma: dónde y cuándo.",
    en: "place tag (overlay): pin drops, place name rises, sub line (coords or date) scrambles in",
    opts: "{place, sub?}",
    demo: { place: "Quillabamba, Perú", sub: "12.86°S  72.69°W" } },
  { id: "figure", name: "Cifra sobre el video", group: "Sobre el video", kind: "overlay", dur: 4,
    desc: "Una ficha arriba a la derecha con un mini anillo que se traza y un número que cuenta, con su etiqueta.",
    use: "Un dato que acompaña a la toma sin taparla.",
    en: "figure chip (overlay): top-right chip, mini ring draws, number counts, label",
    opts: "{value, prefix?, suffix?, label, pct?}",
    demo: { value: 25, suffix: " M", label: "Familias viven del café", pct: 72 } },
];

export const pieceById = (id: string) => PIECES.find((p) => p.id === id) ?? null;

/** Código de una pieza tal como corre (de pieces.js). */
export function pieceSource(id: string, src = piecesJs): string | null {
  const m = src.match(new RegExp(`/\\*@piece ${id}\\*/\\n([\\s\\S]*?)\\n\\s*/\\*@end\\*/`));
  return m ? m[1].replace(/^ {2}/gm, "") : null;
}

/** Composición mínima que usa la pieza tal cual (lo que se muestra como «código» de la vista previa). */
export function pieceUsage(p: PieceMeta, opts: Record<string, unknown> = p.demo): string {
  return `const tl = gsap.timeline();\nP.${p.id}(tl, 0, ${JSON.stringify({ ...opts, dur: p.dur })});\nATRIL.register(tl, ${p.dur});`;
}

/** Catálogo compacto en inglés para el prompt de Motion (una línea por pieza). */
export function pieceCatalog(): string {
  return PIECES.map((p) => `P.${p.id}(tl, at, ${p.opts.replace(/\}$/, ", dur?, enter?, bg?}")}) [${p.kind}${p.libs?.length ? `, libs:${p.libs.join("+")}` : ""}] — ${p.en}`).join("\n");
}
