# ATRIL

**Estudio de producción asistida para YouTube** · v2.5.9

ATRIL produce un video en inglés a partir de tu idea, sin pedirte nada por el camino; tú revisas el video final. **Nada se publica sin tu aprobación.**

Etapas: investigación → guion → revisión de datos (se corrige sola) → voz → storyboard → medios (libres + imágenes con IA) → retoques (Opus) → animaciones (Opus + kit de motion) → metadatos → montaje → revisión final → publicación.

App de escritorio para Windows (Tauri 2 + React).

## Descargar

En *Releases*:

- `ATRIL_2.5.9_instalador_x64.exe`: recomendado.
- `ATRIL_2.5.9_portable_x64.zip`: portátil (descomprime toda la carpeta).
- `SHA256SUMS.txt`: huellas para comprobar las descargas (ver `SECURITY.md`).

## Principios

- **Identidad en tus instrucciones:** las directrices de contenido y las visuales las escribes tú (plantillas en `docs/habilidades/`).
- **Calidad sin frenos:** lo dudoso se corrige solo; solo se detiene en la revisión final.
- **Recuperable:** cada etapa guarda su resultado y se reanuda donde quedó.
- **Sin fallos silenciosos:** todo error avisa al momento y queda en el informe de errores de Ajustes.
- **Rápido:** lo independiente avanza en paralelo (animaciones, búsquedas, visión, voz y segmentos del montaje).
- **Dos modos:** Automatización (canal de YouTube) y Personal (videos a medida con tus archivos, tu guion, duración e idioma, y mejora continua).
- **Material libre:** solo licencias aptas para monetizar, con su origen registrado.
- **Piezas listas:** 35 animaciones universales con vista previa y código (Instrucciones); Claude las usa tal cual, las modifica o crea desde cero.
- **Memoria en Obsidian:** una nota por video, un índice del canal y una «Memoria para Claude» que tú escribes.
- **Cola de producción:** hasta 50 videos seguidos desde Inicio, cada uno con su tarjeta (tema o brief, estética, guion, recursos, duración, formato y portadas). Si se agota el límite del plan, espera a que se reponga y sigue sola. Guía para llenarla: `docs/guia-cola-marketing.md`.
- **Horizontal o vertical:** 16:9 para YouTube y 9:16 para TikTok y Shorts, de punta a punta.
- **Tus portadas, tal cual:** la de YouTube es la miniatura; ambas van incrustadas en las descargas y en las partes de TikTok.

## Estructura

```
src-tauri/src/   núcleo Rust: SQLite, archivos, HTTP, procesos, credenciales, OAuth
src/lib/         datos, ajustes, habilidades, consumo, actividad
src/providers/   Claude Code, voz, YouTube, ffmpeg
src/media/       fuentes libres, biblioteca, visión
src/motion/      motor de animaciones (navegador sin ventana) y catálogo de piezas listas
src-tauri/resources/motion/   GSAP, kit (K) y piezas listas (P)
public/piezas/   vistas previas de las piezas (e2e/piezas.e2e.ts las regenera)
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
