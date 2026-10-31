# ATRIL · instrucciones para Claude Code

App de escritorio (Tauri 2 + React 19 + TypeScript) que produce videos de YouTube. Interfaz y textos al usuario en español; prompts internos en inglés.

## Bitácora (al final de cada respuesta con cambios)
Cuando una respuesta cambie algo (código, documentos, versión), deja una síntesis breve:
- **Con el MCP de Obsidian disponible**: crea una nota en la bóveda, en `ATRIL/Bitácora/`, llamada `AAAA-MM-DD HHmm - <tema>.md` (hora de Lima, UTC−5).
- **Sin el MCP** (por ejemplo, en una sesión en la nube): escribe la misma nota en `docs/bitacora/` y súbela con el commit.
- **Contenido** (≤ 25 líneas):
  - fecha y hora;
  - qué pidió el usuario, en una línea;
  - qué cambió y por qué (archivos clave);
  - versión;
  - qué queda pendiente;
  - qué se verificó y qué no.
- **Ahorro de tokens**: no abras notas viejas enteras «por contexto». Búscalas por nombre o por etiqueta y lee solo la que haga falta.

## Convenciones
- **Versión**: se sube el tercer dígito en `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` y `README.md`. Las notas van en `docs/RELEASE_NOTES.md`.
- **Publicar**: un commit con `[release]` en el mensaje dispara la compilación y el release.
- **Antes de subir**: `npx tsc --noEmit`, `npx vitest run` y `npm run build`. Si cambia Rust, también `cargo check`.
- **Piezas de animación**:
  - Viven en `src-tauri/resources/motion/pieces.js`, entre las marcas `@piece id` y `@end`.
  - Su ficha está en `src/motion/pieces.ts`.
  - Las vistas previas (`public/piezas/`) se regeneran con `FULL=1 npx vitest run -c vitest.e2e.config.ts e2e/piezas.e2e.ts`.
- **Llamadas de ATRIL a Claude**: no cargan `CLAUDE.md`, skills globales ni MCP, para gastar menos tokens. Esta guía es solo para quien desarrolla.
- **Servidor MCP de ATRIL** (para que otros chats de Claude usen la app): herramientas en `src/mcp/tools.ts`, protocolo en `src/mcp/protocol.ts`, servidor HTTP en `src-tauri/src/mcp.rs`, puente de Claude Desktop en `src/mcp/bridge.cjs`. Una función nueva de la app que sirva desde un chat debe tener su herramienta (respuesta compacta, sin publicar nada). Guía: `docs/mcp.md`.
- **Estética**: la de la familia VT Asvent (Frame y Wire; reglas en la bóveda, `VT Asvent/Frame/Técnico/Estilo visual.md`). Solo Poppins; tokens HSL en `src/styles/index.css`; el color de la app va por `data-accent` y cada acento debe pasar `src/ui/theme.test.ts` (contraste AA). Nada de colores sueltos, mayúsculas sostenidas, degradados ni brillos; botones sólido, fantasma (`btn-brand`), gris (cancelar y lo que abre un borrado) y rojo solo para la confirmación final.
- **Nunca se publica un video sin aprobación explícita del usuario.**
