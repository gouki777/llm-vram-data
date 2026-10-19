/**
 * @file scripts/crawl.mjs
 * @description 从 Hugging Face API 抓取开源大模型的参数量、结构配置与权重文件大小，并生成根目录下的 models.json。
 * @license MIT
 * 
 * 技术约束：
 * 1. 仅使用 Node.js 20 原生能力（内置 fetch、fs、path 等），无第三方 npm 依赖。
 * 2. 禁止硬编码任何 Token，从环境变量 HF_TOKEN 读取。
 * 3. 串行请求，单请求超时 30 秒，失败重试 2 次，请求间休眠 500 毫秒。
 * 4. 单个模型抓取异常不中断整体脚本，支持降级标记 stale。
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 计算当前脚本与项目根目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

// 配置文件与输出文件路径
const REPOS_FILE = path.join(ROOT_DIR, 'config', 'repos.json');
const OVERRIDES_FILE = path.join(ROOT_DIR, 'config', 'overrides.json');
const OUTPUT_FILE = path.join(ROOT_DIR, 'models.json');

// 从环境变量读取 Hugging Face 访问令牌（可选，若提供则带 Bearer 认证）
const HF_TOKEN = process.env.HF_TOKEN?.trim() || '';

// 常量配置
const REQUEST_TIMEOUT_MS = 30000; // 单次请求超时时间：30秒
const RETRY_COUNT = 2;            // 失败重试次数：2次（总共最多尝试3次）
const REQUEST_DELAY_MS = 500;     // 每次 HTTP 请求间隔时间：500毫秒

/**
 * 辅助函数：等待指定毫秒数
 * @param {number} ms 等待时间（毫秒）
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 封装带超时与重试的原生 fetch 请求
 * @param {string} url 目标请求地址
 * @param {object} [customHeaders={}] 额外的请求头
 * @returns {Promise<any>} 解析后的 JSON 数据或抛出错误
 */
async function fetchWithRetry(url, customHeaders = {}) {
  const headers = {
    'User-Agent': 'llm-vram-data-crawler/1.0',
    'Accept': 'application/json',
    ...customHeaders,
  };

  if (HF_TOKEN) {
    headers['Authorization'] = `Bearer ${HF_TOKEN}`;
  }

  let lastError = null;

  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      // 每次请求前等待间隔，平滑流量避免 HF 速率限制
      await sleep(REQUEST_DELAY_MS);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      lastError = err;
      const isAbort = err.name === 'AbortError';
      const errMsg = isAbort ? '请求超时 (30s)' : err.message;

      if (attempt < RETRY_COUNT) {
        console.warn(`    ⚠️ 请求失败 [${attempt + 1}/${RETRY_COUNT}]: ${url} (${errMsg})，即将重试...`);
        // 重试前做简短退避
        await sleep(1000 * (attempt + 1));
      } else {
        console.error(`    ❌ 请求彻底失败 [${attempt + 1}/${RETRY_COUNT}]: ${url} (${errMsg})`);
      }
    }
  }

  throw lastError;
}

/**
 * 从文件名中提取 GGUF 量化类型标记（如 Q4_K_M, Q8_0, IQ3_M, BF16 等）
 * @param {string} filename 文件名
 * @returns {string|null} 匹配到的量化标签或 null
 */
function extractGgufQuantTag(filename) {
  // 匹配常见 GGUF 量化命名模式，如 model-q4_k_m.gguf、Q8_0.gguf、IQ3_M.gguf
  const match = filename.match(/(?:^|[._-])((?:Q\d+_[A-Z0-9_]+|IQ\d+_[A-Z0-9_]+|Q\d+_[0-9]|FP16|BF16|F16|F32))(?:[._-]|$)/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * 统计特定 Hugging Face 仓库中权重文件的物理大小（GB）以及 GGUF 分布
 * @param {string} repoId 仓库 ID
 * @returns {Promise<{ totalGb: number, ggufMap: Record<string, number> }>}
 */
async function fetchRepoWeights(repoId) {
  const treeUrl = `https://huggingface.co/api/models/${repoId}/tree/main?recursive=true`;
  const treeData = await fetchWithRetry(treeUrl);

  if (!Array.isArray(treeData)) {
    return { totalGb: 0, ggufMap: {} };
  }

  let totalBytes = 0;
  const ggufBytesMap = {};

  for (const item of treeData) {
    if (item.type !== 'file' || !item.path) continue;
    const lowerPath = item.path.toLowerCase();

    // 只统计 .safetensors、.gguf、.bin 格式权重
    const isWeightFile = lowerPath.endsWith('.safetensors') ||
                         lowerPath.endsWith('.gguf') ||
                         lowerPath.endsWith('.bin');

    if (!isWeightFile) continue;

    // 文件大小优先用 lfs.size，没有再用 size
    const fileSize = (item.lfs && typeof item.lfs.size === 'number')
      ? item.lfs.size
      : (typeof item.size === 'number' ? item.size : 0);

    totalBytes += fileSize;

    // 如果是 GGUF 文件，按量化类型累计
    if (lowerPath.endsWith('.gguf')) {
      const tag = extractGgufQuantTag(item.path) || 'OTHER_GGUF';
      ggufBytesMap[tag] = (ggufBytesMap[tag] || 0) + fileSize;
    }
  }

  // 转换为 GB（1024^3），保留 1 位小数
  const totalGb = totalBytes > 0 ? Number((totalBytes / (1024 ** 3)).toFixed(1)) : 0;
  
  const ggufMap = {};
  for (const [tag, bytes] of Object.entries(ggufBytesMap)) {
    ggufMap[tag] = Number((bytes / (1024 ** 3)).toFixed(1));
  }

  return { totalGb, ggufMap };
}

/**
 * 爬取单个模型的核心数据
 * @param {object} repoConfig 模型配置项（来自 repos.json）
 * @returns {Promise<object>} 抓取并组装完成的模型对象
 */
async function crawlSingleModel(repoConfig) {
  const { id, family, quants = {} } = repoConfig;
  console.log(`\n▶ 正在爬取模型: ${id} (${family})`);

  // 1. 获取模型基本信息与 safetensors 参数分布
  const modelInfoUrl = `https://huggingface.co/api/models/${id}?expand[]=safetensors&expand[]=createdAt&expand[]=lastModified`;
  const modelInfo = await fetchWithRetry(modelInfoUrl);

  const safetensorsData = modelInfo.safetensors || {};
  const params = typeof safetensorsData.total === 'number' ? safetensorsData.total : null;
  const dtypes = (safetensorsData.parameters && typeof safetensorsData.parameters === 'object')
    ? safetensorsData.parameters
    : null;

  // 1.1 提取模型发布/创建日期（原生的 Hugging Face createdAt）
  let createdAtRaw = modelInfo.createdAt || modelInfo.lastModified;
  if (!createdAtRaw) {
    try {
      const basicInfo = await fetchWithRetry(`https://huggingface.co/api/models/${id}`);
      createdAtRaw = basicInfo.createdAt || basicInfo.lastModified;
    } catch {}
  }
  const created_at = createdAtRaw ? createdAtRaw.split('T')[0] : '2026-01-01';

  // 1.2 判定模型原生主权重精度（Main Dtype: BF16 / FP16 / FP8 / INT8 / FP4 等）
  let main_dtype = 'BF16';
  if (dtypes && typeof dtypes === 'object' && Object.keys(dtypes).length > 0) {
    let maxParamCount = -1;
    for (const [dt, count] of Object.entries(dtypes)) {
      if (typeof count === 'number' && count > maxParamCount) {
        maxParamCount = count;
        main_dtype = dt;
      }
    }
  }

  // 2. 获取模型结构配置 config.json（兼容普通 CausalLM、text_config 嵌套结构，以及 diffusers/多模态子模块）
  let rawConfig = null;
  const configCandidates = [
    `https://huggingface.co/${id}/resolve/main/config.json`,
    `https://huggingface.co/${id}/resolve/main/transformer/config.json`,
    `https://huggingface.co/${id}/resolve/main/FL2VA/transformer/config.json`,
    `https://huggingface.co/${id}/resolve/main/text_encoder/config.json`,
    `https://huggingface.co/${id}/resolve/main/model_index.json`,
  ];

  for (const candUrl of configCandidates) {
    try {
      rawConfig = await fetchWithRetry(candUrl);
      if (rawConfig && typeof rawConfig === 'object') break;
    } catch {
      // 尝试下一个候选地址
    }
  }

  if (!rawConfig) {
    throw new Error('未能从仓库及其子目录中获取到有效的 config.json');
  }

  // 若存在 text_config 嵌套结构，优先合并以兼容多模态/特殊模型
  const cfg = (rawConfig.text_config && typeof rawConfig.text_config === 'object')
    ? { ...rawConfig, ...rawConfig.text_config }
    : rawConfig;

  // 提取层数（支持 num_hidden_layers 与 num_layers）
  const layers = cfg.num_hidden_layers ?? cfg.num_layers ?? null;

  // 提取 KV Heads（若无 num_key_value_heads 则降级使用 num_attention_heads）
  const kv_heads = cfg.num_key_value_heads ?? cfg.num_attention_heads ?? null;

  // 提取 head_dim（若无则尝试用 hidden_size / num_attention_heads 计算，或从 attention_head_dim 获取）
  let head_dim = cfg.head_dim ?? cfg.attention_head_dim ?? null;
  if (head_dim === null && typeof cfg.hidden_size === 'number' && typeof cfg.num_attention_heads === 'number' && cfg.num_attention_heads > 0) {
    head_dim = Math.round(cfg.hidden_size / cfg.num_attention_heads);
  }

  // 提取上下文长度与 MLA 专属参数
  const max_context = cfg.max_position_embeddings ?? cfg.seq_length ?? null;
  const kv_lora_rank = cfg.kv_lora_rank ?? null;
  const qk_rope_head_dim = cfg.qk_rope_head_dim ?? null;

  // 根据是否存在 kv_lora_rank 判定注意力类型：有 kv_lora_rank 记为 MLA，否则记为 GQA
  const attention_type = (typeof kv_lora_rank === 'number' && kv_lora_rank > 0) ? 'MLA' : 'GQA';

  // 3. 统计原始仓库与量化仓库权重大小
  const weights_gb = {};
  const weights_source = {};
  let ggufResults = {};

  // a. 统计官方原生仓库
  try {
    const nativeWeights = await fetchRepoWeights(id);
    if (nativeWeights.totalGb > 0) {
      weights_gb.native = nativeWeights.totalGb;
      weights_source.native = 'measured';
    }
    if (Object.keys(nativeWeights.ggufMap).length > 0) {
      ggufResults = { ...ggufResults, ...nativeWeights.ggufMap };
    }
  } catch (err) {
    console.warn(`    ⚠️ 获取原生仓库权重树失败 (${id}): ${err.message}`);
  }

  // b. 遍历 quants 中配置的同模型量化仓库
  for (const [quantName, quantRepoId] of Object.entries(quants)) {
    if (!quantRepoId) continue;
    try {
      console.log(`    ↳ 正在抓取量化仓库 [${quantName}]: ${quantRepoId}`);
      const quantWeights = await fetchRepoWeights(quantRepoId);
      if (quantWeights.totalGb > 0) {
        weights_gb[quantName] = quantWeights.totalGb;
        weights_source[quantName] = 'measured';
      }
      if (Object.keys(quantWeights.ggufMap).length > 0) {
        ggufResults = { ...ggufResults, ...quantWeights.ggufMap };
      }
    } catch (err) {
      console.warn(`    ⚠️ 抓取量化仓库 [${quantName}] 失败: ${err.message}`);
    }
  }

  // 4. 精确计算单 Token 的 KV Cache 占用字节数与 1M 上下文显存
  let kv_cache = null;
  if (layers && (kv_heads || kv_lora_rank)) {
    let elementsPerToken = 0;
    if (typeof kv_lora_rank === 'number' && kv_lora_rank > 0) {
      // MLA 机制：每层仅缓存一个压缩潜在向量 c_t^KV 加上解耦位置编码
      const rank = kv_lora_rank + (qk_rope_head_dim || 0);
      elementsPerToken = layers * rank;
    } else if (kv_heads && head_dim) {
      // 标准 MHA / GQA / MQA 机制：Key 和 Value 各一个向量 (2 * layers * kv_heads * head_dim)
      elementsPerToken = 2 * layers * kv_heads * head_dim;
    }

    if (elementsPerToken > 0) {
      const bytesFp16 = elementsPerToken * 2;   // 16-bit
      const bytesFp8 = elementsPerToken * 1;    // 8-bit
      const bytesInt4 = elementsPerToken * 0.5; // 4-bit

      const kbPerTokenFp16 = Number((bytesFp16 / 1024).toFixed(3));

      // 严格根据模型实际支持的最大 Context 计算（如 256K = 262,144 tokens，1M = 1,048,576 tokens）
      const actualMaxContext = max_context || 131072;
      const actualMaxContextK = Math.round(actualMaxContext / 1024);

      // 显存 (GB) = (bytesPerToken * actualMaxContext) / (1024^3)
      const kvMaxContextGbFp16 = Number(((bytesFp16 * actualMaxContext) / (1024 ** 3)).toFixed(2));
      const kvMaxContextGbFp8 = Number(((bytesFp8 * actualMaxContext) / (1024 ** 3)).toFixed(2));
      const kvMaxContextGbInt4 = Number(((bytesInt4 * actualMaxContext) / (1024 ** 3)).toFixed(2));

      kv_cache = {
        elements_per_token: elementsPerToken,
        bytes_per_token_fp16: bytesFp16,
        kb_per_token_fp16: kbPerTokenFp16,
        actual_max_context_tokens: actualMaxContext,
        actual_max_context_k: `${actualMaxContextK}K`,
        kv_max_context_gb_fp16: kvMaxContextGbFp16,
        kv_max_context_gb_fp8: kvMaxContextGbFp8,
        kv_max_context_gb_int4: kvMaxContextGbInt4,
      };
    }
  }

  // 组装最终模型对象
  const result = {
    id,
    family,
    created_at,
    main_dtype,
    params,
    dtypes,
    weights_gb,
    weights_source,
    gguf: ggufResults,
    layers,
    kv_heads,
    head_dim,
    kv_lora_rank,
    attention_type,
    max_context,
    kv_cache,
    override_kv_per_token_kb: null,
    crawled_at: new Date().toISOString(),
    stale: false,
  };

  // 如果有 qk_rope_head_dim 则附带记录
  if (qk_rope_head_dim !== null) {
    result.qk_rope_head_dim = qk_rope_head_dim;
  }

  return result;
}

/**
 * 主函数：读取配置、执行爬虫、容错合并与输出 models.json
 */
async function main() {
  console.log('====================================================');
  console.log('🚀 llm-vram-data 爬虫启动');
  console.log(`⏰ 当前时间: ${new Date().toISOString()}`);
  console.log(`🔑 HF_TOKEN 状态: ${HF_TOKEN ? '已配置 (带认证请求)' : '未配置 (匿名请求)'}`);
  console.log('====================================================');

  // 1. 读取 repos.json
  let reposList = [];
  try {
    const reposRaw = await readFile(REPOS_FILE, 'utf-8');
    reposList = JSON.parse(reposRaw);
    if (!Array.isArray(reposList)) {
      throw new Error('config/repos.json 必须是 JSON 数组');
    }
  } catch (err) {
    console.error(`❌ 读取 config/repos.json 失败: ${err.message}`);
    process.exit(1);
  }

  // 2. 读取 overrides.json
  let overridesMap = {};
  try {
    const overridesRaw = await readFile(OVERRIDES_FILE, 'utf-8');
    overridesMap = JSON.parse(overridesRaw);
  } catch (err) {
    console.warn(`⚠️ 未能读取 config/overrides.json 或格式错误，使用空覆盖配置: ${err.message}`);
  }

  // 3. 读取已有的 models.json（用于失败时保留旧数据降级）
  const oldModelsMap = new Map();
  try {
    const oldModelsRaw = await readFile(OUTPUT_FILE, 'utf-8');
    const oldData = JSON.parse(oldModelsRaw);
    if (Array.isArray(oldData.models)) {
      for (const m of oldData.models) {
        if (m && m.id) {
          oldModelsMap.set(m.id, m);
        }
      }
    }
    console.log(`📦 成功加载已有 models.json，包含 ${oldModelsMap.size} 个历史模型记录`);
  } catch {
    console.log('ℹ️ 未检测到已有 models.json 或文件为空，将生成全新数据');
  }

  // 4. 串行爬取每个模型
  const finalModels = [];
  const summary = {
    total: reposList.length,
    success: 0,
    failed: 0,
    staleUsed: 0,
    details: [],
  };

  for (const repoConfig of reposList) {
    const { id } = repoConfig;

    try {
      // 正常爬取
      const crawledModel = await crawlSingleModel(repoConfig);

      // 合并 overrides 覆盖值（人工维护，优先级最高）
      const overrideVal = overridesMap[id];
      const mergedModel = overrideVal ? { ...crawledModel, ...overrideVal } : crawledModel;

      finalModels.push(mergedModel);
      summary.success++;
      summary.details.push({ id, status: '成功', stale: false });
      console.log(`  ✅ 模型 [${id}] 爬取成功并已合并规则`);
    } catch (err) {
      summary.failed++;
      console.error(`  ❌ 模型 [${id}] 爬取异常: ${err.message}`);

      // 降级容错机制：如果旧 models.json 中有历史数据，保留旧数据并标记 stale: true
      if (oldModelsMap.has(id)) {
        const oldEntry = { ...oldModelsMap.get(id) };
        oldEntry.stale = true;
        oldEntry.error = err.message;
        oldEntry.crawled_at = new Date().toISOString();

        // 依然应用 overrides
        const overrideVal = overridesMap[id];
        const mergedOld = overrideVal ? { ...oldEntry, ...overrideVal } : oldEntry;

        finalModels.push(mergedOld);
        summary.staleUsed++;
        summary.details.push({ id, status: '失败 (使用旧缓存并标记 stale)', error: err.message });
      } else {
        // 无旧数据时，写入最小结构，保证脚本不崩溃
        const fallbackEntry = {
          id,
          family: repoConfig.family || '',
          stale: true,
          error: err.message,
          crawled_at: new Date().toISOString(),
          ...(overridesMap[id] || {}),
        };
        finalModels.push(fallbackEntry);
        summary.details.push({ id, status: '失败 (无历史数据，记录最小占位)', error: err.message });
      }
    }
  }

  // 5. 组装并写入 models.json
  const outputPayload = {
    updated_at: new Date().toISOString(),
    schema_version: 1,
    models: finalModels,
  };

  try {
    await writeFile(OUTPUT_FILE, JSON.stringify(outputPayload, null, 2) + '\n', 'utf-8');
    console.log(`\n💾 成功写出数据至: ${OUTPUT_FILE}`);
  } catch (err) {
    console.error(`❌ 写入 models.json 失败: ${err.message}`);
    process.exit(1);
  }

  // 6. 控制台汇总报表
  console.log('\n====================================================');
  console.log('📊 爬虫执行结果汇总:');
  console.log(`总计模型: ${summary.total} | 成功: ${summary.success} | 失败: ${summary.failed} (其中使用旧缓存: ${summary.staleUsed})`);
  console.log('----------------------------------------------------');
  for (const item of summary.details) {
    const tag = item.status.startsWith('成功') ? '✅' : '⚠️';
    console.log(`${tag} ${item.id.padEnd(36)} -> ${item.status}${item.error ? ` [${item.error}]` : ''}`);
  }
  console.log('====================================================\n');
}

// 执行主入口
main().catch((err) => {
  console.error(`💥 致命错误: ${err.message}`);
  process.exit(1);
});
