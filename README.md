# vLLM Studio

Windows-first unified local AI workstation. Manage models, run chat/agent sessions, monitor performance — all through a local web UI.

> Fork of [sybil-solutions/vllm-studio](https://github.com/sybil-solutions/vllm-studio) with **Windows compatibility** and **llama.cpp** as the primary inference backend.

## Architecture

```
Controller (Bun/Hono :8080)  →  llama.cpp / vLLM / SGLang
Frontend   (Next.js   :3000)  →  Controller API
Agent      (Pi agent binary)  →  Controller proxy → Inference backend
```

| Component | Stack | Role |
|-----------|-------|------|
| **Controller** | Bun + Hono | Model lifecycle, OpenAI proxy, metrics, process management |
| **Frontend** | Next.js 16 | Dashboard, chat workspace, model browser, settings |
| **Agent** | `pi-coding-agent` | Coding agent with file system, browser, git tools |
| **Inference** | llama.cpp / vLLM | Model serving via OpenAI-compatible API |

## Features

- **Dashboard** — Real-time metrics (decode speed, TTFT, prefill), GPU utilization, model status
- **Agent Workspace** — Multi-pane chat with coding agent, file browser, git diff viewer, timeline
- **Model Management** — Recipe-based model config, GGUF auto-discovery, directory scanning
- **OpenAI Proxy** — `/v1/chat/completions`, tokenization, model listing with activation policy
- **Process Lifecycle** — Auto-launch models on request, switch on demand, GPU lease management
- **Remote Deploy** — SSH-based deployment to GPU servers (see `scripts/deploy-remote.sh`)

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) 1.3+
- [Node.js](https://nodejs.org) 20+ (for frontend)
- [llama.cpp](https://github.com/ggml-org/llama.cpp) server binary (`llama-server.exe` on Windows)
- GGUF model files (e.g. from Hugging Face)

### 1. Start the controller

```bash
cd controller
bun src/main.ts
```

The controller listens on `http://localhost:8080`. It manages model processes and proxies inference requests.

### 2. Start the frontend

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000` for the dashboard.

### 3. Load a model

1. Go to **Recipes** → **New Recipe**
2. Set backend to `llama.cpp`, point `model_path` to your `.gguf` file or directory
3. Save and launch from the recipe page
4. Or use the **Discover** page to auto-detect GGUF files on disk

### 4. Chat with the agent

Open the **Agent** workspace, select a model, and start chatting. The coding agent has access to file system, browser automation, and git diff tools.

## Configuration

Key environment variables (set in `.env.local` or system env):

| Variable | Default | Description |
|----------|---------|-------------|
| `VLLM_STUDIO_LLAMA_BIN` | *(auto)* | Path to `llama-server` binary |
| `VLLM_STUDIO_PI_BINARY` | *(auto)* | Path to Pi agent binary |
| `INFERENCE_PORT` | `8000` | Port for the inference backend |
| `OPENAI_MODEL_ACTIVATION_POLICY` | `load_if_idle` | `load_if_idle` or `switch_on_request` |

## Repository Layout

```
controller/        Bun/Hono backend — orchestration, proxy, metrics, process management
frontend/          Next.js app — dashboard, chat workspace, agent UI, settings
cli/               Bun CLI for controller access
config/            Runtime and integration configs
docs/              Documentation
scripts/           Deployment and operational scripts (remote deploy helpers)
```

## Health Checks

```bash
curl http://localhost:8080/status
curl -I http://localhost:3000
```

## License

Apache License 2.0
