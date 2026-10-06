import { BookOpen } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PageHeader, Card, Markdown } from "../ui/kit";
import { MONTAGE_DEFAULTS, VISUAL_DEFAULTS, THUMBNAIL_DEFAULTS, SCRIPT_DEFAULTS } from "../lib/skills";
import { CAPTION_DEFAULTS } from "../pipeline/captions";

const SETUP = `
## 1. Claude Code (el cerebro: investigación, guion, verificación)
- En PowerShell: \`irm https://claude.ai/install.ps1 | iex\` (instalador oficial de Windows).
- Abre una terminal, escribe \`claude\` y entra con la cuenta del plan (la de tu papá). Basta una vez.
- Comprueba en **Diagnóstico**. ATRIL ejecuta Claude Code sin ventana, con su propio esquema de salida, y nunca le da acceso a tus archivos.

## 2. Proyecto de Google Cloud (voz y lectura de YouTube)
- console.cloud.google.com → crea un proyecto y vincula una cuenta de facturación (necesaria aunque uses el nivel gratuito).
- Habilita: **Cloud Text-to-Speech API**, **YouTube Data API v3**, **YouTube Analytics API**, **YouTube Reporting API**.
- Credenciales → Crear clave de API → restríngela a esas APIs → pégala en **Ajustes → Credenciales → Google Cloud**.
- Chirp 3 HD incluye 1 millón de caracteres gratis al mes: un video de 13 minutos usa unos 12.000.

## 3. Material libre (gratis): Pexels, Pixabay, Freesound y Openverse
- **Pexels**: pexels.com/api → crea una cuenta → copia tu clave. **Pixabay**: pixabay.com/api/docs (con la sesión iniciada aparece tu clave). **Freesound**: freesound.org/apiv2/apply → «API key».
- Pégalas en **Ajustes → Medios** y pulsa **Probar**. Wikimedia Commons, NASA y The Met no necesitan clave.
- **Openverse**: en Ajustes → Medios escribe tu correo y pulsa **Registrar**; confirma el correo que te llega (sin registro solo permite ~5 búsquedas por hora).
- Solo se aceptan licencias que permiten uso comercial y modificación (CC0, dominio público, CC BY, CC BY-SA, Pexels, Pixabay). Cada archivo guarda licencia, autor y página de origen, y los créditos obligatorios se escriben solos en la descripción.
- **GIPHY y Tenor no se usan**: sus GIF suelen ser fragmentos de películas, series o memes con derechos de terceros, y sus condiciones no permiten usarlos en videos monetizados.
- Todo lo descargado vive en **Documentos\\ATRIL\\Biblioteca** y en la página **Biblioteca**. Claude (Sonnet) mira cada imagen o clip **una sola vez** y escribe una descripción detallada en español y etiquetas en inglés; los próximos videos buscan primero ahí, sin volver a gastar tokens ni cuota.

## 4. Animaciones (motion graphics con Opus)
- No necesitas instalar nada: ATRIL usa **Microsoft Edge** (viene con Windows) en modo sin ventana para renderizar cada animación cuadro a cuadro. Compruébalo en **Diagnóstico → Motor de animaciones**.
- Opus no edita los 12 minutos desde cero: revisa el corte que armó Sonnet y lo mejora (transiciones, golpes de zoom, efectos de sonido, etalonaje) y diseña las animaciones de mayor valor: mapas reales, líneas de tiempo, contadores, llamadas sobre fotos.
- Ajusta cuántas por video en **Ajustes → Motion**.

## 5. Imágenes generadas (opcional, de pago)
- Si quieres imágenes generadas cuando no exista material libre: aistudio.google.com → «Get API key» (con facturación), pégala en **Ajustes → Credenciales → Gemini** y activa «Permitir imágenes generadas» en **Ajustes → Medios**. Por defecto está desactivado: todo es gratis.

## 6. YouTube (publicación y métricas)
1. **Pantalla de consentimiento OAuth** (tipo externo): añade tu cuenta y publícala «En producción» para que la autorización no caduque cada 7 días.
2. **Credenciales → ID de cliente OAuth → App de escritorio**. Pega el ID y el secreto en Ajustes → Credenciales.
3. **Ajustes → YouTube → Conectar** y autoriza con la cuenta del canal.
4. Verifica el canal por teléfono en youtube.com/verify (miniaturas personalizadas y videos de más de 15 min).
5. **Auditoría**: hasta que Google la apruebe, todo video subido por API queda privado. Pídela con el formulario de auditoría (enlace en Ajustes → YouTube). Pide una política de privacidad pública: hay una plantilla en \`docs/privacy-policy.html\` del repositorio. Mientras tanto, usa **Exportar paquete** y sube a mano.

## 7. Música
- Lo más seguro para monetizar: YouTube Studio → Biblioteca de audio → descarga pistas → **Ajustes → Música → Añadir archivos**, y escribe su **ambiente en inglés** (dark, tense, piano, hopeful…): ATRIL elige la pista adecuada para cada capítulo. Si no hay pistas propias, busca música CC0/CC BY en Openverse y Freesound (con atribución automática).

## 8. Tu identidad: habilidades
- La identidad del canal no está en el código: la escribes tú en **Habilidades** (como tus skills de Claude).
- Cada habilidad elige en qué etapas se inyecta (guion, verificación, imágenes, miniatura…). Puedes importar archivos SKILL.md con frontmatter (\`name\`, \`description\`, \`scopes\`).
- **Referentes → Destilar** propone borradores (desactivados) a partir de los perfiles de tus canales de referencia.

## 9. Consumo de tu plan de Claude
- La barra superior muestra siempre cuánto llevas usado de la **ventana de 5 horas** y del **límite semanal**, y cuándo se reponen (datos oficiales que informa Claude Code en cada tarea).
- **Consumo** detalla cada tarea: tokens de entrada (y cuántos salieron de caché), de salida, búsquedas web y el % del plan que representó.
- Para ahorrar límite: Opus solo en guion, verificación, retoques y animaciones; Sonnet en investigación, storyboard, visión y casting; cada imagen se describe una sola vez; la biblioteca se reutiliza.

## 10. El día a día (meta: 30 minutos)
- Una vez por semana: aprueba varios temas en **Temas**.
- ATRIL investiga, escribe y verifica solo. Te avisa cuando el guion verificado te espera (**10–15 min**: resuelve las marcas rojas y aprueba).
- Luego narra, arma el storyboard, busca y elige el material, Opus pule la edición y crea las animaciones, y se monta solo. Míralo en **Estudio en vivo**: cada búsqueda, cada imagen encontrada, cada decisión y cada cuadro renderizado.
- Te avisa para la **revisión final** (**10 min**: cambia cualquier toma por otro candidato o por algo de la biblioteca, ajusta la música, título y miniatura, y aprueba con fecha).
- El tiempo de revisión se mide en **Hoy** para que veas si cabe en tu día.

## 11. Reglas que la app hace cumplir
- Cada afirmación factual debe estar ligada a una fuente con su cita; las marcas rojas bloquean la aprobación.
- Los títulos y las miniaturas no pueden prometer más de lo que el video demuestra.
- Las imágenes generadas no representan a personas reales de forma fotorrealista ni muestran marcas o personajes protegidos.
- Una foto de stock de una persona desconocida nunca representa a una persona real concreta (víctima, sospechoso…); la visión marca las personas reales identificables y el casting las evita salvo que el video trate de ellas.
- El texto en pantalla (tarjetas, animaciones) nunca afirma más que la narración.
- Se declara el contenido sintético cuando corresponde, y la descripción incluye fuentes, créditos y un aviso de IA.
`;

const PARAMS = `
Escribe estos bloques dentro de cualquier habilidad activa (fuera de comentarios). Si varias habilidades fijan el mismo parámetro, gana la última por orden alfabético.

\`\`\`atril:montaje
${JSON.stringify(MONTAGE_DEFAULTS, null, 2)}
\`\`\`
- **shotSeconds**: duración objetivo de cada toma [mín, máx]. **transition**: fade, dissolve, fadeblack, smoothleft o cut.
- **segmentTransition**: «fadeblack» funde a negro entre capítulos; «cut» corta. **pauseBetweenSegments**: silencio entre capítulos (s).
- **kenBurns**: cuánto acercamiento o paneo (0 = imagen fija). **musicVolumeDb**: volumen de la música; **musicDuck**: la baja cuando habla el narrador.
- **lowerThirds**: activa los rótulos inferiores. **humor**: permite memes y momentos cómicos. **grain**: grano de película (0–20). **vignette**: viñeta suave.

\`\`\`atril:visual
${JSON.stringify(VISUAL_DEFAULTS, null, 2)}
\`\`\`
- Colores y fuentes de las tarjetas (fuentes disponibles: Oswald, Anton, Source Serif 4, JetBrains Mono, Poppins).
- **photorealistic**: si tu estilo es fotorrealista (activa la declaración de contenido sintético). **imageStyle**: sufijo de estilo para todas las imágenes generadas.

\`\`\`atril:subtitulos
${JSON.stringify(CAPTION_DEFAULTS, null, 2)}
\`\`\`
- Subtítulos quemados con la palabra que se dice resaltada. **mode**: highlight (color), pop (color y aumento) o plain. **position**: bottom, middle o top. **maxWords**/**maxChars**/**lines**: tamaño de cada página. **font**: fuentes estáticas incluidas («Poppins ExtraBold», «Anton», «Bebas Neue», «Archivo Black»…). **enabled: false** los desactiva.

\`\`\`atril:miniatura
${JSON.stringify(THUMBNAIL_DEFAULTS, null, 2)}
\`\`\`

\`\`\`atril:guion
${JSON.stringify(SCRIPT_DEFAULTS, null, 2)}
\`\`\`

\`\`\`atril:voz
{ "voice": "en-US-Chirp3-HD-Charon", "speakingRate": 1.0, "style": "(solo Gemini) instrucción de estilo" }
\`\`\`
`;

export function Guide() {
  return (
    <div className="space-y-5">
      <PageHeader kicker="Ayuda" title="Guía" subtitle="Configuración inicial y referencia de parámetros." />
      <Card title="Configuración inicial" icon={BookOpen}><Markdown text={SETUP} /></Card>
      <Card title="Parámetros de las habilidades"><Markdown text={PARAMS} /></Card>
      <Card title="Enlaces">
        <div className="flex flex-wrap gap-2">
          {[
            ["Google Cloud Console", "https://console.cloud.google.com/"],
            ["Google AI Studio", "https://aistudio.google.com/"],
            ["Pexels API", "https://www.pexels.com/api/"],
            ["Pixabay API", "https://pixabay.com/api/docs/"],
            ["Freesound API", "https://freesound.org/apiv2/apply/"],
            ["Verificar canal", "https://www.youtube.com/verify"],
            ["Auditoría API de YouTube", "https://support.google.com/youtube/contact/yt_api_form"],
            ["Política de contenido inauténtico", "https://support.google.com/youtube/answer/1311392"],
            ["Divulgación de contenido con IA", "https://support.google.com/youtube/answer/14328491"],
          ].map(([l, u]) => <button key={u} className="btn-secondary btn-sm" onClick={() => void openUrl(u)}>{l}</button>)}
        </div>
      </Card>
    </div>
  );
}
