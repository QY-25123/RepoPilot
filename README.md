# GitHub Repo Analyzer

AI-powered tool that analyzes any GitHub repository using a sequential multi-agent pipeline. Enter a repo URL and a question — the system fetches live data via the official GitHub MCP server and streams a comprehensive answer back to you.

## How it works

Three agents run in sequence, each building on the previous one's output:

```
User (repo URL + goal)
        │
        ▼
┌───────────────────┐
│  Agent 1: Planner │  Decides what to look at
└────────┬──────────┘
         │ research plan
         ▼
┌──────────────────────┐
│  Agent 2: Researcher │  Calls GitHub MCP tools to fetch data
│  (tool-use loop)     │  files, commits, PRs, issues, branches…
└────────┬─────────────┘
         │ gathered data
         ▼
┌─────────────────────────┐
│  Agent 3: Synthesizer   │  Streams the final analysis
│  (adaptive thinking)    │
└─────────────────────────┘
         │
         ▼
   Streamed markdown answer
```

All three agents use `claude-opus-4-8`. The synthesizer uses adaptive thinking for higher-quality output.

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, Server-Sent Events |
| AI | Anthropic API (`claude-opus-4-8`) |
| Repo data | [GitHub MCP server](https://github.com/github/github-mcp-server) (official, stdio transport) |
| Frontend | Next.js 15, TypeScript, Tailwind CSS |
| Backend hosting | Google Cloud Run |
| Frontend hosting | Vercel |

## Project structure

```
github_analyze2/
├── backend/
│   ├── main.py          # FastAPI app — POST /analyze (SSE stream), GET /health
│   ├── pipeline.py      # Orchestrates the 3-agent sequence
│   ├── agents.py        # planner_agent / researcher_agent / synthesizer_agent
│   ├── mcp_client.py    # Spawns github-mcp-server subprocess, wraps MCP calls
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
└── frontend/
    ├── app/
    │   ├── page.tsx     # Main UI: form + live agent progress + streamed analysis
    │   ├── layout.tsx
    │   └── globals.css
    ├── package.json
    └── .env.example
```

## Local development

### Prerequisites

- Python 3.12+
- Node.js 18+
- `github-mcp-server` binary — download from [github/github-mcp-server releases](https://github.com/github/github-mcp-server/releases) and place it somewhere on your `PATH`
- A GitHub personal access token (scope: `public_repo`)
- An Anthropic API key

### Backend

```bash
cd backend
cp .env.example .env
# Fill in GITHUB_TOKEN and ANTHROPIC_API_KEY in .env

pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8080

npm install
npm run dev
```

Open `http://localhost:3000`.

## Deployment

### Backend → Google Cloud Run

```bash
cd backend

# Build and push the image (Dockerfile downloads the MCP binary automatically)
docker build -t gcr.io/<YOUR_PROJECT>/gh-analyzer .
docker push gcr.io/<YOUR_PROJECT>/gh-analyzer

# Deploy
gcloud run deploy gh-analyzer \
  --image gcr.io/<YOUR_PROJECT>/gh-analyzer \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars GITHUB_TOKEN=<token>,ANTHROPIC_API_KEY=<key>
```

### Frontend → Vercel

```bash
cd frontend
vercel deploy
```

In your Vercel project settings, add the environment variable:
```
NEXT_PUBLIC_API_URL=https://<your-cloud-run-url>
```

## GitHub MCP tools used

| Tool | Purpose |
|---|---|
| `get_file_contents` | Read files (README, configs, source) |
| `get_repository_tree` | Explore directory structure |
| `list_commits` | Browse recent commit history |
| `list_branches` | See branch layout |
| `list_pull_requests` | Inspect PR activity |
| `list_issues` | Review open/closed issues |
| `search_code` | Find specific patterns in code |

## Environment variables

**Backend**

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | GitHub PAT with `public_repo` scope |
| `ANTHROPIC_API_KEY` | Anthropic API key |

**Frontend**

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL of the deployed backend |
