# ATRIL

**Estudio de producción asistida para YouTube** · v2.1.0

ATRIL produce un documental en inglés por día; tú revisas el guion y el video final. **Nada se publica sin tu aprobación.**

Etapas: investigación → guion → verificación → voz → storyboard → medios → retoques (Opus) → animaciones (Opus) → metadatos → montaje → publicación.

App de escritorio para Windows (Tauri 2 + React).

## Descargar

En *Releases*:

- `ATRIL_2.1.0_instalador_x64.exe`: recomendado.
- `ATRIL_2.1.0_portable_x64.zip`: portátil (descomprime toda la carpeta).
- `ATRIL_2.1.0_x64.msi`: alternativa.

## Principios

- **Identidad en habilidades:** instrucciones del guion, instrucciones visuales y referentes los escribes tú.
- **Rigor:** cada afirmación lleva su fuente y su cita; las marcas rojas bloquean la aprobación.
- **Recuperable:** cada etapa guarda su resultado y se reanuda donde quedó.
- **Sin fallos silenciosos:** todo error se explica y queda en Diagnóstico.
- **Material libre:** solo licencias aptas para monetizar, con su origen registrado.

## Estructura

```
src-tauri/src/   núcleo Rust: SQLite, archivos, HTTP, procesos, credenciales, OAuth
src/lib/         datos, ajustes, habilidades, consumo, actividad
src/providers/   Claude Code, voz, YouTube, ffmpeg
src/media/       fuentes libres, biblioteca, visión
src/motion/      motor de animaciones (navegador sin ventana)
src/pipeline/    etapas, orquestador, montaje, prompts
src/pages/       interfaz
e2e/             prueba completa con Node (Claude, ffmpeg y Chromium reales)
```

## Desarrollo

```bash
npm install
npm test
npx tauri dev
```
