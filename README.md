# llm-vram-data

开源大语言模型（LLM）显存估算与结构参数自动爬虫数据仓库。

本项目每日通过 GitHub Actions 定时从 Hugging Face API 抓取开源大模型的参数量、结构超参数（网络层数、KV 头数、Attention 维度、MLA Rank）以及各精度权重文件（Safetensors、GGUF、AWQ 等）的实测物理体积，自动产出根目录下的静态数据文件 `models.json`，供显存计算器（如 VRAM Calculator、推理选型网站）直接通过 GitHub Raw CDN 读取消费。

> **本项目定位**：纯数据仓库，不含网页前端。基于 Node.js 20 原生内置能力构建，无任何外部 npm 依赖或 Python 环境。

---

## 📡 生产数据读取地址

外部网站或应用可以直接通过 GitHub Raw CDN 获取最新的模型参数数据：

```text
https://raw.githubusercontent.com/<你的GitHub用户名>/llm-vram-data/main/models.json
```

*(使用时请将 `<你的GitHub用户名>` 替换为实际的 GitHub 用户名或组织名)*

---

## 📁 目录结构

```text
llm-vram-data/
├── .github/
│   └── workflows/
│       └── crawl.yml          # GitHub Actions 每日定时与手动触发工作流
├── config/
│   ├── repos.json             # 需抓取的模型列表（人工维护）
│   └── overrides.json         # 人工评测/修正值（人工维护，优先级最高）
├── scripts/
│   └── crawl.mjs              # 爬虫主程序（纯 Node.js 20 ESM）
├── models.json                # 爬虫数据产物（自动生成，放于根目录）
└── README.md                  # 中文使用文档与字段规范说明
```

---

## 🛠️ GitHub Actions 自动化配置指引

为了让仓库能够每天 UTC 02:00 自动运行爬虫并将更新后的 `models.json` 推送回仓库，需要完成以下两项 GitHub 设置：

### 1. 开启 Actions 读写权限（必须）

GitHub Actions 默认的 `GITHUB_TOKEN` 只有只读权限，需开启写权限以便自动提交更改：
1. 进入本仓库页面，点击顶部 **Settings**。
2. 在左侧菜单点击 **Actions** -> **General**。
3. 滑动至底部 **Workflow permissions** 区域。
4. 勾选 **Read and write permissions**。
5. 点击 **Save** 保存。

### 2. 配置 Hugging Face Access Token（强烈推荐）

Hugging Face 对未认证请求有严格的 IP 速率限制，配置 Token 可大幅提高请求成功率与速率上限：
1. 前往 [Hugging Face Access Tokens 页面](https://huggingface.co/settings/tokens) 创建一个 Token（**Role 选择 Read 即可**）。
2. 进入本 GitHub 仓库，点击 **Settings** -> **Secrets and variables** -> **Actions**。
3. 点击 **New repository secret**。
4. 名称（Name）填写为：`HF_TOKEN`。
5. 内容（Secret）粘贴刚刚获取的 Hugging Face Token。
6. 点击 **Add secret** 保存。

> 💡 **提示**：若未配置 `HF_TOKEN`，脚本仍能以匿名方式请求公开模型，但在模型数量较多时容易触发 HF 速率限制。

---

## ⚙️ 模型管理与配置

### 1. 如何新增监控模型

有两种方式可以录入新模型：

#### 方式 A：粘贴 URL 自动解析添加（推荐）
直接使用内置脚本，传入一个或多个 Hugging Face URL，脚本会自动提取 ID、探测官方是否存在 FP8 量化仓库、推断家族分组并自动写入 `config/repos.json`：

```bash
# 单个模型
node scripts/add-model.mjs https://huggingface.co/Qwen/Qwen3.8-27B

# 支持一次粘贴多个 URL 或 ID
node scripts/add-model.mjs https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro https://huggingface.co/XiaomiMiMo/MiMo-V2.6-Pro-RL
```

#### 方式 B：手动编辑 `config/repos.json`
直接在数组中追加条目：

```json
[
  {
    "id": "Qwen/Qwen3-32B",
    "family": "Qwen3",
    "quants": {
      "fp8": "Qwen/Qwen3-32B-FP8",
      "int4": "Qwen/Qwen3-32B-AWQ"
    }
  }
]
```

- `id`: Hugging Face 官方主仓库 ID（必需）。
- `family`: 模型分组名称，供前端 UI 分组筛选显示（必需）。
- `quants`: 可选。同模型的官方量化仓库。若不确定量化仓库名，请留空让前端自行按公式估算，不要编造。

### 2. 如何删除监控模型

- **方式 A：使用内置命令行脚本（推荐）**：
  ```bash
  # 根据模型 ID 或 URL 快速移除
  node scripts/remove-model.mjs Qwen/Qwen3-8B
  node scripts/remove-model.mjs https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash
  ```
- **方式 B：手动从 `config/repos.json` 中删除对应条目**。
- **方式 C：在 Web 控制台直接点击红色的删除图标**，支持一键导出或下载更新后的 `repos.json`。

### 3. 如何人工修正参数

若某个特殊模型（如 DeepSeek-V4、压缩注意力架构）无法简单通过标准配置公式计算 KV Cache，或官方 config 存在偏差，可在 `config/overrides.json` 中配置人工实测覆盖值。

`config/overrides.json` 中的字段**优先级最高**，会直接覆盖爬取到的同名字段：

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

## 📊 数据字段规范 (`models.json`)

`models.json` 输出格式示例如下：

```json
{
  "updated_at": "2026-10-13T08:30:00.000Z",
  "schema_version": 1,
  "models": [
    {
      "id": "Qwen/Qwen3-32B",
      "family": "Qwen3",
      "params": 32800000000,
      "dtypes": {
        "BF16": 32800000000
      },
      "weights_gb": {
        "native": 61.0,
        "fp8": 32.5,
        "int4": 18.1
      },
      "weights_source": {
        "native": "measured",
        "fp8": "measured",
        "int4": "measured"
      },
      "gguf": {
        "Q4_K_M": 19.1,
        "Q8_0": 34.0
      },
      "layers": 64,
      "kv_heads": 8,
      "head_dim": 128,
      "kv_lora_rank": null,
      "attention_type": "GQA",
      "max_context": 40960,
      "override_kv_per_token_kb": null,
      "crawled_at": "2026-10-13T08:30:15.000Z",
      "stale": false
    }
  ]
}
```

### 字段说明表

| 字段名称 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | `string` | Hugging Face 模型仓库唯一标识符，如 `Qwen/Qwen3-32B` |
| `family` | `string` | 模型所属家族，供分类展示，如 `Qwen3`、`DeepSeek-V4` |
| `params` | `number \| null` | 官方 safetensors 总参数量（单位：个） |
| `dtypes` | `object \| null` | 各精度参数分布，如 `{"BF16": 32800000000}` |
| `weights_gb` | `object` | 实测权重物理大小（GB，1024³ 字节，保留 1 位小数）。未实测到的精度不填充，留给前端按公式估算 |
| `weights_source` | `object` | 权重来源标记，实测值为 `"measured"` |
| `gguf` | `object` | 按 GGUF 量化标记分组的实测文件总大小（GB），如 `{"Q4_K_M": 19.1, "Q8_0": 34.0}` |
| `layers` | `number \| null` | 隐藏层总数（Transformer Block 数量） |
| `kv_heads` | `number \| null` | Key-Value 注意力头数（若无则降级取 query attention heads） |
| `head_dim` | `number \| null` | 单个注意头的特征维度 |
| `kv_lora_rank` | `number \| null` | MLA 架构下的 KV 压缩秩（非 MLA 模型为 `null`） |
| `qk_rope_head_dim` | `number \| null` | MLA 架构下 RoPE 解耦头维度（可选） |
| `attention_type` | `string` | 注意力机制类型，如 `"GQA"` 或 `"MLA"` |
| `max_context` | `number \| null` | 最大上下文长度（Token 数） |
| `override_kv_per_token_kb`| `number \| null` | 人工实测每 Token 的 KV 缓存占用（KB），若为 `null` 前端走标准公式 |
| `crawled_at` | `string` | 抓取时间（ISO 8601 字符串） |
| `stale` | `boolean` | 是否为降级旧缓存数据（当网络失败但旧文件有缓存时置为 `true`） |
| `error` | `string` | （可选）若抓取异常时记录的错误简讯 |

---

## 💻 本地调试与运行

本项目要求 **Node.js >= 20.0.0**。无需执行 `npm install`。

### 运行爬虫：

```bash
# 匿名抓取（可能遇到速率限制）
node scripts/crawl.mjs

# 或带 Token 抓取（推荐）
HF_TOKEN=hf_xxxxxxxxxxxxxxxxx node scripts/crawl.mjs
```

### 容错设计验证：
- 若遇网络异常或某个模型 ID 不存在，脚本**不会中断退出**，而是记录错误并继续抓取其余模型。
- 若 `models.json` 已有该模型的历史数据，会自动保留旧参数并打上 `"stale": true` 标记。

---

## ❓ 常见问题与操作指引 (FAQ & Guide)

### Q1: 如何录入一个新模型？
录入新模型非常简单，只需修改配置文件：
1. **确定 Hugging Face 模型 ID**：在 Hugging Face 找到官方仓库，复制其作者与仓库名（例如 `meta-llama/Llama-3.1-8B-Instruct`）。确保该仓库包含 `config.json` 与权重文件（safetensors 等）。
2. **编辑 `config/repos.json`**：在 JSON 数组中追加一条记录：
   ```json
   {
     "id": "meta-llama/Llama-3.1-8B-Instruct",
     "family": "Llama-3.1"
   }
   ```
   - 若官方有量化版本仓库（如官方 FP8 / AWQ 仓库），可填写在 `quants` 字段中：
     ```json
     {
       "id": "Qwen/Qwen3-32B",
       "family": "Qwen3",
       "quants": {
         "fp8": "Qwen/Qwen3-32B-FP8"
       }
     }
     ```
   - *注：若量化仓库不确定，直接省略 `quants` 即可，由显存计算器前端用参数量和位宽公式估算。*
3. **（可选）添加人工修正项**：如果该模型结构特殊（如压缩注意力、稀疏注意力导致每 Token KV 缓存非标准），可在 `config/overrides.json` 中添加实测值覆盖：
   ```json
   {
     "meta-llama/Llama-3.1-8B-Instruct": {
       "note": "实测标准 GQA"
     }
   }
   ```
4. **提交并推送**：将修改后的 `config/repos.json` push 到 GitHub 仓库即可。

---

### Q2: 如何在 GitHub 页面上测试跑 Actions 工作流？
本项目的 GitHub Actions 启用了 `workflow_dispatch`，支持在 GitHub 网页上随时一键手动运行：
1. 打开你的 GitHub 仓库主页，点击顶部的 **Actions** 标签页。
2. 在左侧工作流列表中，找到并点击 **Crawl LLM Models Data**。
3. 在页面右上方会看到一条提示栏，点击 **Run workflow** 下拉按钮。
4. 确认 Branch 为 `main`，点击绿色的 **Run workflow** 按钮启动任务。
5. 页面将在几秒内刷新出一个黄色正在运行的构建（Run）。点击进入该任务 -> 点击 `crawl` 作业，即可实时展开查看每个模型的抓取日志。
6. 任务完成后（显示绿色对勾），若 `models.json` 有内容更新，GitHub Actions 会自动以 `github-actions[bot]` 身份提交一次 commit 并推送到 `main` 分支。

---

### Q3: Actions 自动推送时报错 `Permission to ... denied to github-actions[bot]` 怎么办？
这是因为 GitHub 新建仓库默认把 Actions 的 GITHUB_TOKEN 权限设为了只读。
**解决办法**：
1. 进入仓库的 **Settings** -> 左侧点击 **Actions** -> **General**。
2. 页面向下滚动到 **Workflow permissions**。
3. 勾选 **Read and write permissions**。
4. 点击底部的 **Save** 按钮。
5. 重新进入 Actions 页面点击 **Run workflow** 即可成功提交推送。

---

### Q4: 提示 `HTTP 401 Unauthorized` 或 `HTTP 429 Too Many Requests`？
- **401 Unauthorized**：该模型可能是受限模型（Gated Model，如部分需要签署协议的仓库），或者你的 `HF_TOKEN` 拼写有误。请确保在 GitHub Secrets 中配置了正确的只读 Token。
- **429 Too Many Requests**：匿名抓取触碰了 Hugging Face 的 IP 请求频率限制。请前往 [Hugging Face Access Tokens](https://huggingface.co/settings/tokens) 创建一个 `Read` 权限的 Token，并存入 GitHub Secrets 的 `HF_TOKEN` 中。

---

### Q5: 外部网站如何消费此数据？
在前端应用中直接使用 `fetch` 即可获取最新 JSON 数据：
```javascript
const response = await fetch('https://raw.githubusercontent.com/<你的用户名>/llm-vram-data/main/models.json');
const data = await response.json();
console.log(data.models);
```
GitHub Raw 默认开启了 `access-control-allow-origin: *` 响应头，支持浏览器跨域直连，且有全球 CDN 加速。

