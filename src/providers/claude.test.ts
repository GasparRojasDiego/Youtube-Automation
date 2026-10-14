import { describe, it, expect } from "vitest";
import { parseResetAt, resetFromLimits, parseClaudeOutput, UsageLimitError } from "./claude";

const T = (iso: string) => new Date(iso).getTime();

describe("límite de uso del plan", () => {
  it("lee la hora de reposición en los formatos de Claude Code", () => {
    expect(parseResetAt("Claude AI usage limit reached|1760040000")).toBe(1760040000000);
    const now = T("2026-10-14T12:00:00-05:00");
    expect(parseResetAt("5-hour limit reached ∙ resets 3pm (America/Lima)", now)).toBe(T("2026-10-14T15:00:00-05:00"));
    // Acaba de pasar (hace 1 h): ya se repuso, es la de hoy; hace más de 3 h: es la de mañana
    expect(parseResetAt("5-hour limit reached ∙ resets 11am (America/Lima)", now)).toBe(T("2026-10-14T11:00:00-05:00"));
    expect(parseResetAt("5-hour limit reached ∙ resets 3am (America/Lima)", now)).toBe(T("2026-10-15T03:00:00-05:00"));
    expect(parseResetAt("You've hit your limit · resets 10:30am (UTC)", T("2026-10-14T09:00:00Z"))).toBe(T("2026-10-14T10:30:00Z"));
    expect(parseResetAt("Weekly limit reached ∙ resets Oct 16, 9am (America/Lima)", now)).toBe(T("2026-10-16T09:00:00-05:00"));
    expect(parseResetAt("Opus weekly limit reached · resets Jan 2 at 9am (UTC)", T("2026-12-30T10:00:00Z"))).toBe(T("2027-01-02T09:00:00Z"));
    expect(parseResetAt("Your limit will reset at 7pm (Europe/Madrid)", T("2026-10-14T10:00:00Z"))).toBe(T("2026-10-14T19:00:00+02:00"));
    expect(parseResetAt("Something else went wrong")).toBeNull();
    expect(parseResetAt("resets 25pm")).toBeNull();
  });

  it("convierte el mensaje del CLI en UsageLimitError con la hora", () => {
    const res = JSON.stringify({ type: "result", subtype: "success", is_error: true, result: "Claude AI usage limit reached|1760040000" });
    try { parseClaudeOutput(res, "", 1); expect.unreachable(); }
    catch (e) { expect(e).toBeInstanceOf(UsageLimitError); expect((e as UsageLimitError).resetAt).toBe(1760040000000); }
    try { parseClaudeOutput('{"type":"rate_limit_event","rate_limit_info":{}}\n', "You've hit your limit · resets 3pm (America/Lima)\n", 1); expect.unreachable(); }
    catch (e) { expect(e).toBeInstanceOf(UsageLimitError); expect((e as UsageLimitError).resetAt).toBeGreaterThan(0); }
    // Un texto del modelo que habla de «límites» no es un límite del plan
    let err: unknown = null;
    try { parseClaudeOutput('{"type":"assistant","message":{"content":[{"type":"text","text":"the API rate limit is 5"}]}}\n', "", 1); } catch (e) { err = e; }
    expect(err).toBeTruthy(); expect(err).not.toBeInstanceOf(UsageLimitError);
  });

  it("sin hora en el mensaje usa la ventana llena del plan", () => {
    const now = T("2026-10-14T12:00:00Z");
    const l = (f: number, s: number, status = "allowed") => ({ fiveHour: { utilization: f, resetsAt: now + 3600_000 }, sevenDay: { utilization: s, resetsAt: now + 3 * 86400_000 }, status, updatedAt: now });
    expect(resetFromLimits(l(1, 0.5), now)).toBe(now + 3600_000);
    expect(resetFromLimits(l(1, 0.99), now)).toBe(now + 3 * 86400_000);
    expect(resetFromLimits(l(0.4, 0.5, "rejected"), now)).toBe(now + 3600_000);
    expect(resetFromLimits(l(0.4, 0.5), now)).toBeNull();
    expect(resetFromLimits(null, now)).toBeNull();
  });
});
