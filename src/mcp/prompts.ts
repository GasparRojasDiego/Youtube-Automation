// Instrucciones del servidor (las lee el modelo al conectarse) y atajos listos para el usuario (prompts
// MCP: en Claude Desktop aparecen en el menú «+»). Breves: cuentan en el contexto de cada chat.
import type { PromptDef } from "./protocol";

export const INSTRUCTIONS = `ATRIL is the user's desktop video studio (VT Asvent). It produces complete videos (research, script, voice, storyboard, media, animations, edit) and keeps a reusable media library.
- Start with atril_status. Before writing an aesthetic, read atril_guide topics aesthetics and effects (and pieces for 16:9 videos).
- video_create returns at once; production takes 5–60 min. Follow it with video_get; tell the user it will be waiting for their final review in ATRIL.
- Never claim a video was published: publishing to YouTube is only done by the user inside ATRIL. Personal videos are never uploaded (they end in Downloads).
- For material in monetized videos prefer free-license sources (library_search_web + library_import). Files you download yourself go in with library_import plus their origin and license.
- Destructive actions (video delete, library_delete, library_organize apply) need the user's explicit request; show the plan first.
- Answer the user in their language (usually Spanish).`;

export const PROMPTS: PromptDef[] = [
  {
    name: "video_exposicion", title: "Video para una exposición",
    description: "Crea en ATRIL un video para una exposición o clase, con estética, transiciones y formato a tu medida.",
    arguments: [
      { name: "tema", description: "Tema de la exposición", required: true },
      { name: "duracion", description: "Duración (p. ej. 3 min o 45 s)" },
      { name: "formato", description: "youtube (horizontal) o tiktok (vertical)" },
      { name: "estilo", description: "Cómo quieres que se vea (colores, ritmo, transiciones…)" },
      { name: "archivos", description: "Rutas de tus diapositivas, imágenes o documentos" },
    ],
    render: (a) => `Quiero un video para mi exposición sobre «${a.tema}»${a.duracion ? `, de ${a.duracion}` : ""}${a.formato ? `, formato ${a.formato}` : ""}.${a.estilo ? ` Estilo: ${a.estilo}.` : ""}${a.archivos ? ` Usa estos archivos como material principal: ${a.archivos}.` : ""}
Hazlo con ATRIL:
1. atril_status y atril_guide (aesthetics, effects${a.formato === "tiktok" ? "" : ", pieces"}).
2. Propónme título, de qué trata, público, guion (o deja que ATRIL lo escriba) y una estética detallada (fondo, colores con código, tipografía de la lista, ritmo, transiciones y animaciones citadas por su nombre, subtítulos y música). Espera mi visto bueno.
3. Crea el video con video_create (mode personal) y muéstramelo en ATRIL.
4. Sigue el avance con video_get y avísame cuando esté en revisión final.`,
  },
  {
    name: "llenar_biblioteca", title: "Llenar la biblioteca",
    description: "Busca y añade a ATRIL videos, música y efectos de sonido con licencia libre, ya descritos y listos para usar.",
    arguments: [
      { name: "que", description: "Qué material (p. ej. «efectos de transición, whoosh y pops», «música lo-fi para estudiar», «clips de ciudades de noche»)", required: true },
      { name: "cantidad", description: "Cuántos elementos aproximadamente" },
    ],
    render: (a) => `Llena mi biblioteca de ATRIL con: ${a.que}${a.cantidad ? ` (unos ${a.cantidad})` : ""}.
1. Busca con library_search_web (consultas en inglés; kind image, video, sfx o music) varias veces con términos distintos y elige lo de mejor calidad y licencia más libre.
2. Impórtalo con library_import candidates=[…] (scope auto).
3. Si además descargas material de sitios con licencia clara (p. ej. Pixabay o Mixkit) con el navegador, impórtalo con library_import paths=[…] y license con el sitio y la licencia. No uses canciones con derechos de autor: en un video monetizado provocan reclamos.
4. Termina con library_overview y dime qué se añadió.`,
  },
  {
    name: "ordenar_biblioteca", title: "Ordenar la biblioteca",
    description: "Revisa la biblioteca de ATRIL: duplicados, archivos perdidos, etiquetas, descripciones pendientes y lo que no sirve.",
    render: () => `Ordena mi biblioteca de ATRIL:
1. library_overview.
2. library_organize sin apply para ver el plan (duplicados, archivos perdidos, etiquetas, descripciones pendientes) y muéstramelo.
3. Con mi visto bueno, library_organize apply:true.
4. Revisa con library_list (status unusable, unused, min_quality) lo que conviene marcar como no usable o favorito y propónmelo antes de cambiarlo con library_update.`,
  },
];
