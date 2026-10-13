import React, { useState } from 'react';
import { 
  Database, 
  Terminal, 
  GitBranch, 
  Copy, 
  Check, 
  ExternalLink, 
  Layers, 
  ShieldCheck, 
  FileCode,
  Server,
  Code2
} from 'lucide-react';
import modelsData from '../models.json';

export default function App() {
  const [username, setUsername] = useState('your-username');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'models' | 'schema' | 'actions'>('overview');

  const rawUrl = `https://raw.githubusercontent.com/${username || '<username>'}/llm-vram-data/main/models.json`;
  const curlCmd = `curl -s "${rawUrl}" | jq .`;

  const copyToClipboard = (text: string, type: 'url' | 'curl') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 顶部技术控制台导航栏 */}
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-cyan-950 border border-cyan-800 flex items-center justify-center text-cyan-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <span className="font-mono font-semibold text-slate-100 text-sm tracking-tight">llm-vram-data</span>
              <span className="text-xs text-slate-500 ml-2 hidden sm:inline">v{modelsData.schema_version}.0 · Open LLM Parameter Dataset</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-emerald-400 font-mono flex items-center gap-1.5 mr-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {modelsData.models.length} Models Synced
            </span>
            <a 
              href="https://huggingface.co" 
              target="_blank" 
              rel="noreferrer"
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 px-2.5 py-1.5 rounded border border-slate-800 hover:border-slate-700 transition"
            >
              <span>Hugging Face</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </header>

      {/* 主体区域 */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex-1 w-full space-y-8">
        {/* 项目标题与说明 */}
        <section className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 uppercase tracking-wider">
              <span>Automated HF Crawler</span>
              <span>·</span>
              <span>Daily GitHub Actions</span>
              <span>·</span>
              <span>Node.js 20 ESM</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              开源大模型显存估算与架构参数静态数据仓库
            </h1>
            <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
              本仓库专为大模型显存计算器（VRAM Calculator）提供实时校准的结构超参数与物理权重大小。每日定时由 GitHub Actions 抓取 Hugging Face 官方仓库并生成根目录 <code className="text-cyan-300 font-mono text-xs bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">models.json</code>，供前端或推理系统直接通过 CDN 零后端访问。
            </p>
          </div>

          {/* Raw URL 快捷配置与复制卡片 */}
          <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-cyan-400" />
                Raw GitHub CDN 读取端点（生成预览）：
              </label>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">替换用户名:</span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.trim())}
                  placeholder="your-username"
                  className="bg-slate-950 border border-slate-700 rounded px-2 py-0.5 text-cyan-300 font-mono text-xs focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded p-2.5 font-mono text-xs text-slate-300 break-all overflow-x-auto">
              <span className="text-cyan-400 select-none">GET</span>
              <span className="flex-1 select-all">{rawUrl}</span>
              <button
                onClick={() => copyToClipboard(rawUrl, 'url')}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition border border-slate-700 active:scale-95"
                title="复制 Raw 地址"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? '已复制' : '复制地址'}</span>
              </button>
            </div>

            <div className="flex items-center justify-between pt-1 text-xs text-slate-500">
              <div className="flex items-center gap-2">
                <span>更新频率: 每天 UTC 02:00</span>
                <span>·</span>
                <span>最近成功更新: <span className="text-slate-400 font-mono">{new Date(modelsData.updated_at).toLocaleString()}</span></span>
              </div>
              <button
                onClick={() => copyToClipboard(curlCmd, 'curl')}
                className="text-slate-400 hover:text-slate-200 flex items-center gap-1 transition"
              >
                {copiedCurl ? <Check className="w-3 h-3 text-emerald-400" /> : <Terminal className="w-3 h-3" />}
                <span>复制 curl 命令</span>
              </button>
            </div>
          </div>
        </section>

        {/* 导航标签切换 */}
        <div className="border-b border-slate-800 flex gap-4 text-sm font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 border-b-2 transition ${activeTab === 'overview' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            仓库结构与快速指引
          </button>
          <button
            onClick={() => setActiveTab('models')}
            className={`pb-3 border-b-2 transition ${activeTab === 'models' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            已同步模型数据 ({modelsData.models.length})
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`pb-3 border-b-2 transition ${activeTab === 'schema' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            字段规范说明
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            className={`pb-3 border-b-2 transition ${activeTab === 'actions' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            GitHub Actions 部署配置
          </button>
        </div>

        {/* 标签 1：概览与仓库文件树 */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <FileCode className="w-4 h-4 text-cyan-400" />
                仓库完整目录结构
              </h3>
              <pre className="font-mono text-xs bg-slate-950 p-3 rounded border border-slate-800 text-slate-300 leading-relaxed overflow-x-auto">
{`llm-vram-data/
├── .github/workflows/crawl.yml   # 每日定时调度与自动提交
├── config/
│   ├── repos.json                # 监控模型清单（人工维护）
│   └── overrides.json            # 人工实测修正项（最高优先级）
├── scripts/
│   └── crawl.mjs                 # 爬虫主程序（Node.js 20 原生 fetch）
├── models.json                   # 爬虫产出静态数据（根目录公开消费）
└── README.md                     # 中文使用文档与规范`}
              </pre>
              <p className="text-xs text-slate-400 leading-relaxed">
                无需任何第三方 npm 包或 Python 环境，纯 Node.js 20 ESM 原生实现。
              </p>
            </div>

            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                本地运行与测试
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                克隆仓库后，本地运行爬虫仅需执行一条命令（无需 <code className="text-slate-300">npm install</code>）：
              </p>
              <pre className="font-mono text-xs bg-slate-950 p-3 rounded border border-slate-800 text-emerald-400 leading-relaxed overflow-x-auto">
{`# 方式 1：匿名抓取
node scripts/crawl.mjs

# 方式 2：带 Token 抓取（推荐，避免触发 HF 速率限制）
HF_TOKEN=hf_xxxxxxxxxxxx node scripts/crawl.mjs`}
              </pre>
              <div className="text-xs text-slate-400 space-y-1">
                <div className="text-slate-300 font-medium">防踩坑机制：</div>
                <div>· 遇到个别模型异常时自动打上 <code className="text-amber-400">stale: true</code> 标记并保留旧数据。</div>
                <div>· 不会因为单个网络错误导致整体中断退出。</div>
              </div>
            </div>
          </div>
        )}

        {/* 标签 2：已同步模型列表展示 */}
        {activeTab === 'models' && (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3 font-medium">模型 ID</th>
                    <th className="p-3 font-medium">分组</th>
                    <th className="p-3 font-medium text-right">参数量 (B)</th>
                    <th className="p-3 font-medium text-right">层数</th>
                    <th className="p-3 font-medium text-right">KV 头数</th>
                    <th className="p-3 font-medium">注意力架构</th>
                    <th className="p-3 font-medium text-right">实测权重 (GB)</th>
                    <th className="p-3 font-medium text-center">状态</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 text-slate-200">
                  {modelsData.models.map((m) => {
                    const paramsB = m.params ? (m.params / 1e9).toFixed(1) : '-';
                    const nativeWeight = m.weights_gb?.native ? `${m.weights_gb.native} GB` : '-';
                    return (
                      <tr key={m.id} className="hover:bg-slate-800/50 transition">
                        <td className="p-3 font-semibold text-cyan-300">{m.id}</td>
                        <td className="p-3 text-slate-400">{m.family}</td>
                        <td className="p-3 text-right">{paramsB}</td>
                        <td className="p-3 text-right">{m.layers ?? '-'}</td>
                        <td className="p-3 text-right">{m.kv_heads ?? '-'}</td>
                        <td className="p-3">
                          <span className={m.attention_type === 'MLA' ? 'text-amber-400' : 'text-slate-300'}>
                            {m.attention_type}
                          </span>
                        </td>
                        <td className="p-3 text-right text-emerald-400">{nativeWeight}</td>
                        <td className="p-3 text-center">
                          {m.stale ? (
                            <span className="text-amber-400">STALE</span>
                          ) : (
                            <span className="text-emerald-400">ACTIVE</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold text-slate-200">models.json 原始片段预览</span>
                <span>字符编码: UTF-8</span>
              </div>
              <pre className="font-mono text-xs bg-slate-950 p-3 rounded border border-slate-800 text-slate-300 max-h-64 overflow-y-auto">
                {JSON.stringify(modelsData, null, 2)}
              </pre>
            </div>
          </div>
        )}

        {/* 标签 3：字段说明规范 */}
        {activeTab === 'schema' && (
          <div className="p-5 rounded-lg bg-slate-900 border border-slate-800 space-y-4 text-xs">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              输出 JSON 字段规范与物理量纲
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 pr-4 font-medium">字段</th>
                    <th className="py-2 pr-4 font-medium">类型</th>
                    <th className="py-2 font-medium">说明与逻辑</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  <tr>
                    <td className="py-2.5 pr-4 text-cyan-300">id</td>
                    <td className="py-2.5 pr-4 text-slate-500">string</td>
                    <td className="py-2.5">Hugging Face 仓库标识符（如 Qwen/Qwen3-32B）</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-cyan-300">params</td>
                    <td className="py-2.5 pr-4 text-slate-500">number</td>
                    <td className="py-2.5">从 safetensors.total 获取的总参数量（个）</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-cyan-300">dtypes</td>
                    <td className="py-2.5 pr-4 text-slate-500">object</td>
                    <td className="py-2.5">各精度参数分布（如 BF16: 32762123264）</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-cyan-300">weights_gb</td>
                    <td className="py-2.5 pr-4 text-slate-500">object</td>
                    <td className="py-2.5">实测 .safetensors/.gguf/.bin 累计物理体积（GB = 字节/1024³，保留1位小数）</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-cyan-300">gguf</td>
                    <td className="py-2.5 pr-4 text-slate-500">object</td>
                    <td className="py-2.5">从文件名解析的 GGUF 量化等级分组物理大小（如 Q4_K_M: 19.1）</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-cyan-300">layers</td>
                    <td className="py-2.5 pr-4 text-slate-500">number</td>
                    <td className="py-2.5">网络隐藏层数（num_hidden_layers）</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-cyan-300">kv_heads</td>
                    <td className="py-2.5 pr-4 text-slate-500">number</td>
                    <td className="py-2.5">KV 注意力头数（num_key_value_heads，缺省时降级为 num_attention_heads）</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-cyan-300">attention_type</td>
                    <td className="py-2.5 pr-4 text-slate-500">string</td>
                    <td className="py-2.5">存在 kv_lora_rank 判定为 "MLA"，否则为 "GQA"（overrides 可覆盖）</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-cyan-300">stale</td>
                    <td className="py-2.5 pr-4 text-slate-500">boolean</td>
                    <td className="py-2.5">抓取遇到网络故障时是否保留并降级使用旧版历史数据</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 标签 4：GitHub Actions 部署指引 */}
        {activeTab === 'actions' && (
          <div className="p-5 rounded-lg bg-slate-900 border border-slate-800 space-y-4 text-xs">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              GitHub Actions 权限与 Secret 必需设置
            </h3>
            
            <div className="space-y-3 text-slate-300 leading-relaxed">
              <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                <div className="font-semibold text-slate-200">1. 开启工作流写权限（解决自动 Commit & Push 报错）</div>
                <p className="text-slate-400">
                  进入仓库 Settings -&gt; Actions -&gt; General -&gt; 滚动到底部 <strong>Workflow permissions</strong> -&gt; 选择 <strong>Read and write permissions</strong> 并点击 Save。
                </p>
              </div>

              <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                <div className="font-semibold text-slate-200">2. 添加 HF_TOKEN Secret（提升 Hugging Face 请求限额）</div>
                <p className="text-slate-400">
                  前往 Hugging Face -&gt; Settings -&gt; Access Tokens 创建只读 Token。<br />
                  进入 GitHub 仓库 Settings -&gt; Secrets and variables -&gt; Actions -&gt; 点击 <strong>New repository secret</strong>，Name 填 <code className="text-cyan-300">HF_TOKEN</code>，Value 填入获取的 Token。
                </p>
              </div>

              <div className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                <div className="font-semibold text-slate-200">3. 定时调度频率</div>
                <p className="text-slate-400">
                  工作流配置于 <code className="text-slate-300">.github/workflows/crawl.yml</code>，每日 <strong>UTC 02:00（北京时间 10:00）</strong> 自动触发，并且可在 Actions 页面通过 <strong>Run workflow</strong> 按钮随时手动触发。
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 底部版权与元信息 */}
      <footer className="border-t border-slate-800 py-6 text-xs text-slate-500 text-center">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>llm-vram-data · MIT License</span>
          <span>Zero external runtime dependencies · Pure Node.js 20 Native Fetch</span>
        </div>
      </footer>
    </div>
  );
}
