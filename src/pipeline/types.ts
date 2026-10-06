// Tipos de las salidas de cada etapa (se guardan como JSON en stages.output).
import type { Provenance } from "../providers/images";
import type { Motion } from "./montage";

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
  vocab: { term: string; meaning_es: string; example_en: string; note_es: string }[];
  rounds?: number;
}

export interface VoiceSegment { segment_id: string; path: string; duration: number; hash: string }
export interface VoiceOut { provider: string; segments: VoiceSegment[]; total: number }

export interface PlannedShot {
  id: string; segment_id: string; sentence_from: number; sentence_to: number;
  kind: "generated" | "archival" | "source_card" | "title_card" | "quote_card" | "text_card";
  prompt_en?: string; archival_query?: string; source_id?: string; card_text?: string; overlay_text?: string;
  motion: Motion;
  // resultado
  image?: string; overlay?: string | null; provenance?: Provenance; dur?: number; error?: string | null; hash?: string;
}
export interface VisualsOut { shots: PlannedShot[]; generated: number; archival: number; cards: number; usd: number }

export interface ThumbCandidate { concept_es: string; text: string; highlight: string; image_prompt_en: string; layout: "left" | "right" | "center"; image?: string; path?: string }
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
  chapters: { t: number; title: string }[];
  srt: string;
}

export interface RenderOut { file: string; duration: number; encoder: string; segmentHashes: Record<string, string>; renderedAt: number; sizeBytes: number }

export interface PublishOut { youtube_id: string; url: string; privacy: string; publish_at: string | null; thumbnail_ok: boolean; note_es: string }
