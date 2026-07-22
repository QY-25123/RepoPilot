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

export default function Home() {
  const [repoUrl, setRepoUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [githubToken, setGithubToken] = useState("");
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
        body: JSON.stringify({
          repo_url: repoUrl,
          goal,
          github_token: githubToken || undefined,
        }),
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
    <main className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-4xl mx-auto px-4 py-12 space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-white mb-2">GitHub Repo Analyzer</h1>
          <p className="text-gray-400">
            Sequential multi-agent AI analysis powered by GitHub MCP + Claude
          </p>
        </div>

        {/* Input form */}
        <section className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              GitHub Repository URL
            </label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && canSubmit && analyze()}
              placeholder="https://github.com/owner/repo"
              disabled={isAnalyzing}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Your question / goal
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What would you like to know about this repository?"
              rows={3}
              disabled={isAnalyzing}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:opacity-50"
            />
            <div className="flex flex-wrap gap-2 mt-2">
              {EXAMPLE_GOALS.map((eg) => (
                <button
                  key={eg}
                  onClick={() => setGoal(eg)}
                  disabled={isAnalyzing}
                  className="text-xs text-blue-400 hover:text-blue-300 bg-blue-950 hover:bg-blue-900 px-2 py-1 rounded transition-colors disabled:opacity-40"
                >
                  {eg}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              GitHub Token{" "}
              <span className="text-gray-500 text-xs font-normal">
                (optional if GITHUB_TOKEN is set on server)
              </span>
            </label>
            <input
              type="password"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
              placeholder="ghp_..."
              disabled={isAnalyzing}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>

          <button
            onClick={analyze}
            disabled={!canSubmit}
            className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Pipeline progress + output */}
        {hasOutput && (
          <div className="space-y-4">
            {/* Agent steps */}
            <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
                Agent Pipeline
              </h2>
              <div className="space-y-2.5">
                {events.map((ev, i) => {
                  if (ev.type === "status") {
                    return (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        <span className="text-base leading-tight">
                          {STEP_ICONS[ev.step ?? ""] ?? "⚙️"}
                        </span>
                        <span className="text-gray-300">{ev.message}</span>
                      </div>
                    );
                  }
                  if (ev.type === "plan") {
                    return (
                      <div key={i} className="ml-7 space-y-1">
                        <p className="text-xs text-gray-500 font-medium">Research plan</p>
                        <pre className="text-xs text-gray-400 bg-gray-800 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">
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
                        <span className="text-gray-500 shrink-0">›</span>
                        <span className="text-gray-400">
                          <code className="text-blue-400 bg-blue-950 px-1 py-0.5 rounded text-xs">
                            {ev.tool}
                          </code>
                          {inputStr && (
                            <span className="text-gray-600 text-xs"> ({inputStr})</span>
                          )}
                        </span>
                      </div>
                    );
                  }
                  if (ev.type === "tool_result") {
                    return (
                      <div key={i} className="flex items-start gap-3 text-xs ml-9 text-gray-600">
                        <span>↳ received {(ev.chars ?? 0).toLocaleString()} chars</span>
                      </div>
                    );
                  }
                  return null;
                })}

                {isAnalyzing && currentStep && currentStep !== "complete" && (
                  <div className="flex items-center gap-2 text-sm text-blue-400 ml-7">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    <span>Working…</span>
                  </div>
                )}
              </div>
            </section>

            {/* Streaming analysis */}
            {analysis && (
              <section className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
                  Analysis
                </h2>
                <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {analysis}
                  {isAnalyzing && currentStep === "synthesizing" && (
                    <span className="inline-block w-2 h-4 bg-blue-400 ml-0.5 align-text-bottom animate-pulse" />
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
