import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';
import { extractModelId, inferFamily } from './scripts/add-model.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPOS_FILE = path.join(__dirname, 'config', 'repos.json');
const MODELS_FILE = path.join(__dirname, 'models.json');

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  app.use(express.json());

  // 1. 获取当前最新 repos.json 和 models.json 数据（以 config/repos.json 为绝对基准）
  app.get('/api/data', async (req, res) => {
    try {
      const reposRaw = await fs.readFile(REPOS_FILE, 'utf-8');
      const repos = JSON.parse(reposRaw);

      let modelsData: any = { models: [] };
      try {
        const modelsRaw = await fs.readFile(MODELS_FILE, 'utf-8');
        modelsData = JSON.parse(modelsRaw);
      } catch {}

      const crawledMap = new Map();
      if (Array.isArray(modelsData.models)) {
        modelsData.models.forEach((m: any) => crawledMap.set(m.id, m));
      }

      // 无论是否已经爬取，repos.json 里的每个模型都 100% 呈现在前端
      const mergedModels = repos.map((r: any) => {
        if (crawledMap.has(r.id)) {
          return {
            ...crawledMap.get(r.id),
            family: r.family || crawledMap.get(r.id).family,
          };
        }
        return {
          id: r.id,
          family: r.family,
          attention_type: r.id.toLowerCase().includes('deepseek') ? 'CSA/HCA' : 'GQA',
          weights_gb: {},
          weights_source: {},
          gguf: {},
          stale: false,
          is_pending: true,
          crawled_at: new Date().toISOString(),
        };
      });

      res.json({
        repos,
        models: mergedModels,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. 删除模型：同时更新 config/repos.json 和 models.json 磁盘文件
  app.post('/api/models/delete', async (req, res) => {
    try {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: '缺少模型 ID' });

      // 1. 更新 config/repos.json
      const reposRaw = await fs.readFile(REPOS_FILE, 'utf-8');
      let repos = JSON.parse(reposRaw);
      repos = repos.filter((m: any) => m.id !== id);
      await fs.writeFile(REPOS_FILE, JSON.stringify(repos, null, 2) + '\n', 'utf-8');

      // 2. 更新 models.json
      let modelsData: any = { updated_at: new Date().toISOString(), schema_version: 1, models: [] };
      try {
        const modelsRaw = await fs.readFile(MODELS_FILE, 'utf-8');
        modelsData = JSON.parse(modelsRaw);
        if (Array.isArray(modelsData.models)) {
          modelsData.models = modelsData.models.filter((m: any) => m.id !== id);
          modelsData.updated_at = new Date().toISOString();
          await fs.writeFile(MODELS_FILE, JSON.stringify(modelsData, null, 2) + '\n', 'utf-8');
        }
      } catch (err) {
        console.warn('更新 models.json 警告:', err);
      }

      console.log(`[API] 成功从磁盘移除模型: ${id}`);
      res.json({ success: true, id, models: modelsData.models, repos });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. 添加模型：直接写入 config/repos.json 和 models.json 磁盘文件
  app.post('/api/models/add', async (req, res) => {
    try {
      const { urlOrId, family: customFamily } = req.body;
      const modelId = extractModelId(urlOrId) || urlOrId?.trim();
      if (!modelId) return res.status(400).json({ error: '无效的模型 URL 或 ID' });

      const reposRaw = await fs.readFile(REPOS_FILE, 'utf-8');
      const repos = JSON.parse(reposRaw);

      if (repos.some((r: any) => r.id === modelId)) {
        return res.status(400).json({ error: `模型 [${modelId}] 已存在于监控配置中` });
      }

      const family = customFamily || inferFamily(modelId);
      const newRepoEntry: any = { id: modelId, family };
      if (modelId.includes('Qwen') && !modelId.includes('FP8')) {
        newRepoEntry.quants = { fp8: `${modelId}-FP8` };
      }

      repos.push(newRepoEntry);
      await fs.writeFile(REPOS_FILE, JSON.stringify(repos, null, 2) + '\n', 'utf-8');

      // 同步插入 models.json
      let modelsData: any = { updated_at: new Date().toISOString(), schema_version: 1, models: [] };
      try {
        const modelsRaw = await fs.readFile(MODELS_FILE, 'utf-8');
        modelsData = JSON.parse(modelsRaw);
      } catch {}

      const newModelEntry = {
        id: modelId,
        family,
        attention_type: modelId.toLowerCase().includes('deepseek') ? 'CSA/HCA' : 'GQA',
        weights_gb: {},
        weights_source: {},
        gguf: {},
        crawled_at: new Date().toISOString(),
        stale: false,
      };

      if (!modelsData.models.some((m: any) => m.id === modelId)) {
        modelsData.models.unshift(newModelEntry);
        modelsData.updated_at = new Date().toISOString();
        await fs.writeFile(MODELS_FILE, JSON.stringify(modelsData, null, 2) + '\n', 'utf-8');
      }

      console.log(`[API] 成功添加模型并写入磁盘: ${modelId}`);
      res.json({ success: true, item: newModelEntry, repos, models: modelsData.models });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. 触发本地爬虫重新爬取
  app.post('/api/crawl', async (req, res) => {
    try {
      exec('node scripts/crawl.mjs', (error, stdout, stderr) => {
        if (error) {
          console.error('[API Crawl Error]:', error);
        } else {
          console.log('[API Crawl Success]');
        }
      });
      res.json({ success: true, message: '爬虫已在后台启动执行' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. 整库强制同步写入 config/repos.json 和 models.json
  app.post('/api/repos/sync', async (req, res) => {
    try {
      const { repos } = req.body;
      if (!Array.isArray(repos)) return res.status(400).json({ error: 'repos 必须是数组' });
      await fs.writeFile(REPOS_FILE, JSON.stringify(repos, null, 2) + '\n', 'utf-8');

      // 同步清理 models.json
      const repoIds = new Set(repos.map((r: any) => r.id));
      let modelsData: any = { updated_at: new Date().toISOString(), schema_version: 1, models: [] };
      try {
        const modelsRaw = await fs.readFile(MODELS_FILE, 'utf-8');
        modelsData = JSON.parse(modelsRaw);
        if (Array.isArray(modelsData.models)) {
          modelsData.models = modelsData.models.filter((m: any) => repoIds.has(m.id));
          modelsData.updated_at = new Date().toISOString();
          await fs.writeFile(MODELS_FILE, JSON.stringify(modelsData, null, 2) + '\n', 'utf-8');
        }
      } catch {}

      console.log(`[API] 成功整库同步写入 config/repos.json (${repos.length} 个模型)`);
      res.json({ success: true, count: repos.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 挂载 Vite 开发服务器中间件
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: 'spa',
  });
  app.use(vite.middlewares);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 服务已启动: http://0.0.0.0:${PORT}`);
  });
}

startServer();
