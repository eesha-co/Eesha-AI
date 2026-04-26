# Eesha AI

A full-stack AI coding platform powered by **Kimi K2.5** (1.1T parameter MoE model) via the NVIDIA API. Features a modern chat interface with workspace, code editor, and terminal capabilities.

## Features

- **AI Chat** — Powered by Kimi K2.5 with thinking mode (chain-of-thought reasoning)
- **Workspace** — File explorer with code editor for managing project files
- **Terminal** — Integrated terminal for running commands
- **Streaming** — Real-time streaming responses with reasoning visualization
- **Dark Theme** — Modern UI inspired by ChatGPT, Grok, and Gemini
- **Persistent Storage** — SQLite database for conversation history

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Prisma ORM
- **AI**: Kimi K2.5 via NVIDIA API (OpenAI-compatible)
- **Database**: SQLite with Prisma

## Getting Started

### Prerequisites

- Node.js 18+
- npm or bun
- NVIDIA API key (get one at [build.nvidia.com](https://build.nvidia.com))

### Installation

```bash
# Clone the repository
git clone https://github.com/eesha000009-dev/Eesha-AI.git
cd Eesha-AI

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your NVIDIA_API_KEY

# Initialize the database
npx prisma db push

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NVIDIA_API_KEY` | Your NVIDIA API key | Yes |
| `NVIDIA_BASE_URL` | NVIDIA API base URL | Yes |
| `DATABASE_URL` | SQLite database path | No (default provided) |
| `WORKSPACE_ROOT` | Root directory for file operations | No (default provided) |

## AI Backend

The AI backend is deployed separately on [Hugging Face Spaces](https://huggingface.co/spaces/fuhaddesmond/kimi-k25-coding-platform) as a Gradio app that uses the NVIDIA API for inference.

## License

MIT
