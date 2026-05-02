# 🧬 LLM Model Merger

Merge Large Language Models using [mergekit](https://github.com/arcee-ai/mergekit), following the techniques from the [HuggingFace merge blog](https://huggingface.co/blog/mlabonne/merge-models).

## The Soul Architecture

This project implements a **three-soul merge** — combining the strengths of different models into one:

| Soul | Role | Original Model | Practical Model |
|------|------|---------------|-----------------|
| 🧠 **The Spine** | Base intelligence & long-term memory | GLM-5 (754 GB) | Qwen2.5-0.5B |
| ⚡ **The Wit** | Quick banter, snappy responses, humor | Qwen3-14B (30 GB) | Qwen2.5-0.5B-Instruct |
| 💜 **The Empathy** | Emotional understanding & support | MiniMax-M2.7 (229 GB) | TiTan-Qwen2.5-0.5B |

## Why Different Models?

The original three models (GLM-5, Qwen3-14B, MiniMax-M2.7) have **incompatible architectures**:

| Model | Architecture | hidden_size | Layers | Size |
|-------|-------------|-------------|--------|------|
| GLM-5 | GlmMoeDsa (MoE) | 6144 | 78 | 754 GB |
| Qwen3-14B | Qwen3 | 5120 | 40 | 30 GB |
| MiniMax-M2.7 | MiniMaxM2 | 3072 | 62 | 229 GB |

**Mergekit requires compatible architectures** (same hidden_size, same layer structure). The practical models all share the `qwen2` architecture with `hidden_size=896` and 24 layers.

## Quick Start

```bash
# Install mergekit
pip install mergekit

# Run the DARE-TIES merge (recommended)
python3 scripts/merge.py --method dare_ties

# Or try SLERP
python3 scripts/merge.py --method slerp

# Or try passthrough (layer stacking)
python3 scripts/merge.py --method passthrough
```

## Merge Methods

### 1. DARE-TIES (Recommended)
Combines multiple models by:
- **DARE**: Randomly pruning fine-tuned weights, keeping only significant changes
- **TIES**: Resolving sign conflicts between models using majority voting
- Best for combining 3+ models with different expertise

### 2. SLERP
Smoothly interpolates between two models:
- Maintains geometric properties of weight space
- Per-layer control: attention layers lean one way, MLP layers another
- Best for 2-model blending with fine-grained control

### 3. Passthrough (Frankenstein)
Stacks layers from different models:
- Creates a deeper model than either parent
- Bottom layers = base intelligence, top layers = personality
- Most experimental approach

## Project Structure

```
├── configs/
│   ├── dream_merge.yaml              # Target config (incompatible models)
│   ├── practical_merge_dare_ties.yaml # Working DARE-TIES config
│   ├── practical_merge_slerp.yaml     # Working SLERP config
│   └── practical_merge_passthrough.yaml # Working passthrough config
├── scripts/
│   └── merge.py                       # Main merge runner
├── output/                            # Merged model output
└── docs/
    └── MERGE_GUIDE.md                 # This file
```

## Making the Dream Merge Work

To merge GLM-5 + Qwen3-14B + MiniMax-M2.7, you would need:

1. **Unified Architecture**: Reimplement all three with the same base (e.g., all as Qwen3-14B)
2. **Projection Layers**: Add adapter layers to map between different hidden sizes
3. **Knowledge Distillation**: Train a single model to mimic all three
4. **Ensemble Approach**: Route queries to different models based on intent (no actual merging)

## References

- [Merge Large Language Models with mergekit](https://huggingface.co/blog/mlabonne/merge-models)
- [mergekit GitHub](https://github.com/arcee-ai/mergekit)
- [TIES Paper](https://arxiv.org/abs/2306.01708)
- [DARE Paper](https://arxiv.org/abs/2311.03099)
