# ATRIL 2.5.13

Claude puede usar ATRIL. Cualquier chat nuevo de Claude Desktop o Claude Code puede crear videos, manejar la cola y las campañas, llenar la biblioteca con material libre y ordenarla. La 2.5.13 trae todo lo de la 2.5.12 más cinco correcciones que salieron de probar, una por una, todas las acciones del MCP.

## Descargar
- **`ATRIL_2.5.13_instalador_x64.exe`** (recomendado). Desde la 2.5.1 o posterior, pulsa el botón de descarga junto a tu perfil.
- `ATRIL_2.5.13_portable_x64.zip` (versión portátil).
- `SHA256SUMS.txt`, con las huellas para comprobar cada descarga.

## Correcciones de la 2.5.13
- **Rechazar o borrar desde Claude un video que se está produciendo** lo detiene al instante. Antes terminaba el paso en curso, que puede durar varios minutos y seguir gastando en Claude o en la voz.
- **Búsqueda por significado en la biblioteca, por páginas:** la segunda página ya no repite la primera. Solo afectaba a Claude; la pantalla Biblioteca no usa páginas.
- **Actividad de un video:** cada línea trae su hora. Antes llegaba vacía.
- **Temas:** aprobar, rechazar o borrar un tema que no existe avisa del error. Antes respondía que estaba hecho.
- **Borrar de la biblioteca:** informa qué identificadores no existían.

## Lo que trajo la 2.5.12

### ATRIL desde Claude (MCP)
- **Ajustes → Claude (MCP):**
  - **Claude Desktop:** «Instalar» crea la extensión `ATRIL.mcpb` y la abre en Claude, que pregunta si instalarla. Usa el Node que trae Claude.
  - **Claude Code:** «Añadir» la registra para todos tus proyectos.
  - **Otros clientes:** configuración JSON para copiar.
- **20 herramientas:**
  - **Videos:** crear (personal o del canal, con estética, colores, tipografía, guion, duración, voz, archivos y portadas), ver, continuar, rehacer, pedir cambios, aceptar sin publicar, rechazar, descargar y recortar para TikTok.
  - **Cola y campañas:** añadir tarjetas sueltas o de campaña (también el JSON de «Importar»), editar plantillas, iniciar, pausar o detener por plataforma.
  - **Biblioteca:**
    - buscar en fuentes con licencia libre e importar archivos, carpetas o enlaces, con la licencia de cada uno;
    - editar muchos recursos a la vez;
    - borrar con confirmación;
    - ordenar: primero muestra el plan y luego lo aplica.
  - **Además:** estado, guía para pedir buenos videos, temas del canal y tus instrucciones.
- **3 atajos en Claude Desktop:** «Video para una exposición», «Llenar la biblioteca», «Ordenar la biblioteca».
- **Si ATRIL está cerrado**, Claude Desktop lo abre solo.
- Ajustes muestra **lo último que hizo Claude**.
- **Seguridad:**
  - solo escucha en este equipo (127.0.0.1);
  - exige el token de tu instalación y rechaza páginas web y nombres de host ajenos;
  - publicar en YouTube sigue siendo solo tuyo;
  - borrar y aplicar el orden de la biblioteca piden confirmación.
- **Compatible** con los dos protocolos de MCP que conviven hoy: el clásico con saludo inicial (revisiones 2024-11-05 a 2025-11-25) y la revisión 2026-07-28, sin saludo y con `server/discover`.
- Guía completa: `docs/mcp.md`.

### Biblioteca: duplicados de verdad
- Cada recurso tiene una **huella de su contenido** (tamaño y comienzo y final del archivo). Antes era la ruta del archivo.
- Importar el mismo archivo con otro nombre, desde otra carpeta o bajado de dos sitios ya no crea una copia.
- «Ordenar» encuentra y quita los duplicados que ya existían; nunca quita las copias usadas en videos.

### Algoritmo de Musk sobre el código
- **Borrado:**
  - 5 funciones que nada usaba;
  - 4 dependencias que solo sirvieron para copiar archivos ya incluidos en la app (`d3`, `gsap`, `topojson-client`, `world-atlas`), con lo que la instalación de desarrollo baja en 42 paquetes;
  - una copia vieja de la política de privacidad.
- **Más rápido:** la app arranca con un paquete de 600 KB en vez de 958 KB (−37 %). Ajustes, Biblioteca, Producción, Instrucciones, Videos y el servidor MCP se cargan al usarlos.

## Verificado
- TypeScript, compilación y `cargo check`.
- 147 pruebas: 143 de la interfaz y 4 de Rust (servidor MCP y huella).
- **Todas las acciones del MCP:** una prueba nueva recorre las que faltaban: continuar, rehacer, pedir cambios, rechazar, descargar, recortar, mover y reintentar en la cola, pausar y detener, campañas, todos los filtros de la biblioteca, catálogo, temas e instrucciones. Cada una responde con datos o con un aviso claro, sin errores internos.
- **Prueba con Claude real** (hecha con la 2.5.12; las herramientas son las mismas), con Claude Code en modo automático sobre una copia de la base de prueba:
  - **Por el puente de Claude Desktop:** consultó el estado, creó una tarjeta de TikTok de 20–30 s sin producirla y revisó cómo ordenar la biblioteca. Respondió con el canal, el id de la tarjeta y el plan.
  - **Por HTTP, como Claude Code:** listó los videos con su estado.
  - La producción de videos se simuló (ya está probada aparte).
- Pantalla de Ajustes revisada en un navegador.

## Sin verificar
- La app instalada en Windows con Claude Desktop real: ni la extensión `.mcpb` instalada ni la apertura automática de ATRIL. Las prueba la compilación del release y lo prueba el uso real.
- El puente entre Rust y la interfaz dentro de la app. Cada lado está probado por separado y la compilación de Windows lo comprueba.
