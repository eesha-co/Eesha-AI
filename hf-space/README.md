---
title: Kimi K2.5 AI Coding Assistant
emoji: ⚡
colorFrom: purple
colorTo: blue
sdk: gradio
sdk_version: 5.34.2
app_file: app.py
pinned: false
license: mit
---

# Kimi K2.5 — AI Coding Assistant

Production AI coding assistant powered by **Kimi K2.5** (1.1T parameter MoE model) via **NVIDIA API**.

## Architecture

```
Gradio UI → OpenAI-compatible client → NVIDIA API → Kimi K2.5
```

The OpenAI Python library is used as the universal interface, making the backend **swappable in 5 seconds**:
- Change `base_url` to switch between NVIDIA, SiliconFlow, Moonshot, or local vLLM
- No agent logic changes required

## Features

- **Thinking Mode**: See Kimi K2.5's chain-of-thought reasoning before the answer
- **Streaming**: Real-time response streaming for both thinking and output
- **Coding Focus**: Optimized system prompt for software engineering tasks
- **Conversation Memory**: Full multi-turn conversation support
- **Error Handling**: Graceful handling of auth errors, rate limits, and server issues

## Setup

1. Go to your Space Settings → Variables and secrets → New secret
2. Name: `NVIDIA_API_KEY`
3. Value: Your NVIDIA API key from [build.nvidia.com](https://build.nvidia.com)

## Model Specs

| Spec | Value |
|------|-------|
| Parameters | 1.1 Trillion |
| Architecture | Mixture of Experts (384 experts) |
| Context Length | 262,144 tokens |
| Quantization | Native INT4 |
| Provider | NVIDIA H100 GPUs |

## Why NVIDIA API for Production

1. **Speed**: H100 GPUs generate tokens 10x faster than CPU-only hosting
2. **No Hardware Cost**: Free while in preview
3. **Scalability**: Upgrade API plan instead of buying GPUs
4. **Backend-Swappable**: Switch providers by changing `base_url`
