# Eesha AI

A full-stack AI coding platform powered by **Kimi K2.5** (1.1T parameter MoE model) via the NVIDIA API. Features a modern chat interface with workspace, code editor, and terminal capabilities.

## Features

- **AI Chat** — Powered by Kimi K2.5 with thinking mode (chain-of-thought reasoning)
- **Workspace** — File explorer with code editor for managing project files
- **Terminal** — Integrated terminal for running commands
- **Streaming** — Real-time streaming responses with reasoning visualization
- **Dark Theme** — Modern UI inspired by ChatGPT, Grok, and Gemini
- **Persistent Storage** — Supabase PostgreSQL for conversation history

## Tech Stack

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Prisma ORM
- **AI**: Kimi K2.5 via NVIDIA API (OpenAI-compatible)
- **Database**: Supabase PostgreSQL with Prisma

## Getting Started

### Prerequisites

- Node.js 18+
- npm or bun
- NVIDIA API key (get one at [build.nvidia.com](https://build.nvidia.com))
- Supabase account (free at [supabase.com](https://supabase.com))

### 1. Set Up Supabase Database

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project (pick a name and a strong database password)
3. Wait for the project to provision (~2 minutes)
4. Go to **Settings → Database**
5. Scroll down to **Connection string** → Copy both URLs:
   - **Connection pooling** URL (port 6543) → this is your `DATABASE_URL`
   - **Direct connection** URL (port 5432) → this is your `DIRECT_URL`
6. Replace `[YOUR-PASSWORD]` in both URLs with your actual database password

### 2. Install & Configure

```bash
# Clone the repository
git clone https://github.com/eesha000009-dev/Eesha-AI.git
cd Eesha-AI

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your NVIDIA_API_KEY, DATABASE_URL, and DIRECT_URL

# Push database schema to Supabase
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
| `DATABASE_URL` | Supabase pooled connection string (port 6543) | Yes |
| `DIRECT_URL` | Supabase direct connection string (port 5432) | Yes |
| `WORKSPACE_ROOT` | Root directory for file operations | No (default provided) |

## Deploy on Vercel

1. Push your code to GitHub
2. Import the repo on [vercel.com](https://vercel.com)
3. Add all environment variables from the table above
4. Set build command to: `npx prisma db push && next build`
5. Deploy!

## AI Backend

The AI backend is deployed separately on [Hugging Face Spaces](https://huggingface.co/spaces/fuhaddesmond/kimi-k25-coding-platform) as a Gradio app that uses the NVIDIA API for inference.

## License

MIT
