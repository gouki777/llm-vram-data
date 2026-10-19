/**
 * @file scripts/add-model.mjs
 * @description 根据输入的 Hugging Face URL 或模型 ID，自动解析、检测并追加到 config/repos.json 中。
 * @license MIT
 * 
 * 用法示例：
 *   node scripts/add-model.mjs https://huggingface.co/Qwen/Qwen3.8-27B
 *   node scripts/add-model.mjs https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro https://huggingface.co/XiaomiMiMo/MiMo-V2.6-Pro-RL
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const REPOS_FILE = path.join(ROOT_DIR, 'config', 'repos.json');

// 从环境变量可选读取 HF Token
const HF_TOKEN = process.env.HF_TOKEN?.trim() || '';

/**
 * 从 URL 或文本中提取规范的 owner/repo 模型 ID
 * @param {string} input 完整 URL 或模型 ID
 * @returns {string|null} 提取出的 ID（如 Qwen/Qwen3.8-27B）或 null
 */
export function extractModelId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  // 匹配 https://huggingface.co/owner/repo 形式（忽略尾部斜杠或 query 参数）
  const urlMatch = trimmed.match(/huggingface\.co\/([^/?#\s]+\/[^/?#\s]+)/i);
  if (urlMatch) {
    return urlMatch[1];
  }
  // 匹配直接输入的 owner/repo 形式
  const idMatch = trimmed.match(/^([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)$/);
  if (idMatch) {
    return idMatch[1];
  }
  return null;
}

/**
 * 根据模型仓库名称智能推断所属 family 家族
 * @param {string} repoId 仓库 ID（如 Qwen/Qwen3.8-27B）
 * @returns {string} 推断出的家族名称（如 Qwen3.8）
 */
export function inferFamily(repoId) {
  const parts = repoId.split('/');
  const name = parts[1] || repoId;

  // 1. 匹配常见的特定前缀家族
  const matchFamily = name.match(/^(Qwen3(?:\.[0-9]+)?|Qwen2(?:\.[0-9]+)?|DeepSeek-V[0-9]+|MiMo-V[0-9]+(?:\.[0-9]+)?|Llama-[0-9]+(?:\.[0-9]+)?|Gemma-[0-9]+|Mistral|Phi-[0-9]+)/i);
  if (matchFamily) {
    return matchFamily[1];
  }

  // 2. 匹配以连字符或下划线分隔的第一段作为家族名
  const fallbackMatch = name.match(/^([A-Za-z0-9]+)[-_]/);
  if (fallbackMatch) {
    return fallbackMatch[1];
  }

  return name;
}

/**
 * 探测指定模型仓库是否存在，并检查是否存在常见量化版本（如 FP8）
 * @param {string} repoId 仓库 ID
 * @returns {Promise<{ exists: boolean, quants: Record<string, string> }>}
 */
async function probeModelRepo(repoId) {
  const headers = { 'User-Agent': 'llm-vram-data-adder/1.0' };
  if (HF_TOKEN) {
    headers['Authorization'] = `Bearer ${HF_TOKEN}`;
  }

  try {
    const res = await fetch(`https://huggingface.co/api/models/${repoId}`, { headers });
    if (!res.ok) {
      return { exists: false, quants: {} };
    }
  } catch {
    return { exists: false, quants: {} };
  }

  const quants = {};

  // 自动探测常见的官方量化衍生仓库（如 -FP8）
  // 仅在当前 repoId 本身不包含 FP8 时探测
  if (!repoId.toUpperCase().includes('FP8')) {
    const fp8Candidate = `${repoId}-FP8`;
    try {
      const fp8Res = await fetch(`https://huggingface.co/api/models/${fp8Candidate}`, { headers });
      if (fp8Res.ok) {
        quants.fp8 = fp8Candidate;
      }
    } catch {
      // 忽略探测错误
    }
  }

  return { exists: true, quants };
}

/**
 * 主执行流程
 */
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('📌 使用方法：node scripts/add-model.mjs <Hugging Face 模型 URL 或 ID ...>');
    console.log('示例：');
    console.log('  node scripts/add-model.mjs https://huggingface.co/Qwen/Qwen3.8-27B');
    console.log('  node scripts/add-model.mjs https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro https://huggingface.co/XiaomiMiMo/MiMo-V2.6-Pro-RL');
    process.exit(0);
  }

  // 1. 读取现有的 repos.json
  let repos = [];
  try {
    const content = await readFile(REPOS_FILE, 'utf-8');
    repos = JSON.parse(content);
    if (!Array.isArray(repos)) repos = [];
  } catch {
    repos = [];
  }

  const existingIds = new Set(repos.map(r => r.id));
  let addedCount = 0;

  for (const rawArg of args) {
    const modelId = extractModelId(rawArg);
    if (!modelId) {
      console.warn(`⚠️ 无法识别的模型地址或 ID: "${rawArg}"，已跳过。`);
      continue;
    }

    if (existingIds.has(modelId)) {
      console.log(`ℹ️ 模型 [${modelId}] 已存在于 config/repos.json 中，无需重复添加。`);
      continue;
    }

    console.log(`🔍 正在检查 Hugging Face 仓库: ${modelId} ...`);
    const { exists, quants } = await probeModelRepo(modelId);

    if (!exists) {
      console.warn(`⚠️ Hugging Face 上未检测到公开仓库 [${modelId}]（可能为私有或地址拼写错误），但仍将为您添加配置。`);
    }

    const family = inferFamily(modelId);
    const newEntry = {
      id: modelId,
      family,
    };

    if (Object.keys(quants).length > 0) {
      newEntry.quants = quants;
      console.log(`  ✨ 自动探测到量化仓库:`, quants);
    }

    repos.push(newEntry);
    existingIds.add(modelId);
    addedCount++;
    console.log(`✅ 成功添加: [${modelId}] (分组: ${family})`);
  }

  if (addedCount > 0) {
    await writeFile(REPOS_FILE, JSON.stringify(repos, null, 2) + '\n', 'utf-8');
    console.log(`\n🎉 已成功写入 config/repos.json，共新增 ${addedCount} 个模型！`);
    console.log(`💡 提示：可立即运行 node scripts/crawl.mjs 验证抓取。`);
  } else {
    console.log('\n未新增任何模型。');
  }
}

// 如果作为主脚本直接运行
if (process.argv[1] && process.argv[1].endsWith('add-model.mjs')) {
  main().catch(err => {
    console.error(`💥 执行错误: ${err.message}`);
    process.exit(1);
  });
}
