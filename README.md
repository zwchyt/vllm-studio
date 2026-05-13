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
bun install
bun src/main.ts
```

The controller listens on `http://localhost:8080`. It manages model processes and proxies inference requests.

### 2. Start the frontend

```bash
cd frontend
bun install
npm run dev
```

Open egde Browser `http://localhost:3000` for the dashboard.

### 3. Load a model

Create a `models\` folder on the drive root (outside the project directory), with one subfolder per model:

```
E:\                          ← E drive root
├── models\                  ← create this folder
│   ├── Qwen-7B-Q4_K_M\     ← one folder per model
│   │   └── Qwen-7B-Q4_K_M.gguf
│   ├── DeepSeek-R1-Q4_K_M\
│   │   └── DeepSeek-R1-Q4_K_M.gguf
│   └── ...
└── vllm-studio\             ← project root
    ├── controller\
    ├── frontend\
    ├── scripts\
    └── ...
```

> The controller will auto-resolve a directory containing exactly one `.gguf` file, so you only need to point `model_path` to the model's folder.

Then create a recipe to register the model with the system:

1. Go to **Recipes** → **New Recipe**
2. **Name**: e.g. `Qwen 7B`
3. **Backend**: select `llama.cpp`
4. **Model Path**: point to the model's folder
   - Example: `E:\models\Qwen-7B-Q4_K_M\`
   - Or directly to the `.gguf` file: `E:\models\Qwen-7B-Q4_K_M\Qwen-7B-Q4_K_M.gguf`
5. **Served Model Name**: optional display name for the model
6. Save the recipe, then click **Launch** on the recipe page

Alternatively, use the **Discover** page to auto-scan a directory and create recipes for all detected GGUF files at once.

### 4. Chat with the agent

Open the **Agent** workspace, select a model, and start chatting. The coding agent has access to file system, browser automation, and git diff tools.

## Configuration

Create a `.env` file in the project `controller` directory and edit it as needed:

```bash
# Default configuration: VLLM_STUDIO_LLAMA_BIN = your llama-server.exe file path
.env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `VLLM_STUDIO_LLAMA_BIN` | *(auto)* | Path to `llama-server.exe` binary. Set if not on PATH. |
| `VLLM_STUDIO_PI_BINARY` | *(auto)* | Path to Pi agent binary (`pi.cmd`). |
| `VLLM_STUDIO_HOST` | `127.0.0.1` | Controller bind address |
| `VLLM_STUDIO_PORT` | `8080` | Controller port |
| `VLLM_STUDIO_INFERENCE_PORT` | `8000` | Port for the inference backend |
| `VLLM_STUDIO_MODELS_DIR` | `/models` | Default directory for model scanning |
| `VLLM_STUDIO_DATA_DIR` | `./data` | Data directory for recipes, chat history |
| `VLLM_STUDIO_MOCK_INFERENCE` | *(unset)* | Set `true` for testing without a real model |
| `OPENAI_MODEL_ACTIVATION_POLICY` | `load_if_idle` | `load_if_idle` or `switch_on_request` |

> **Note for Windows**: All paths in `.env` should use Windows format, e.g. `VLLM_STUDIO_LLAMA_BIN = your llama-server.exe file path`.

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
