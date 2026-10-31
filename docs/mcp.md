# ATRIL desde Claude (MCP)

*Versión 2.5.13. Para Diego y para cualquier chat de Claude que vaya a usar ATRIL.*

ATRIL incluye un **servidor MCP** (Model Context Protocol, el estándar con el que Claude usa herramientas externas). Con él, **cualquier chat nuevo de Claude** puede usar ATRIL:
- crear videos y seguir su producción;
- manejar la cola y las campañas;
- buscar material con licencia libre e importar archivos;
- ordenar la biblioteca.

---

## 1. Conectar (una sola vez)

**Requisitos:**
- ATRIL abierto en el equipo.
- Ajustes → **Claude (MCP)** → «Permitir que Claude use ATRIL» activado (viene activado).

| Cliente | Cómo | Notas |
|---|---|---|
| **Claude Desktop** (también Cowork) | Ajustes → Claude (MCP) → **Instalar**. ATRIL crea `ATRIL.mcpb` en Descargas y lo abre; Claude pregunta si instalar la extensión. | Si no se abre solo, arrastra el archivo a Claude → Configuración → Extensiones. Usa el Node que trae Claude: no hay que instalar nada más. |
| **Claude Code** | Ajustes → Claude (MCP) → **Añadir**. Queda para todos tus proyectos. | También puedes copiar el comando (`claude mcp add --scope user --transport http atril …`). En un chat, `/mcp` lo muestra conectado. |
| **Otros clientes MCP** | Ajustes → Claude (MCP) → **Copiar** la configuración JSON por stdio. | Necesitan Node instalado. |

**Si ATRIL está cerrado:**
- Claude Desktop **lo abre solo** al primer uso y espera hasta 60 s.
- Con Claude Code, ábrelo tú.

**claude.ai en el navegador o en el celular** no puede conectarse: esos chats solo usan servidores accesibles por internet, y ATRIL escucha únicamente en tu equipo.

---

## 2. Qué puede hacer Claude

| Herramienta | Para qué |
|---|---|
| `atril_status` | Versión, canal, proveedores configurados, cola, video en producción, biblioteca, disco y trabajos en segundo plano. |
| `atril_guide` | La guía para pedir buenos videos: estética, efectos, piezas, duración, modos, tipografías, voces, formato JSON, lista de control. |
| `atril_show` | Trae ATRIL al frente en una pantalla o un video. |
| `video_create` | Crea un video personal o del canal y lo produce ya, o lo deja en la cola o en una campaña. Acepta título, de qué trata, público, estética, colores, tipografía, guion, duración en segundos, idioma, voz, archivos, recursos, portadas y textos para publicar. |
| `video_list` / `video_get` | Videos con su estado; detalle de pasos, archivos, textos, plan de duración, guion, actividad y mejoras. |
| `video_action` | Continuar, cancelar, rehacer desde un paso o un segmento de voz, pedir cambios (mejora continua), aceptar sin publicar, rechazar, descargar, recortar para TikTok y borrar (con `confirm`). |
| `queue_list` / `queue_add` / `queue_action` | Ver la cola. Añadir tarjetas, una o muchas, sueltas o de campaña, o el JSON de «Importar». Iniciar, pausar o detener por plataforma; reintentar, omitir, quitar o mover tarjetas. |
| `campaign` | Listar, crear, editar la plantilla y borrar campañas. |
| `library_overview` | Salud de la biblioteca: por tipo y biblioteca, sin describir, no utilizables, nunca usados, duplicados, archivos perdidos y fuentes. |
| `library_list` | Buscar y filtrar: por significado (`q`), tipo, estado, forma, calidad, fuente y orden. |
| `library_update` | Editar muchos a la vez: título, descripción, etiquetas, favorito, «no usar» y, solo en archivos propios, la biblioteca. |
| `library_delete` | Borrar, con `confirm`; protege lo que ya se usó en videos. |
| `library_search_web` | Buscar material con licencia libre: Pexels, Pixabay, Wikimedia, Openverse, Freesound, NASA y The Met. |
| `library_import` | Añadir archivos o carpetas, resultados de la búsqueda o enlaces directos con su licencia. Detecta efecto o música, evita duplicados por contenido y describe con la visión de Claude en segundo plano. |
| `library_organize` | Ordenar: primero muestra el plan (duplicados exactos, archivos perdidos, etiquetas desordenadas, descripciones pendientes) y luego lo aplica con `apply`. Con `catalog` crea el catálogo `.md`. |
| `topics` | Temas del canal: listar, proponer (Claude investiga en segundo plano), aprobar, rechazar y borrar. |
| `instructions` | Tus instrucciones del canal: listar, leer, editar (quedan versiones) y crear. |

**Atajos listos** (en Claude Desktop, menú «+» → ATRIL):
- **Video para una exposición**
- **Llenar la biblioteca**
- **Ordenar la biblioteca**

---

## 3. Ejemplos de pedidos

- «Entra a ATRIL y haz un video de 3 minutos para mi exposición de Biología sobre la fotosíntesis. Fondo blanco, acento verde, tipografía Poppins, transiciones suaves, diagramas animados del cloroplasto. Usa mis diapositivas de `C:\Users\…\fotosintesis.pptx`.»
  - Claude lee la guía, propone la estética y el guion y crea el video. Luego te avisa cuando está en revisión final.
- «Llena mi biblioteca con efectos de sonido típicos de YouTube (whoosh, pop, risers, clics, transiciones) y música lo-fi para fondo.»
  - Claude busca en las fuentes con licencia libre y lo importa ya descrito.
  - Si además descarga algo con el navegador desde sitios con licencia clara, lo importa indicando el sitio y la licencia.
- «Ordena mi biblioteca.»
  - Claude revisa el estado, te muestra el plan (duplicados, archivos perdidos, etiquetas, descripciones pendientes), lo aplica con tu visto bueno y te propone qué marcar como «no usar».
- «Crea una campaña de TikTok "Frame · lanzamiento" con estética oscura y voz Kore, y añade estos 10 guiones como tarjetas; luego inicia la cola de TikTok.»
- «¿Qué videos están esperando mi revisión? Acepta el de Frame y recorta el de Harvard para TikTok.»

---

## 4. Seguridad y límites

- **Solo este equipo:** el servidor escucha en `127.0.0.1`. Exige el token de tu instalación, rechaza páginas web (cabecera `Origin`) y nombres de host ajenos (DNS rebinding). Ajustes → Claude (MCP) → **Cambiar token** invalida las conexiones anteriores.
- **Publicar en YouTube nunca** se hace desde Claude: solo tú, en la revisión final de ATRIL. Por MCP se puede aceptar (guardar sin publicar) o rechazar.
- **Borrar** (videos, recursos) y **aplicar el orden de la biblioteca** piden confirmación explícita.
- **Material con derechos de autor:** las canciones de moda y los clips de terceros provocan reclamos en videos monetizados. Para eso está la búsqueda en fuentes con licencia libre.
- **Lo largo corre en segundo plano:** producir un video tarda de 5 a 60 min; describir, proponer temas o recortar, unos minutos. `atril_status` y `video_get` muestran el avance.
- Lo último que hizo Claude aparece en Ajustes → Claude (MCP).

---

## 5. Si algo falla

| Síntoma | Qué hacer |
|---|---|
| Claude dice «ATRIL no está disponible» | Abre ATRIL y revisa que el interruptor de Ajustes → Claude (MCP) esté activado. |
| «ATRIL rechazó el token» | Cambiaste el token: vuelve a pulsar **Instalar** (Claude Desktop) o **Añadir** (Claude Code). |
| Claude Code no lo ve | Pulsa **Añadir** otra vez y abre un chat nuevo; `claude mcp list` debe mostrar `atril`. |
| El puerto cambió (otro programa usaba el 47821) | Claude Desktop lo sigue solo. En Claude Code, pulsa **Añadir** de nuevo. |

---

## 6. Para desarrolladores

**Arquitectura:**
- `src-tauri/src/mcp.rs`: HTTP en `127.0.0.1`. Reenvía cada mensaje a la interfaz por el evento `mcp-request` y recibe la respuesta por `mcp_reply`.
- `src/mcp/protocol.ts`: despachador sin estado. Habla los dos protocolos: `initialize` (2024-11-05 a 2025-11-25) y `server/discover` con versión por petición (2026-07-28).
- `src/mcp/tools.ts`: las herramientas, sobre las mismas funciones que usa la interfaz.
- `src/mcp/bridge.cjs`: puente stdio para Claude Desktop, sin dependencias.
- `src/mcp/host.ts`: arranque, `mcp.json`, `.mcpb` y Claude Code.

**Pruebas:**
- `src/mcp/*.test.ts`: protocolo, herramientas sobre una base real y puente.
- `e2e/mcp-claude.e2e.ts`: un Claude real usando ATRIL por el puente y por HTTP.
