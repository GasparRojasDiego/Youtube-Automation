# ATRIL

**Estudio de producción asistida para YouTube** · v2.5.2

ATRIL produce un video en inglés a partir de tu idea, sin pedirte nada por el camino; tú revisas el video final. **Nada se publica sin tu aprobación.**

Etapas: investigación → guion → revisión de datos (se corrige sola) → voz → storyboard → medios (libres + imágenes con IA) → retoques (Opus) → animaciones (Opus + kit de motion) → metadatos → montaje → revisión final → publicación.

App de escritorio para Windows (Tauri 2 + React).

## Descargar

En *Releases*:

- `ATRIL_2.5.2_instalador_x64.exe`: recomendado.
- `ATRIL_2.5.2_portable_x64.zip`: portátil (descomprime toda la carpeta).
- `SHA256SUMS.txt`: huellas para comprobar las descargas (ver `SECURITY.md`).

## Principios

- **Identidad en tus instrucciones:** las directrices de contenido y las visuales las escribes tú (plantillas en `docs/habilidades/`).
- **Calidad sin frenos:** lo dudoso se corrige solo; solo se detiene en la revisión final.
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
