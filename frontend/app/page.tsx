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
  usage?: { input_tokens: number; output_tokens: number };
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
    description: "Maps what to investigate based on your question",
  },
  {
    icon: "🔍",
    label: "Research",
    description: "Pulls commits, files, PRs & code via GitHub MCP",
  },
  {
    icon: "✍️",
    label: "Synthesize",
    description: "Writes your answer with Claude's extended thinking",
  },
];

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
    <main className="min-h-screen bg-rose-50 dark:bg-rose-ground-dark text-rose-950 dark:text-rose-50">

      {/* ── Hero ─────────────────────────────────────────── */}
      <header className="border-b border-rose-200 dark:border-rose-tint-dark bg-white/70 dark:bg-rose-surface-dark/70 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-rose-400 dark:text-rose-500 mb-5">
            Multi-Agent AI · GitHub MCP · Claude Opus
          </p>
          <h1
            className="font-serif text-5xl sm:text-6xl font-normal leading-tight text-rose-950 dark:text-rose-50 mb-5"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            Understand any repo
            <br />
            <em className="text-rose-600 dark:text-rose-400 not-italic">in minutes</em>
          </h1>
          <p
            className="text-rose-700 dark:text-rose-300 text-base sm:text-lg leading-relaxed max-w-md mx-auto"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            Paste a GitHub URL, ask your question — three AI agents collaborate
            to research the codebase and write a thorough answer for you.
          </p>

          {/* Pipeline diagram */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mt-10">
            {PIPELINE_STAGES.map((stage, i) => (
              <div key={stage.label} className="flex items-center gap-2">
                <div className="bg-white dark:bg-rose-tint-dark border border-rose-200 dark:border-rose-rim-dark rounded-xl px-5 py-4 w-44 text-center shadow-sm shadow-rose-100 dark:shadow-none">
                  <div className="text-2xl mb-1.5">{stage.icon}</div>
                  <div className="text-sm font-semibold text-rose-900 dark:text-rose-100 mb-1">
                    {stage.label}
                  </div>
                  <div className="text-[11px] leading-snug text-rose-500 dark:text-rose-400">
                    {stage.description}
                  </div>
                </div>
                {i < PIPELINE_STAGES.length - 1 && (
                  <span className="text-rose-300 dark:text-rose-700 text-lg hidden sm:block select-none">
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">

        {/* Input form */}
        <section className="bg-white dark:bg-rose-surface-dark border border-rose-200 dark:border-rose-tint-dark rounded-2xl p-6 space-y-5 shadow-sm shadow-rose-100 dark:shadow-none">
          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-rose-400 dark:text-rose-500 mb-2">
              Repository URL
            </label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && analyze()}
              placeholder="https://github.com/owner/repo"
              disabled={isAnalyzing}
              className="w-full bg-rose-50 dark:bg-rose-tint-dark border border-rose-200 dark:border-rose-rim-dark rounded-lg px-4 py-2.5 text-rose-950 dark:text-rose-50 placeholder-rose-300 dark:placeholder-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-400 dark:focus:ring-rose-500 disabled:opacity-50 text-sm transition-shadow"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold tracking-widest uppercase text-rose-400 dark:text-rose-500 mb-2">
              Your Question
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What would you like to know about this repository?"
              rows={3}
              disabled={isAnalyzing}
              className="w-full bg-rose-50 dark:bg-rose-tint-dark border border-rose-200 dark:border-rose-rim-dark rounded-lg px-4 py-2.5 text-rose-950 dark:text-rose-50 placeholder-rose-300 dark:placeholder-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-400 dark:focus:ring-rose-500 resize-none disabled:opacity-50 text-sm transition-shadow"
            />
            <div className="flex flex-wrap gap-2 mt-2.5">
              {EXAMPLE_GOALS.map((eg) => (
                <button
                  key={eg}
                  onClick={() => setGoal(eg)}
                  disabled={isAnalyzing}
                  className="text-[11px] text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 bg-rose-50 dark:bg-rose-tint-dark hover:bg-rose-100 dark:hover:bg-rose-rim-dark border border-rose-200 dark:border-rose-rim-dark px-2.5 py-1 rounded-full transition-colors disabled:opacity-40"
                >
                  {eg}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={analyze}
            disabled={!canSubmit}
            className="w-full py-3 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 disabled:bg-rose-200 dark:disabled:bg-rose-tint-dark disabled:text-rose-400 dark:disabled:text-rose-700 text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-rose-surface-dark"
          >
            {isAnalyzing ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Analyzing…
              </span>
            ) : (
              "Analyze Repository"
            )}
          </button>
        </section>

        {/* Error */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl p-4 text-red-700 dark:text-red-300 text-sm">
            <strong className="font-semibold">Error:</strong> {error}
          </div>
        )}

        {/* Pipeline progress + output */}
        {hasOutput && (
          <div className="space-y-4">

            {/* Agent steps */}
            <section className="bg-white dark:bg-rose-surface-dark border border-rose-200 dark:border-rose-tint-dark rounded-2xl p-5 shadow-sm shadow-rose-100 dark:shadow-none">
              <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-rose-400 dark:text-rose-500 mb-4">
                Agent Pipeline
              </p>
              <div className="space-y-3">
                {events.map((ev, i) => {
                  if (ev.type === "status") {
                    return (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <span className="text-base leading-none mt-0.5">
                          {STEP_ICONS[ev.step ?? ""] ?? "⚙️"}
                        </span>
                        <span className="text-rose-800 dark:text-rose-200">{ev.message}</span>
                      </div>
                    );
                  }
                  if (ev.type === "plan") {
                    return (
                      <div key={i} className="ml-7 space-y-1.5">
                        <p className="text-[10px] font-semibold tracking-widest uppercase text-rose-400 dark:text-rose-500">
                          Research plan
                        </p>
                        <pre className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-tint-dark border border-rose-100 dark:border-rose-rim-dark rounded-lg p-3 whitespace-pre-wrap leading-relaxed overflow-x-auto">
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
                      <div key={i} className="flex items-start gap-3 text-sm ml-7">
                        <span className="text-rose-300 dark:text-rose-700 shrink-0 mt-0.5">›</span>
                        <span>
                          <code className="text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-tint-dark border border-rose-100 dark:border-rose-rim-dark px-1.5 py-0.5 rounded text-xs font-mono">
                            {ev.tool}
                          </code>
                          {inputStr && (
                            <span className="text-rose-400 dark:text-rose-600 text-xs ml-1.5">
                              ({inputStr})
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  }
                  if (ev.type === "tool_result") {
                    return (
                      <div key={i} className="flex items-start gap-3 text-xs ml-10 text-rose-400 dark:text-rose-600">
                        <span className="tabular-nums">↳ {(ev.chars ?? 0).toLocaleString()} chars received</span>
                      </div>
                    );
                  }
                  return null;
                })}

                {isAnalyzing && currentStep && currentStep !== "complete" && (
                  <div className="flex items-center gap-2 text-sm text-rose-500 dark:text-rose-400 ml-7">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 dark:bg-rose-500 animate-pulse" />
                    <span>Working…</span>
                  </div>
                )}
              </div>
            </section>

            {/* Streaming analysis */}
            {analysis && (
              <section className="bg-white dark:bg-rose-surface-dark border border-rose-200 dark:border-rose-tint-dark rounded-2xl p-5 shadow-sm shadow-rose-100 dark:shadow-none">
                <p className="text-[10px] font-semibold tracking-[0.2em] uppercase text-rose-400 dark:text-rose-500 mb-4">
                  Analysis
                </p>
                <div className="text-rose-900 dark:text-rose-100 text-sm leading-relaxed whitespace-pre-wrap">
                  {analysis}
                  {isAnalyzing && currentStep === "synthesizing" && (
                    <span className="inline-block w-2 h-4 bg-rose-400 ml-0.5 align-text-bottom animate-pulse" />
                  )}
                </div>
              </section>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </main>
  );
}
