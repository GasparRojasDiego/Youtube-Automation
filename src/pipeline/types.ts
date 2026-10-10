// Tipos de las salidas de cada etapa (se guardan como JSON en stages.output).
import type { Provenance } from "../providers/images";
import type { Motion } from "./montage";
import type { Span } from "./align";

export interface Source {
  id: string; url: string; title: string; publisher: string; date: string;
  type: "primary" | "secondary" | "tertiary"; reliability: "high" | "medium" | "low"; why_es: string;
}
export interface Fact {
  id: string; text_en: string; source_ids: string[]; quote: string; quote_location: string;
  confidence: "high" | "medium" | "low"; about_real_person: boolean; note_es: string;
}
export interface ResearchOut {
  summary_es: string; angle_en: string; sources: Source[]; facts: Fact[];
  open_questions_es: string[]; risks: { kind: "legal" | "policy" | "verification"; note_es: string }[];
}

export interface Claim { id: string; text_en: string; fact_ids: string[]; source_ids: string[]; kind: "fact" | "inference" | "opinion" }
export interface Segment { id: string; title: string; purpose_es: string; text_en: string; claims: Claim[]; on_screen_sources: string[] }
export interface ScriptOut {
  title_options: { title: string; promise_es: string }[];
  segments: Segment[];
  originality_note_es: string;
  skills_check_es?: string[];
  version?: number;
}

export type Severity = "ok" | "warn" | "block";
export interface ClaimCheck {
  claim_id: string; verdict: "supported" | "partially" | "unsupported" | "mismatch"; severity: Severity;
  issues: string[]; note_es: string; suggested_fix_en: string; gloss_es: string; quote_gloss_es: string;
  resolution?: "accepted" | "fix" | null; user_note?: string;
}
export interface VerifyOut {
  overall_es: string;
  title_checks: { title: string; verdict: "ok" | "overpromise"; note_es: string }[];
  originality: { verdict: "ok" | "weak"; note_es: string };
  claims: ClaimCheck[];
  unlinked: { segment_id: string; text_en: string; issue_es: string; severity: Severity; resolution?: "accepted" | "fix" | null; user_note?: string }[];
  segment_glosses: { segment_id: string; summary_es: string }[];
  rounds?: number;
}

export interface VoiceSegment { segment_id: string; path: string; duration: number; hash: string }
export interface VoiceOut { provider: string; segments: VoiceSegment[]; total: number }

export interface ThumbCandidate { concept_es: string; text: string; highlight: string; image_prompt_en: string; background_asset_id?: string; layout: "left" | "right" | "center"; image?: string; path?: string }
export interface PackageOut {
  titles: { title: string; note_es: string }[];
  chosen_title: string;
  description_body_en: string;
  description: string;
  tags: string[];
  thumbnails: ThumbCandidate[];
  chosen_thumbnail: number;
  synthetic_media: boolean;
  synthetic_reason_es: string;
  tiktok_caption_en?: string;
  tiktok_hashtags?: string[];
  chapters: { t: number; title: string }[];
  srt: string;
  motion_count?: number;
}

export interface RenderOut { file: string; duration: number; encoder: string; segmentHashes: Record<string, string>; renderedAt: number; sizeBytes: number; poster?: string }

export interface PublishOut { youtube_id: string; url: string; privacy: string; publish_at: string | null; thumbnail_ok: boolean; note_es: string }

// ======================= Edición v2 =======================

/** Voz v2: además de la duración, los tiempos de cada oración (relativos al audio del segmento). */
export interface VoiceSegmentV2 extends VoiceSegment { sentences?: Span[] }

export type VisualType = "photo" | "archival" | "clip" | "meme" | "ai_image" | "motion" | "map" | "source_card" | "quote_card" | "title_card" | "text_card";
export type Transition = "cut" | "fade" | "dissolve" | "fadeblack" | "fadewhite" | "smoothleft" | "smoothright" | "smoothup" | "slideleft" | "slideright"
  | "wipeleft" | "wiperight" | "circleopen" | "zoomin" | "hblur" | "fadegrays" | "coverleft" | "revealleft" | "radial";
export const TRANSITIONS: Transition[] = ["cut", "fade", "dissolve", "fadeblack", "fadewhite", "smoothleft", "smoothright", "smoothup", "slideleft", "slideright", "wipeleft", "wiperight", "circleopen", "zoomin", "hblur", "fadegrays", "coverleft", "revealleft", "radial"];
export type Grade = "neutral" | "cold" | "warm" | "noir" | "sepia" | "desaturated" | "punchy";
export const GRADES: Grade[] = ["neutral", "cold", "warm", "noir", "sepia", "desaturated", "punchy"];
export type ShotMotion = Motion | "punch_in" | "drift";

export interface SfxCue { id: string; at: number; type: string; query_en: string; gain_db: number; asset_id?: string | null; path?: string | null; duration?: number; origin?: "library" | "freesound" | "openverse" | "elevenlabs" | "synth" }

/** Una toma del storyboard (una imagen, clip, tarjeta o animación). */
export interface Shot {
  id: string; segment_id: string; beat: number;
  from: number; to: number;            // oraciones del segmento que cubre la toma (rango del beat)
  visual: VisualType;
  query_en?: string; alt_queries_en?: string[]; must_show_es?: string; avoid_es?: string; image_prompt_en?: string;
  card_text?: string; source_id?: string; motion_brief_en?: string; user_file_id?: string;
  // casting (assets)
  asset_id?: string | null; focus_x?: number; focus_y?: number; clip_in?: number; clip_audio_db?: number | null;
  candidates?: string[]; cast_note_es?: string;
  // retoques (Opus)
  transition_in?: Transition; transition_s?: number; motion?: ShotMotion; grade?: Grade; punch_at?: number | null;
  // resultado
  path?: string | null;            // imagen/clip/tarjeta/animación que se usa
  media?: "image" | "video";       // tipo de archivo de `path`
  start?: number; dur?: number;    // segundos dentro del clip del segmento
  provenance?: Provenance; error?: string | null;
}

export interface MusicBed { segment_ids: string[]; mood_en: string; asset_id?: string | null; path?: string | null; title?: string; gain_db?: number }

export interface StoryboardOut {
  shots: Shot[];
  sfx: SfxCue[];             // tiempos globales (s) en el video
  music: MusicBed[];
  emphasis: Record<string, string[]>; // segment_id → palabras a destacar en subtítulos
  notes_es: string;
  scriptKey: string;
}

export interface AssetsOut { shots: Shot[]; sfx: SfxCue[]; music: MusicBed[]; downloaded: number; described: number; reused: number; fallbacks: number; key?: string }

export interface MotionItem {
  id: string; kind: "fullscreen" | "overlay";
  shot_ids: string[];        // tomas que reemplaza (fullscreen) o sobre las que aparece (overlay)
  start: number; duration: number; // tiempo dentro del segmento (s)
  segment_id: string;
  brief_en: string; text?: string; data_es?: string; libs?: ("map" | "d3")[]; icons?: string[]; icon_ids?: string[];
  asset_ids?: string[];
  revise_en?: string;        // pedidos de mejora continua: se aplican como corrección del código anterior
  // resultado
  file?: string | null; error?: string | null; attempts?: number; critique_es?: string; hash?: string;
  code?: { css: string; html: string; js: string; libs: ("map" | "d3")[]; duration: number };
  poster?: string | null;
  sfx?: SfxCue[];            // efectos sincronizados con sus movimientos (tiempo desde el inicio de la animación)
}

export interface PolishOut { shots: Shot[]; sfx: SfxCue[]; music: MusicBed[]; motion: MotionItem[]; notes_es: string; grade: Grade; key?: string; skipped?: boolean; verify_es?: string[] }
export interface MotionOut { items: MotionItem[]; rendered: number; failed: number }
