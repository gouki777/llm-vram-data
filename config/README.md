# 模型配置与录入指南 (Config Guide)

本目录包含爬虫抓取的目标模型清单与人工修正配置。

---

## 1. `config/repos.json`：模型清单

定义需要爬取的大模型列表。格式为 JSON 数组。

### 示例格式：
```json
[
  {
    "id": "Qwen/Qwen3-32B",
    "family": "Qwen3",
    "quants": {
      "fp8": "Qwen/Qwen3-32B-FP8",
      "int4": "Qwen/Qwen3-32B-AWQ"
    }
  },
  {
    "id": "deepseek-ai/DeepSeek-V4-Flash",
    "family": "DeepSeek-V4"
  }
]
```

### 字段说明：
- `id`（必须）：Hugging Face 官方模型唯一标识符，格式为 `组织或作者/仓库名`。
  - 例如：`Qwen/Qwen3-8B`、`deepseek-ai/DeepSeek-V4-Flash`。
  - 请确保该模型在 Hugging Face 是公开可访问的，且仓库包含 `config.json` 和模型权重。
- `family`（必须）：模型家族名称，供前端页面分类筛选或分组展示。
  - 例如：`Qwen3`、`DeepSeek-V4`、`Llama-3.1`。
- `quants`（可选）：指定该模型在 Hugging Face 上的衍生量化版本仓库。
  - key 为量化精度名称（如 `fp8`、`int4`、`awq`、`gptq`）。
  - value 为对应的 Hugging Face 仓库 ID。
  - **若不确定量化仓库 ID，请直接省略 `quants`**，显存计算器前端会自动根据参数量与精度位数公式估算，无需也不应编造仓库名。

---

## 2. `config/overrides.json`：人工评测修正配置

当某个特殊架构大模型（例如 DeepSeek-V4 的 CSA/HCA 压缩注意力机制、特殊潜变量注意力等）无法直接通过 Hugging Face `config.json` 的通用 Transformer 公式计算显存，或者官方配置存在笔误时，可在本文件中配置人工实测值。

### 优先级：
`config/overrides.json` 中的字段**具有最高优先级**，在爬虫脚本抓取完成后会深度覆盖同名字段。

### 示例格式：
```json
{
  "deepseek-ai/DeepSeek-V4-Flash": {
    "override_kv_per_token_kb": null,
    "attention_type": "CSA/HCA",
    "note": "压缩注意力，KV 不能套标准公式，需人工填实测值"
  }
}
```

---

## 3. 本地验证录入配置

添加或修改配置后，在本地终端运行：
```bash
node scripts/crawl.mjs
```
查看控制台打印日志，确认新录入的模型抓取成功并生成在 `models.json` 中。
