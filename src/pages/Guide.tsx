import { BookOpen } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PageHeader, Card, Markdown } from "../ui/kit";
import { MONTAGE_DEFAULTS, VISUAL_DEFAULTS, THUMBNAIL_DEFAULTS, SCRIPT_DEFAULTS } from "../lib/skills";

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

## 3. Gemini (imágenes)
- aistudio.google.com → «Get API key», en el mismo proyecto con facturación (la generación de imágenes no está en el nivel gratuito).
- Pégala en **Ajustes → Credenciales → Gemini**. Ajusta el máximo de imágenes generadas por video en **Ajustes → Imágenes**.

## 4. YouTube (publicación y métricas)
1. **Pantalla de consentimiento OAuth** (tipo externo): añade tu cuenta y publícala «En producción» para que la autorización no caduque cada 7 días.
2. **Credenciales → ID de cliente OAuth → App de escritorio**. Pega el ID y el secreto en Ajustes → Credenciales.
3. **Ajustes → YouTube → Conectar** y autoriza con la cuenta del canal.
4. Verifica el canal por teléfono en youtube.com/verify (miniaturas personalizadas y videos de más de 15 min).
5. **Auditoría**: hasta que Google la apruebe, todo video subido por API queda privado. Pídela con el formulario de auditoría (enlace en Ajustes → YouTube). Pide una política de privacidad pública: hay una plantilla en \`docs/privacy-policy.html\` del repositorio. Mientras tanto, usa **Exportar paquete** y sube a mano.

## 5. Música
- YouTube Studio → Biblioteca de audio → descarga pistas de uso libre → **Ajustes → Música → Añadir archivos**. Si la licencia pide atribución, escríbela: se añade sola a la descripción.

## 6. Tu identidad: habilidades
- La identidad del canal no está en el código: la escribes tú en **Habilidades** (como tus skills de Claude).
- Cada habilidad elige en qué etapas se inyecta (guion, verificación, imágenes, miniatura…). Puedes importar archivos SKILL.md con frontmatter (\`name\`, \`description\`, \`scopes\`).
- **Referentes → Destilar** propone borradores (desactivados) a partir de los perfiles de tus canales de referencia.

## 7. El día a día (meta: 30 minutos)
- Una vez por semana: aprueba varios temas en **Temas**.
- ATRIL investiga, escribe y verifica solo. Te avisa cuando el guion verificado te espera (**10–15 min**: resuelve las marcas rojas y aprueba).
- Luego narra, ilustra y monta solo, y te avisa para la **revisión final** (**10 min**: título, miniatura y aprobar con fecha).
- El tiempo de revisión se mide en **Hoy** para que veas si cabe en tu día.

## 8. Reglas que la app hace cumplir
- Cada afirmación factual debe estar ligada a una fuente con su cita; las marcas rojas bloquean la aprobación.
- Los títulos y las miniaturas no pueden prometer más de lo que el video demuestra.
- Las imágenes generadas no representan a personas reales de forma fotorrealista ni muestran marcas o personajes protegidos.
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
- **lowerThirds**: activa los rótulos inferiores.

\`\`\`atril:visual
${JSON.stringify(VISUAL_DEFAULTS, null, 2)}
\`\`\`
- Colores y fuentes de las tarjetas (fuentes disponibles: Oswald, Anton, Source Serif 4, JetBrains Mono, Poppins).
- **photorealistic**: si tu estilo es fotorrealista (activa la declaración de contenido sintético). **imageStyle**: sufijo de estilo para todas las imágenes generadas.

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
