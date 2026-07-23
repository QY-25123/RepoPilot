"use client";

import { useEffect, useRef, useState } from "react";

interface StreamEvent {
  type: string;
  step?: string;
  message?: string;
  content?: string;
  text?: string;
  tool?: string;
  input?: Record<string, string>;
  chars?: number;
}

const EXAMPLE_GOALS = [
  "Give me an overview of what this repository is about",
  "What's the development workflow and CI/CD pipeline?",
  "How do I contribute? What's the PR process?",
  "What are the main components and architecture?",
];

const STEP_ICONS: Record<string, string> = {
  init: "🚀",
  tools_loaded: "🔧",
  planning: "🧠",
  researching: "🔍",
  synthesizing: "✍️",
  complete: "✅",
};

const PIPELINE_STAGES = [
  {
    icon: "🧠",
    label: "Plan",
    description:
      "The Planner agent reads your goal and maps an investigation strategy tailored to your question.",
  },
  {
    icon: "🔍",
    label: "Research",
    description:
      "The Researcher uses 7 GitHub MCP tools — commits, files, PRs, issues, branches, and code search — to gather real data.",
  },
  {
    icon: "✍️",
    label: "Synthesize",
    description:
      "The Synthesizer writes a thorough, goal-focused answer with extended thinking, streamed back to you in real time.",
  },
];

const card: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: "16px",
  boxShadow: "var(--shadow-card)",
};

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [analysis, setAnalysis] = useState("");
  const [error, setError] = useState("");
  const [currentStep, setCurrentStep] = useState("");
  const analysisRef = useRef("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events, analysis]);

  const analyze = async () => {
    if (!repoUrl.trim() || !goal.trim()) return;

    setIsAnalyzing(true);
    setEvents([]);
    setAnalysis("");
    setError("");
    setCurrentStep("");
    analysisRef.current = "";

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
      const res = await fetch(`${apiUrl}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo_url: repoUrl, goal }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail ?? "Request failed");
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response stream");

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let event: StreamEvent;
          try {
            event = JSON.parse(raw) as StreamEvent;
          } catch {
            continue;
          }

          if (event.type === "done") break;
          if (event.type === "error") {
            setError(event.message ?? "Unknown error");
            continue;
          }
          if (event.type === "analysis_chunk") {
            analysisRef.current += event.text ?? "";
            setAnalysis(analysisRef.current);
            continue;
          }
          if (event.type === "analysis_complete" || event.type === "research_data") {
            continue;
          }
          if (event.type === "status") {
            setCurrentStep(event.step ?? "");
          }
          setEvents((prev) => [...prev, event]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAnalyzing(false);
      setCurrentStep("");
    }
  };

  const canSubmit = !isAnalyzing && repoUrl.trim() !== "" && goal.trim() !== "";
  const hasOutput = events.length > 0 || analysis !== "" || isAnalyzing;

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <div style={{ maxWidth: "680px", margin: "0 auto", padding: "48px 20px 80px" }}>

        {/* ── Top bar ──────────────────────────────────── */}
        <div style={{ marginBottom: "36px" }}>
          <p style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--muted)",
            marginBottom: "10px",
          }}>
            GitHub MCP · AI Analysis
          </p>
          <h1 style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "clamp(28px, 5vw, 40px)",
            fontWeight: 400,
            lineHeight: 1.2,
            color: "var(--text)",
            margin: 0,
          }}>
            GitHub Repo Analyzer
          </h1>
        </div>

        {/* ── Analyzer form ────────────────────────────── */}
        <section style={{ ...card, padding: "28px" }}>
          <div style={{ marginBottom: "18px" }}>
            <label style={labelStyle}>Repository URL</label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && analyze()}
              placeholder="https://github.com/owner/repo"
              disabled={isAnalyzing}
              style={inputStyle(isAnalyzing)}
              onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 3px var(--ring)")}
              onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
            />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={labelStyle}>Your question</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What would you like to know about this repository?"
              rows={3}
              disabled={isAnalyzing}
              style={{ ...inputStyle(isAnalyzing), resize: "none" }}
              onFocus={(e) => (e.currentTarget.style.boxShadow = "0 0 0 3px var(--ring)")}
              onBlur={(e) => (e.currentTarget.style.boxShadow = "none")}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" }}>
              {EXAMPLE_GOALS.map((eg) => (
                <button
                  key={eg}
                  onClick={() => setGoal(eg)}
                  disabled={isAnalyzing}
                  style={{
                    fontSize: "11px",
                    padding: "4px 10px",
                    borderRadius: "20px",
                    border: "1px solid var(--chip-border)",
                    background: "var(--chip-bg)",
                    color: "var(--accent)",
                    cursor: isAnalyzing ? "default" : "pointer",
                    opacity: isAnalyzing ? 0.45 : 1,
                    transition: "background 0.15s, color 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isAnalyzing) e.currentTarget.style.background = "var(--accent-muted)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--chip-bg)";
                  }}
                >
                  {eg}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={analyze}
            disabled={!canSubmit}
            style={{
              width: "100%",
              padding: "13px",
              borderRadius: "10px",
              border: "none",
              background: canSubmit ? "var(--accent)" : "var(--border)",
              color: canSubmit ? "#fff" : "var(--muted)",
              fontWeight: 600,
              fontSize: "15px",
              cursor: canSubmit ? "pointer" : "default",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (canSubmit) e.currentTarget.style.background = "var(--accent-hover)";
            }}
            onMouseLeave={(e) => {
              if (canSubmit) e.currentTarget.style.background = "var(--accent)";
            }}
          >
            {isAnalyzing ? (
              <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                <span style={{
                  width: "16px", height: "16px",
                  border: "2px solid rgba(255,255,255,0.3)",
                  borderTopColor: "#fff",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "spin 0.7s linear infinite",
                }} />
                Analyzing…
              </span>
            ) : (
              "Analyze Repository"
            )}
          </button>
        </section>

        {/* ── Error ────────────────────────────────────── */}
        {error && (
          <div style={{
            marginTop: "16px",
            padding: "14px 16px",
            borderRadius: "12px",
            background: "#FFF0F0",
            border: "1px solid #FFCCCC",
            color: "#B02020",
            fontSize: "14px",
          }}>
            <strong style={{ fontWeight: 600 }}>Error: </strong>{error}
          </div>
        )}

        {/* ── Pipeline output ──────────────────────────── */}
        {hasOutput && (
          <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>

            {/* Agent steps */}
            <section style={{ ...card, padding: "22px 24px" }}>
              <p style={eyebrowStyle}>Agent Pipeline</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {events.map((ev, i) => {
                  if (ev.type === "status") {
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "14px" }}>
                        <span style={{ fontSize: "16px", lineHeight: 1, marginTop: "1px" }}>
                          {STEP_ICONS[ev.step ?? ""] ?? "⚙️"}
                        </span>
                        <span style={{ color: "var(--text-sub)" }}>{ev.message}</span>
                      </div>
                    );
                  }
                  if (ev.type === "plan") {
                    return (
                      <div key={i} style={{ marginLeft: "26px" }}>
                        <p style={{ ...eyebrowStyle, marginBottom: "6px" }}>Research plan</p>
                        <pre style={{
                          fontSize: "12px",
                          color: "var(--muted)",
                          background: "var(--chip-bg)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          padding: "12px",
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.6,
                          margin: 0,
                          overflowX: "auto",
                        }}>
                          {(ev.content ?? "").slice(0, 600)}
                          {(ev.content ?? "").length > 600 && "…"}
                        </pre>
                      </div>
                    );
                  }
                  if (ev.type === "tool_call") {
                    const inputStr = Object.entries(ev.input ?? {})
                      .slice(0, 3)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(", ");
                    return (
                      <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", marginLeft: "26px", fontSize: "13px" }}>
                        <span style={{ color: "var(--border)", marginTop: "2px" }}>›</span>
                        <span>
                          <code style={{
                            fontSize: "12px",
                            fontFamily: "Menlo, Monaco, 'Courier New', monospace",
                            color: "var(--accent)",
                            background: "var(--chip-bg)",
                            border: "1px solid var(--chip-border)",
                            borderRadius: "5px",
                            padding: "1px 6px",
                          }}>
                            {ev.tool}
                          </code>
                          {inputStr && (
                            <span style={{ color: "var(--muted)", fontSize: "11px", marginLeft: "6px" }}>
                              ({inputStr})
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  }
                  if (ev.type === "tool_result") {
                    return (
                      <div key={i} style={{
                        marginLeft: "44px",
                        fontSize: "11px",
                        color: "var(--muted)",
                        fontVariantNumeric: "tabular-nums",
                      }}>
                        ↳ {(ev.chars ?? 0).toLocaleString()} chars received
                      </div>
                    );
                  }
                  return null;
                })}

                {isAnalyzing && currentStep && currentStep !== "complete" && (
                  <div style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    marginLeft: "26px", fontSize: "13px", color: "var(--accent)",
                  }}>
                    <span style={{
                      width: "7px", height: "7px", borderRadius: "50%",
                      background: "var(--accent)",
                      animation: "pulse 1.4s ease-in-out infinite",
                    }} />
                    Working…
                  </div>
                )}
              </div>
            </section>

            {/* Streaming analysis */}
            {analysis && (
              <section style={{ ...card, padding: "22px 24px" }}>
                <p style={eyebrowStyle}>Analysis</p>
                <div style={{
                  fontSize: "14px",
                  lineHeight: 1.75,
                  color: "var(--text)",
                  whiteSpace: "pre-wrap",
                }}>
                  {analysis}
                  {isAnalyzing && currentStep === "synthesizing" && (
                    <span style={{
                      display: "inline-block",
                      width: "8px",
                      height: "15px",
                      background: "var(--accent)",
                      marginLeft: "2px",
                      verticalAlign: "text-bottom",
                      animation: "pulse 1s ease-in-out infinite",
                    }} />
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        {/* ── About / How it works ─────────────────────── */}
        <section style={{ marginTop: "56px" }}>
          <p style={eyebrowStyle}>How it works</p>
          <h2 style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "24px",
            fontWeight: 400,
            color: "var(--text)",
            margin: "8px 0 6px",
          }}>
            Three agents, one answer
          </h2>
          <p style={{ fontSize: "14px", color: "var(--muted)", lineHeight: 1.7, margin: "0 0 28px" }}>
            Drop in any public GitHub repository URL and ask your question in plain
            English. A sequential pipeline of three AI agents handles the rest —
            no manual code reading required.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {PIPELINE_STAGES.map((stage, i) => (
              <div
                key={stage.label}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "16px",
                  ...card,
                  padding: "18px 20px",
                }}
              >
                <div style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "10px",
                  background: "var(--chip-bg)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "20px",
                  flexShrink: 0,
                }}>
                  {stage.icon}
                </div>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                    <span style={{
                      fontSize: "10px",
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--muted)",
                    }}>
                      Step {i + 1}
                    </span>
                    <span style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "var(--text)",
                    }}>
                      {stage.label}
                    </span>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
                    {stage.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div ref={bottomRef} />
      </div>

      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes pulse  { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
        * { box-sizing: border-box; }
        input, textarea, button { font-family: inherit; }
        input::placeholder, textarea::placeholder { color: var(--muted); opacity: 0.7; }
      `}</style>
    </main>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "var(--muted)",
  marginBottom: "8px",
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--muted)",
  margin: "0 0 14px",
};

function inputStyle(disabled: boolean): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    padding: "10px 14px",
    fontSize: "14px",
    color: "var(--text)",
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    outline: "none",
    opacity: disabled ? 0.5 : 1,
    transition: "box-shadow 0.15s",
  };
}
