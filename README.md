# ATRIL

**Estudio de producción asistida para YouTube** · VT Asvent · v1.0.0

ATRIL automatiza el trabajo repetitivo de producir un video documental en inglés:

1. investigación con fuentes primarias;
2. guion;
3. verificación de cada afirmación contra su fuente;
4. narración;
5. imágenes;
6. miniatura y metadatos;
7. montaje;
8. publicación.

El usuario revisa y aprueba en dos puntos de control: el guion verificado y la revisión final. **Ningún video se publica sin aprobación explícita.**

Es una aplicación de escritorio para Windows, hecha con Tauri 2 (Rust) y React con TypeScript.

## Descargar

En la página de *Releases* del repositorio:

- `ATRIL_1.0.0_instalador_x64.exe`: instalador recomendado. Crea un acceso directo y un desinstalador.
- `ATRIL_1.0.0_portable_x64.zip`: versión portátil (`ATRIL.exe` junto con `ffmpeg.exe` y `ffprobe.exe`).
- `ATRIL_1.0.0_x64.msi`: instalador MSI alternativo.

La configuración inicial (Claude Code, Google Cloud, Gemini y YouTube) está en la pestaña **Guía** dentro de la app.

## Principios de diseño

- **La identidad no está en el código.**
  - La voz narrativa, la estructura, el estilo visual, las reglas de miniatura y las de montaje viven en **habilidades**.
  - Las habilidades son documentos Markdown que el usuario crea, activa, desactiva y versiona.
  - Bloques `atril:*` en JSON fijan los parámetros que el motor lee directamente.
- **Rigor factual.**
  - Cada afirmación factual queda ligada a un hecho, a una cita literal y a una fuente.
  - La verificación es una pasada independiente que asume que habrá errores.
  - Se combina con comprobaciones mecánicas.
  - Las marcas rojas bloquean la aprobación.
- **Recuperable.**
  - Cada etapa guarda su resultado.
  - Lo ya generado y pagado se reutiliza comparando huellas (hash) de sus entradas.
  - Tras un cierre inesperado, el trabajo se reanuda donde quedó.
- **Sin fallos silenciosos.**
  - Todo error de un servicio externo se explica en español.
  - Queda en el registro y aparece en la campana de avisos.
  - La pantalla **Diagnóstico** prueba cada integración por separado.
- **Costo visible.**
  - Hay un libro de costos por video y por mes, con tope opcional.
  - El presupuesto se fija en soles.
- **Integraciones oficiales.**
  - Claude Code CLI en modo no interactivo.
  - Google Cloud TTS, Gemini API, Wikimedia Commons API.
  - YouTube Data, Analytics y Reporting API.
  - ffmpeg local.

## Estructura

```
src-tauri/src/        núcleo Rust: SQLite, archivos, HTTP, subida reanudable, procesos, credenciales, OAuth
src/lib/              datos, ajustes, habilidades, costos, avisos
src/providers/        Claude Code, voz, imágenes, YouTube, ffmpeg
src/pipeline/         etapas, orquestador, montaje (ffmpeg), tarjetas (canvas), prompts y esquemas
src/pages/, src/ui/   interfaz en español (identidad visual VT Asvent)
docs/                 descubrimiento, notas de versión, política de privacidad
```

## Desarrollo

```bash
npm install
npm test             # pruebas (incluye montaje con ffmpeg real si está instalado)
npx tauri dev        # app en modo desarrollo
npx tauri build      # instalador (en Windows)
```

El flujo `.github/workflows/build.yml` compila en Windows. Incluye ffmpeg como binario auxiliar y publica los instaladores.
