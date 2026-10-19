/**
 * @file scripts/remove-model.mjs
 * @description 从 config/repos.json 中删除指定的模型配置项。
 * @license MIT
 * 
 * 用法示例：
 *   node scripts/remove-model.mjs Qwen/Qwen3-8B
 *   node scripts/remove-model.mjs https://huggingface.co/Qwen/Qwen3.8-27B
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { extractModelId } from './add-model.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const REPOS_FILE = path.join(ROOT_DIR, 'config', 'repos.json');

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log('📌 使用方法：node scripts/remove-model.mjs <模型 ID 或 Hugging Face URL ...>');
    console.log('示例：');
    console.log('  node scripts/remove-model.mjs Qwen/Qwen3-8B');
    console.log('  node scripts/remove-model.mjs https://huggingface.co/deepseek-ai/DeepSeek-V4-Flash');
    process.exit(0);
  }

  let repos = [];
  try {
    const content = await readFile(REPOS_FILE, 'utf-8');
    repos = JSON.parse(content);
    if (!Array.isArray(repos)) {
      console.error('❌ config/repos.json 不是有效的 JSON 数组');
      process.exit(1);
    }
  } catch (err) {
    console.error(`❌ 读取 config/repos.json 失败: ${err.message}`);
    process.exit(1);
  }

  let removedCount = 0;

  for (const rawArg of args) {
    const targetId = extractModelId(rawArg) || rawArg.trim();
    const initialLength = repos.length;
    repos = repos.filter(m => m.id !== targetId);

    if (repos.length < initialLength) {
      console.log(`🗑️ 成功移除模型: [${targetId}]`);
      removedCount++;
    } else {
      console.warn(`⚠️ 未在 config/repos.json 中找到模型: [${targetId}]`);
    }
  }

  if (removedCount > 0) {
    await writeFile(REPOS_FILE, JSON.stringify(repos, null, 2) + '\n', 'utf-8');
    console.log(`\n🎉 已更新 config/repos.json，共移除 ${removedCount} 个模型！`);
    console.log(`💡 提示：可运行 node scripts/crawl.mjs 重新生成 models.json。`);
  } else {
    console.log('\n未移除任何模型。');
  }
}

main().catch(err => {
  console.error(`💥 执行错误: ${err.message}`);
  process.exit(1);
});
