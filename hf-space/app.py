import gradio as gr
from openai import OpenAI
import os

# ──────────────────────────────────────────────────────────────
# Kimi K2.5 Production AI Coding Assistant
# Architecture: OpenAI-compatible client → NVIDIA API → Kimi K2.5
# ──────────────────────────────────────────────────────────────

# Initialize the OpenAI-compatible client pointing at NVIDIA's inference servers.
# This keeps your agent "backend-swappable" — change base_url to switch providers
# (NVIDIA → SiliconFlow → Moonshot → local vLLM) without rewriting any logic.
client = OpenAI(
    base_url="https://integrate.api.nvidia.com/v1",
    api_key=os.getenv("NVIDIA_API_KEY")
)

MODEL_ID = "moonshotai/kimi-k2.5"

SYSTEM_PROMPT = """You are Kimi K2.5, an advanced AI coding assistant built by Moonshot AI.
You are an expert in software engineering across all programming languages and frameworks.

Your capabilities include:
- Writing, reviewing, and debugging code in any language
- Explaining complex programming concepts clearly
- Suggesting best practices, design patterns, and architectural decisions
- Analyzing code for performance, security, and maintainability
- Generating complete applications, APIs, and systems
- Helping with DevOps, databases, cloud infrastructure, and more

When writing code:
- Always use proper code blocks with language identifiers
- Include comments for complex logic
- Follow language-specific conventions and best practices
- Provide complete, runnable code when possible
- Suggest tests when appropriate

When explaining:
- Be thorough but concise
- Use examples to illustrate concepts
- Break complex topics into digestible parts
- Reference relevant documentation or standards when helpful

Be direct, accurate, and helpful. If you're unsure about something, say so rather than guessing."""


def respond(message, chat_history, enable_thinking):
    """
    Stream a response from Kimi K2.5 via NVIDIA API.
    Uses Gradio's standard streaming chatbot pattern.
    """
    if not message.strip():
        yield message, chat_history
        return

    # Build conversation history in OpenAI message format
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    # chat_history is a list of [user_msg, assistant_msg] pairs
    for pair in chat_history:
        if len(pair) >= 2 and pair[0] and pair[1]:
            messages.append({"role": "user", "content": pair[0]})
            messages.append({"role": "assistant", "content": pair[1]})

    messages.append({"role": "user", "content": message})

    # Add user message to chat history immediately
    chat_history.append([message, ""])

    try:
        # Call NVIDIA's OpenAI-compatible streaming endpoint
        kwargs = {
            "model": MODEL_ID,
            "messages": messages,
            "stream": True,
            "temperature": 1.0,
            "top_p": 1.0,
            "max_tokens": 16384,
        }

        if enable_thinking:
            kwargs["extra_body"] = {"chat_template_kwargs": {"thinking": True}}

        stream = client.chat.completions.create(**kwargs)

        thinking_content = ""
        response_content = ""
        in_thinking_phase = False
        thinking_finished = False

        for chunk in stream:
            if not chunk.choices:
                continue

            delta = chunk.choices[0].delta

            # Handle thinking/reasoning content
            if hasattr(delta, "reasoning_content") and delta.reasoning_content:
                if not in_thinking_phase:
                    in_thinking_phase = True
                thinking_content += delta.reasoning_content

                # Show thinking phase in the chat
                display = f"🧠 **Thinking...**\n\n{thinking_content}"
                chat_history[-1][1] = display
                yield "", chat_history

            # Handle regular content
            if delta.content:
                if in_thinking_phase and not thinking_finished:
                    thinking_finished = True
                    in_thinking_phase = False

                response_content += delta.content

                if thinking_content:
                    display = (
                        f"<details><summary>🧠 Reasoning (click to expand)</summary>\n\n"
                        f"{thinking_content}\n\n</details>\n\n"
                        f"{response_content}"
                    )
                else:
                    display = response_content

                chat_history[-1][1] = display
                yield "", chat_history

        # Final output — make sure something is there
        if not chat_history[-1][1]:
            if thinking_content:
                chat_history[-1][1] = f"🧠 **Reasoning:**\n\n{thinking_content}"
            else:
                chat_history[-1][1] = "No response received. Please try again."

        yield "", chat_history

    except Exception as e:
        error_msg = str(e)
        if "401" in error_msg or "auth" in error_msg.lower():
            chat_history[-1][1] = "❌ **Authentication Error**: NVIDIA_API_KEY is missing or invalid. Set it in Space Secrets."
        elif "429" in error_msg:
            chat_history[-1][1] = "❌ **Rate Limit**: Too many requests. Wait a moment and try again."
        elif "500" in error_msg or "502" in error_msg or "503" in error_msg:
            chat_history[-1][1] = "❌ **Server Error**: NVIDIA API temporarily unavailable. Try again shortly."
        else:
            chat_history[-1][1] = f"❌ **Error**: {error_msg}"
        yield "", chat_history


# ──────────────────────────────────────────────────────────────
# Gradio UI — Production Coding Assistant Interface
# ──────────────────────────────────────────────────────────────

with gr.Blocks(
    theme=gr.themes.Soft(
        primary_hue="violet",
        secondary_hue="cyan",
        neutral_hue="zinc",
        font=gr.themes.GoogleFont("Inter"),
    ),
    css="""
        footer { display: none !important; }
    """,
    title="Kimi K2.5 — AI Coding Assistant",
) as demo:

    gr.HTML("""
        <div style="text-align: center; padding: 24px 0 16px 0;">
            <div style="display: inline-flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                <div style="width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #7c3aed, #06b6d4); display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 0 24px rgba(139,92,246,0.3);">⚡</div>
                <div style="text-align: left;">
                    <h1 style="margin: 0; font-size: 28px; font-weight: 700; background: linear-gradient(135deg, #a78bfa, #22d3ee); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">Kimi K2.5</h1>
                    <p style="margin: 0; font-size: 13px; color: #71717a;">AI Coding Assistant • Powered by NVIDIA H100s</p>
                </div>
            </div>
            <div style="display: flex; gap: 12px; justify-content: center; margin-top: 12px; flex-wrap: wrap;">
                <span style="padding: 4px 12px; border-radius: 9999px; background: rgba(139,92,246,0.1); border: 1px solid rgba(139,92,246,0.2); font-size: 11px; color: #a78bfa;">1.1T Parameters</span>
                <span style="padding: 4px 12px; border-radius: 9999px; background: rgba(34,211,238,0.1); border: 1px solid rgba(34,211,238,0.2); font-size: 11px; color: #22d3ee;">384 MoE Experts</span>
                <span style="padding: 4px 12px; border-radius: 9999px; background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.2); font-size: 11px; color: #34d399;">262K Context</span>
                <span style="padding: 4px 12px; border-radius: 9999px; background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.2); font-size: 11px; color: #fbbf24;">Thinking Mode</span>
            </div>
        </div>
    """)

    enable_thinking = gr.Checkbox(
        value=True,
        label="🧠 Enable Thinking Mode (chain-of-thought reasoning)",
        info="When enabled, Kimi K2.5 shows its reasoning process before answering."
    )

    chatbot = gr.Chatbot(
        height=500,
        show_copy_button=True,
    )

    with gr.Row():
        msg_input = gr.Textbox(
            scale=9,
            placeholder="Ask Kimi K2.5 to write, debug, explain, or review code...",
            show_label=False,
            lines=2,
            max_lines=6,
        )
        submit_btn = gr.Button("Send", scale=1, variant="primary")

    gr.Examples(
        examples=[
            "Build a REST API with authentication in Node.js",
            "Debug this Python function returning wrong results",
            "Refactor my React component for better performance",
            "Explain how async/await works in Rust",
            "Design a database schema for an e-commerce platform",
            "Write a CLI tool in Go that parses CSV files",
        ],
        inputs=msg_input,
        label="Try these examples",
    )

    gr.HTML("""
        <div style="text-align: center; padding: 12px 0; color: #52525b; font-size: 11px;">
            Kimi K2.5 can make mistakes. Review generated code carefully before using in production.
            <br>Backend-swappable: NVIDIA → SiliconFlow → Moonshot — change base_url in 5 seconds.
        </div>
    """)

    # Wire up the chat using Gradio's standard streaming pattern
    msg_input.submit(
        respond,
        inputs=[msg_input, chatbot, enable_thinking],
        outputs=[msg_input, chatbot],
    )
    submit_btn.click(
        respond,
        inputs=[msg_input, chatbot, enable_thinking],
        outputs=[msg_input, chatbot],
    )


if __name__ == "__main__":
    demo.launch()
