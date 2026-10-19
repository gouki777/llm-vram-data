import React, { useState, useMemo, useEffect } from 'react';
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
  Search,
  X,
  HelpCircle,
  PlayCircle,
  PlusCircle,
  Link2,
  Trash2,
  Plus,
  FolderTree,
  List,
  ChevronDown,
  ChevronRight,
  Download,
  Undo2,
  SlidersHorizontal,
  AlertTriangle,
  RotateCcw
} from 'lucide-react';
import initialModelsData from '../models.json';

interface ModelItem {
  id: string;
  family: string;
  created_at?: string | null;
  main_dtype?: string | null;
  params?: number | null;
  dtypes?: Record<string, any> | null;
  weights_gb?: Record<string, number>;
  weights_source?: Record<string, string>;
  gguf?: Record<string, number>;
  layers?: number | null;
  kv_heads?: number | null;
  head_dim?: number | null;
  kv_lora_rank?: number | null;
  attention_type?: string;
  max_context?: number | null;
  override_kv_per_token_kb?: number | null;
  kv_cache?: {
    elements_per_token?: number;
    bytes_per_token_fp16?: number;
    kb_per_token_fp16?: number;
    actual_max_context_tokens?: number;
    actual_max_context_k?: string;
    kv_max_context_gb_fp16?: number;
    kv_max_context_gb_fp8?: number;
    kv_max_context_gb_int4?: number;
  } | null;
  crawled_at?: string;
  stale?: boolean;
  error?: string;
  note?: string;
  qk_rope_head_dim?: number;
}

export default function App() {
  const [username, setUsername] = useState('your-username');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [activeTab, setActiveTab] = useState<'models' | 'overview' | 'importer' | 'schema' | 'actions' | 'faq'>('models');

  // 模型列表状态（优先从 initialModelsData 初始化）
  const [modelsList, setModelsList] = useState<ModelItem[]>(
    () => (initialModelsData.models as unknown as ModelItem[])
  );

  const [isCrawling, setIsCrawling] = useState(false);

  // 组件加载时优先拉取磁盘上真实的 models.json
  useEffect(() => {
    fetch('/api/data')
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.models)) {
          setModelsList(data.models);
        }
      })
      .catch(() => {
        // 后端不可用时回退为 initialModelsData
        setModelsList(initialModelsData.models as unknown as ModelItem[]);
      });
  }, []);

  // 最近删除项（用于撤销）
  const [lastDeleted, setLastDeleted] = useState<{ item: ModelItem; index: number } | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<ModelItem | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFamily, setSelectedFamily] = useState<string>('all');
  const [selectedAttention, setSelectedAttention] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'default' | 'created_desc' | 'weights_desc' | 'weights_asc' | 'params_desc'>('default');
  const [viewMode, setViewMode] = useState<'grouped' | 'table'>('grouped');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [calcContextK, setCalcContextK] = useState<string>('native_max');

  // 顶部快捷贴 URL 输入框
  const [quickUrl, setQuickUrl] = useState('');
  const [quickAddFeedback, setQuickAddFeedback] = useState<string | null>(null);

  // 批量导入标签页状态
  const [pasteText, setPasteText] = useState('');
  const [copiedImportJson, setCopiedImportJson] = useState(false);
  const [copiedImportCli, setCopiedImportCli] = useState(false);
  const [copiedReposJson, setCopiedReposJson] = useState(false);

  // 手动添加弹窗状态
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [manualId, setManualId] = useState('');
  const [manualFamily, setManualFamily] = useState('');
  const [manualAttention, setManualAttention] = useState('GQA');
  const [manualFp8Quant, setManualFp8Quant] = useState('');

  // 复制工具函数
  const copyToClipboard = (text: string, type: 'url' | 'curl' | 'repos') => {
    navigator.clipboard.writeText(text);
    if (type === 'url') {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else if (type === 'curl') {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    } else if (type === 'repos') {
      setCopiedReposJson(true);
      setTimeout(() => setCopiedReposJson(false), 2000);
    }
  };

  // 从 URL 提取 Model ID 与推断 Family
  const parseUrlToModel = (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return null;
    const urlMatch = trimmed.match(/huggingface\.co\/([^/?#\s]+\/[^/?#\s]+)/i);
    const idMatch = trimmed.match(/^([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)$/);
    const modelId = urlMatch ? urlMatch[1] : (idMatch ? idMatch[1] : null);
    if (!modelId) return null;

    const name = modelId.split('/')[1] || modelId;
    const matchFamily = name.match(/^(Qwen3(?:\.[0-9]+)?|Qwen2(?:\.[0-9]+)?|DeepSeek-V[0-9]+|MiMo-V[0-9]+(?:\.[0-9]+)?|Llama-[0-9]+(?:\.[0-9]+)?|Gemma-[0-9]+|Mistral|Phi-[0-9]+)/i);
    const family = matchFamily ? matchFamily[1] : (name.match(/^([A-Za-z0-9]+)[-_]/)?.[1] || name);
    return { modelId, family };
  };

  const [diskSyncStatus, setDiskSyncStatus] = useState<string | null>(null);

  // 强制全量同步写盘
  const syncCurrentToDisk = async () => {
    try {
      const repos = modelsList.map(m => ({
        id: m.id,
        family: m.family,
        ...(m.weights_gb && Object.keys(m.weights_gb).some(k => k !== 'native') ? {
          quants: Object.keys(m.weights_gb).reduce((acc: any, k) => {
            if (k !== 'native') acc[k] = `${m.id}-${k.toUpperCase()}`;
            return acc;
          }, {})
        } : {})
      }));

      const res = await fetch('/api/repos/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repos })
      });
      const data = await res.json();
      if (data.success) {
        setDiskSyncStatus(`✅ 已将当前 ${repos.length} 个模型永久保存至磁盘文件 config/repos.json！`);
        setTimeout(() => setDiskSyncStatus(null), 4000);
      }
    } catch {
      setDiskSyncStatus('⚠️ 写入失败，请检查服务连接');
      setTimeout(() => setDiskSyncStatus(null), 3000);
    }
  };

  // 快捷贴 URL 添加模型
  const handleQuickAdd = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!quickUrl.trim()) return;

    const parsed = parseUrlToModel(quickUrl);
    if (!parsed) {
      setQuickAddFeedback('⚠️ 请输入有效的 Hugging Face 模型链接或 ID (如 owner/repo)');
      setTimeout(() => setQuickAddFeedback(null), 3000);
      return;
    }

    const { modelId, family } = parsed;
    if (modelsList.some(m => m.id.toLowerCase() === modelId.toLowerCase())) {
      setQuickAddFeedback(`ℹ️ 模型 [${modelId}] 已在列表中，无需重复添加`);
      setTimeout(() => setQuickAddFeedback(null), 3000);
      return;
    }

    const hasFp8Quant = modelId.includes('Qwen') && !modelId.includes('FP8');
    const newModel: ModelItem = {
      id: modelId,
      family: family,
      attention_type: modelId.toLowerCase().includes('deepseek') ? 'CSA/HCA' : 'GQA',
      crawled_at: new Date().toISOString(),
      stale: false,
      weights_gb: {},
      weights_source: {},
      gguf: {},
      ...(hasFp8Quant ? { note: `自动配置量化: ${modelId}-FP8` } : {})
    };

    setModelsList(prev => [newModel, ...prev]);
    setQuickUrl('');
    setQuickAddFeedback(`✅ 成功添加模型: ${modelId} (分组: ${family})`);
    setTimeout(() => setQuickAddFeedback(null), 3500);

    // 同步到后端磁盘
    fetch('/api/models/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urlOrId: modelId, family }),
    }).then(() => {
      setDiskSyncStatus(`💾 已同步写入磁盘文件 config/repos.json: [${modelId}]`);
      setTimeout(() => setDiskSyncStatus(null), 4000);
    }).catch(err => console.warn('同步磁盘添加失败:', err));
  };

  // 删除模型处理（同步修改磁盘文件！）
  const handleDeleteModel = async (target: ModelItem) => {
    const index = modelsList.findIndex(m => m.id === target.id);
    if (index === -1) return;

    setLastDeleted({ item: target, index });
    setModelsList(prev => prev.filter(m => m.id !== target.id));
    setDeleteConfirmTarget(null);

    // 真正修改磁盘上的 config/repos.json 与 models.json！
    try {
      await fetch('/api/models/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.id }),
      });
      setDiskSyncStatus(`🗑️ 已永久从磁盘文件 config/repos.json 中移除 [${target.id}]`);
      setTimeout(() => setDiskSyncStatus(null), 4000);
    } catch (err) {
      console.warn('同步磁盘删除失败:', err);
    }
  };

  // 撤销删除
  const handleUndoDelete = () => {
    if (!lastDeleted) return;
    setModelsList(prev => {
      const copy = [...prev];
      copy.splice(lastDeleted.index, 0, lastDeleted.item);
      return copy;
    });

    fetch('/api/models/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urlOrId: lastDeleted.item.id, family: lastDeleted.item.family }),
    }).catch(err => console.warn('恢复失败:', err));

    setLastDeleted(null);
  };

  // 重置回初始模型数据
  const handleResetToInitial = () => {
    if (window.confirm('确定要恢复到官方初始模型列表（8 个模型）吗？')) {
      setModelsList(initialModelsData.models as unknown as ModelItem[]);
      localStorage.removeItem('llm_vram_models_cache');
      setLastDeleted(null);
    }
  };

  // 提取所有唯一的家族列表
  const allFamilies = useMemo(() => {
    const set = new Set<string>();
    modelsList.forEach(m => {
      if (m.family) set.add(m.family);
    });
    return Array.from(set).sort();
  }, [modelsList]);

  // 多条件过滤与排序
  const filteredAndSortedModels = useMemo(() => {
    let result = modelsList.filter(m => {
      // 关键字搜索
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase().trim();
        const idMatch = m.id.toLowerCase().includes(term);
        const familyMatch = m.family ? m.family.toLowerCase().includes(term) : false;
        if (!idMatch && !familyMatch) return false;
      }
      // 家族筛选
      if (selectedFamily !== 'all' && m.family !== selectedFamily) {
        return false;
      }
      // 注意力架构筛选
      if (selectedAttention !== 'all' && m.attention_type !== selectedAttention) {
        return false;
      }
      // 发布年份筛选
      if (selectedYear !== 'all') {
        const year = m.created_at ? m.created_at.substring(0, 4) : '';
        if (selectedYear === '2026' && year !== '2026') return false;
        if (selectedYear === '2025' && year !== '2025') return false;
        if (selectedYear === '2024_earlier' && (year === '2025' || year === '2026')) return false;
      }
      return true;
    });

    // 排序逻辑
    if (sortBy === 'created_desc') {
      result.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    } else if (sortBy === 'weights_desc') {
      result.sort((a, b) => (b.weights_gb?.native ?? 0) - (a.weights_gb?.native ?? 0));
    } else if (sortBy === 'weights_asc') {
      result.sort((a, b) => (a.weights_gb?.native ?? 0) - (b.weights_gb?.native ?? 0));
    } else if (sortBy === 'params_desc') {
      result.sort((a, b) => (b.params ?? 0) - (a.params ?? 0));
    }

    return result;
  }, [modelsList, searchTerm, selectedFamily, selectedAttention, selectedYear, sortBy]);

  // 自动分组数据组织
  const groupedData = useMemo(() => {
    const groupsMap = new Map<string, ModelItem[]>();
    for (const m of filteredAndSortedModels) {
      const f = m.family || '未分组';
      if (!groupsMap.has(f)) {
        groupsMap.set(f, []);
      }
      groupsMap.get(f)!.push(m);
    }

    return Array.from(groupsMap.entries()).map(([family, items]) => {
      const totalWeight = items.reduce((acc, curr) => acc + (curr.weights_gb?.native || 0), 0);
      const totalParams = items.reduce((acc, curr) => acc + (curr.params || 0), 0);
      return {
        family,
        items,
        count: items.length,
        totalWeight: totalWeight > 0 ? totalWeight.toFixed(1) : null,
        totalParamsB: totalParams > 0 ? (totalParams / 1e9).toFixed(1) : null,
      };
    });
  }, [filteredAndSortedModels]);

  // 切换单组折叠展开
  const toggleGroupCollapse = (family: string) => {
    setCollapsedGroups(prev => ({ ...prev, [family]: !prev[family] }));
  };

  // 全部展开 / 折叠
  const toggleAllGroups = (collapse: boolean) => {
    const next: Record<string, boolean> = {};
    groupedData.forEach(g => {
      next[g.family] = collapse;
    });
    setCollapsedGroups(next);
  };

  // 实时生成的 config/repos.json 格式
  const currentReposJson = useMemo(() => {
    const repos = modelsList.map(m => {
      const entry: { id: string; family: string; quants?: Record<string, string> } = {
        id: m.id,
        family: m.family
      };
      if (m.weights_gb && Object.keys(m.weights_gb).some(k => k !== 'native')) {
        entry.quants = {};
        for (const k of Object.keys(m.weights_gb)) {
          if (k !== 'native') entry.quants[k] = `${m.id}-${k.toUpperCase()}`;
        }
      }
      return entry;
    });
    return JSON.stringify(repos, null, 2);
  }, [modelsList]);

  // 下载 repos.json
  const downloadReposJson = () => {
    const blob = new Blob([currentReposJson + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'repos.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // 批量导入解析
  const parsedImportItems = useMemo(() => {
    if (!pasteText.trim()) return [];
    const lines = pasteText.split(/[\r\n\s]+/).filter(Boolean);
    const items: Array<{ raw: string; id: string; family: string; exists: boolean }> = [];
    const seen = new Set<string>();

    for (const line of lines) {
      const parsed = parseUrlToModel(line);
      if (!parsed || seen.has(parsed.modelId)) continue;
      seen.add(parsed.modelId);
      const exists = modelsList.some(m => m.id === parsed.modelId);
      items.push({
        raw: line,
        id: parsed.modelId,
        family: parsed.family,
        exists,
      });
    }
    return items;
  }, [pasteText, modelsList]);

  // 批量加入当前列表 (并写盘持久化)
  const handleBatchImportToCurrent = async () => {
    const toAdd = parsedImportItems.filter(i => !i.exists);
    if (toAdd.length === 0) return;

    const newModels: ModelItem[] = toAdd.map(item => ({
      id: item.id,
      family: item.family,
      attention_type: item.id.toLowerCase().includes('deepseek') ? 'CSA/HCA' : 'GQA',
      crawled_at: new Date().toISOString(),
      stale: false,
      weights_gb: {},
      weights_source: {},
      gguf: {},
    }));

    const updatedList = [...newModels, ...modelsList];
    setModelsList(updatedList);
    setPasteText('');
    setActiveTab('models');

    // 逐个写盘或统一同步
    for (const item of toAdd) {
      try {
        await fetch('/api/models/add', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urlOrId: item.id, family: item.family }),
        });
      } catch (err) {
        console.warn('批量写盘失败:', item.id, err);
      }
    }
    setDiskSyncStatus(`💾 批量写盘成功: 已保存 ${toAdd.length} 个新模型至 config/repos.json`);
    setTimeout(() => setDiskSyncStatus(null), 4000);
  };

  const rawUrl = `https://raw.githubusercontent.com/${username || '<username>'}/llm-vram-data/main/models.json`;
  const curlCmd = `curl -s "${rawUrl}" | jq .`;

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
              <span className="text-xs text-slate-500 ml-2 hidden sm:inline">v{initialModelsData.schema_version}.0 · Open LLM Parameter Dataset</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xs text-emerald-400 font-mono flex items-center gap-1.5 hidden sm:flex">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {modelsList.length} 模型已录入
            </span>
            <button
              onClick={syncCurrentToDisk}
              className="text-xs bg-cyan-900/60 hover:bg-cyan-800 text-cyan-200 flex items-center gap-1.5 px-3 py-1.5 rounded border border-cyan-700 transition"
              title="将当前页面中的所有修改立即写入服务器磁盘文件 config/repos.json"
            >
              <Download className="w-3.5 h-3.5 text-cyan-300" />
              <span>保存到磁盘</span>
            </button>
            <button
              onClick={() => copyToClipboard(currentReposJson, 'repos')}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-700 transition hidden sm:flex"
              title="复制当前最新 config/repos.json"
            >
              {copiedReposJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedReposJson ? '已复制' : '复制 repos.json'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* 主体区域 */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex-1 w-full space-y-6">
        
        {/* 磁盘同步状态条 */}
        {diskSyncStatus && (
          <div className="bg-cyan-950/80 border border-cyan-800 rounded-lg p-3 text-xs flex items-center justify-between text-cyan-200 shadow-sm animate-fadeIn">
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{diskSyncStatus}</span>
            </div>
            <span className="text-[11px] text-cyan-400/80 font-mono hidden sm:inline">文件状态: 已写盘</span>
          </div>
        )}
        
        {/* 顶部快捷贴 URL 快速录入栏 */}
        <section className="bg-slate-900 border border-slate-800 rounded-lg p-3 sm:p-4 shadow-sm">
          <form onSubmit={handleQuickAdd} className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-cyan-400" />
                <span>贴 URL 快速录入模型</span>
                <span className="text-slate-500 font-normal">支持直接粘贴 Hugging Face 链接或 ID</span>
              </label>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(true)}
                  className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>手动高级录入</span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={quickUrl}
                  onChange={(e) => setQuickUrl(e.target.value)}
                  placeholder="在此直接粘贴模型 URL，如 https://huggingface.co/Qwen/Qwen3.8-27B"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-md px-3 py-2 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none transition"
                />
                {quickUrl && (
                  <button
                    type="button"
                    onClick={() => setQuickUrl('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="shrink-0 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-md text-xs font-medium flex items-center gap-1.5 transition active:scale-95 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>添加模型</span>
              </button>
            </div>

            {quickAddFeedback && (
              <div className="text-xs font-mono text-cyan-400 pt-1 flex items-center gap-1.5 animate-fadeIn">
                <span>{quickAddFeedback}</span>
              </div>
            )}
          </form>
        </section>

        {/* 撤销删除浮动提示 */}
        {lastDeleted && (
          <div className="bg-amber-950/60 border border-amber-800/80 rounded-lg p-3 text-xs flex items-center justify-between text-amber-200 animate-fadeIn">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>已移除模型 <strong className="font-mono">{lastDeleted.item.id}</strong></span>
            </div>
            <button
              onClick={handleUndoDelete}
              className="flex items-center gap-1 px-2.5 py-1 bg-amber-900/60 hover:bg-amber-800 text-amber-200 rounded border border-amber-700 transition"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>撤销删除</span>
            </button>
          </div>
        )}

        {/* 导航标签切换 */}
        <div className="border-b border-slate-800 flex gap-4 text-sm font-medium overflow-x-auto">
          <button
            onClick={() => setActiveTab('models')}
            className={`pb-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'models' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Database className="w-3.5 h-3.5" />
            已录入与同步模型 ({modelsList.length})
          </button>
          <button
            onClick={() => setActiveTab('importer')}
            className={`pb-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'importer' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <Link2 className="w-3.5 h-3.5" />
            批量贴 URL 录入
          </button>
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 border-b-2 transition whitespace-nowrap ${activeTab === 'overview' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            仓库结构与快速指引
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`pb-3 border-b-2 transition whitespace-nowrap ${activeTab === 'schema' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            字段规范说明
          </button>
          <button
            onClick={() => setActiveTab('actions')}
            className={`pb-3 border-b-2 transition whitespace-nowrap ${activeTab === 'actions' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            Actions 调度配置
          </button>
          <button
            onClick={() => setActiveTab('faq')}
            className={`pb-3 border-b-2 transition flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'faq' ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            F&QA 操作指引
          </button>
        </div>

        {/* 标签 1：已同步模型数据（自动分组 + 多维筛选 + 删除管理） */}
        {activeTab === 'models' && (
          <div className="space-y-4">
            {/* 综合过滤与视图控制栏 */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* 搜索框 */}
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="按模型 ID 或分组搜索 (如 Qwen, DeepSeek)..."
                    className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 rounded-md pl-9 pr-8 py-2 text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none transition"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* 视图切换 & 排序控制 */}
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded border border-slate-800">
                    <button
                      onClick={() => setViewMode('grouped')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded transition ${viewMode === 'grouped' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'text-slate-400 hover:text-slate-200'}`}
                      title="按家族自动分组"
                    >
                      <FolderTree className="w-3.5 h-3.5" />
                      <span>家族分组</span>
                    </button>
                    <button
                      onClick={() => setViewMode('table')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded transition ${viewMode === 'table' ? 'bg-cyan-950 text-cyan-300 border border-cyan-800' : 'text-slate-400 hover:text-slate-200'}`}
                      title="平铺紧凑表格"
                    >
                      <List className="w-3.5 h-3.5" />
                      <span>平铺表格</span>
                    </button>
                  </div>

                  {/* 排序下拉 */}
                  <div className="flex items-center gap-1 bg-slate-950 px-2 py-1.5 rounded border border-slate-800 text-slate-400">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as any)}
                      className="bg-transparent text-slate-300 text-xs focus:outline-none cursor-pointer"
                    >
                      <option value="default" className="bg-slate-900">默认排序</option>
                      <option value="created_desc" className="bg-slate-900">发布时间 (最新 → 最早)</option>
                      <option value="weights_desc" className="bg-slate-900">实测显存 (高 → 低)</option>
                      <option value="weights_asc" className="bg-slate-900">实测显存 (低 → 高)</option>
                      <option value="params_desc" className="bg-slate-900">参数量 (大 → 小)</option>
                    </select>
                  </div>

                  {/* 发布年份筛选 */}
                  <div className="flex items-center gap-1 bg-slate-950 px-2 py-1.5 rounded border border-slate-800 text-slate-400">
                    <span>年份:</span>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="bg-transparent text-slate-300 text-xs focus:outline-none cursor-pointer font-mono"
                    >
                      <option value="all" className="bg-slate-900">全部年份</option>
                      <option value="2026" className="bg-slate-900">2026年至今 (新模型)</option>
                      <option value="2025" className="bg-slate-900">2025年</option>
                      <option value="2024_earlier" className="bg-slate-900">2024年及更早</option>
                    </select>
                  </div>

                  {/* 注意力类型筛选 */}
                  <div className="flex items-center gap-1 bg-slate-950 px-2 py-1.5 rounded border border-slate-800 text-slate-400">
                    <span>架构:</span>
                    <select
                      value={selectedAttention}
                      onChange={(e) => setSelectedAttention(e.target.value)}
                      className="bg-transparent text-slate-300 text-xs focus:outline-none cursor-pointer font-mono"
                    >
                      <option value="all" className="bg-slate-900">全部架构</option>
                      <option value="GQA" className="bg-slate-900">GQA</option>
                      <option value="MLA" className="bg-slate-900">MLA</option>
                      <option value="CSA/HCA" className="bg-slate-900">CSA/HCA (压缩)</option>
                    </select>
                  </div>

                  {/* 测算 Context 动态长度选择 */}
                  <div className="flex items-center gap-1 bg-cyan-950/60 px-2 py-1.5 rounded border border-cyan-800/80 text-cyan-300">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                    <span>KV 测算 Context:</span>
                    <select
                      value={calcContextK}
                      onChange={(e) => setCalcContextK(e.target.value)}
                      className="bg-transparent text-cyan-200 text-xs focus:outline-none cursor-pointer font-mono font-medium"
                    >
                      <option value="native_max" className="bg-slate-900">模型原生 Max Context</option>
                      <option value="32" className="bg-slate-900">32K Tokens</option>
                      <option value="64" className="bg-slate-900">64K Tokens</option>
                      <option value="128" className="bg-slate-900">128K Tokens</option>
                      <option value="256" className="bg-slate-900">256K Tokens</option>
                      <option value="512" className="bg-slate-900">512K Tokens</option>
                      <option value="1024" className="bg-slate-900">1024K (1M) Tokens</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 家族快捷筛选标签条 */}
              <div className="flex items-center gap-1.5 pt-2 border-t border-slate-800/80 overflow-x-auto text-xs">
                <span className="text-slate-500 shrink-0">家族筛选:</span>
                <button
                  onClick={() => setSelectedFamily('all')}
                  className={`px-2.5 py-1 rounded text-xs transition shrink-0 ${selectedFamily === 'all' ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                >
                  全部 ({modelsList.length})
                </button>
                {allFamilies.map(f => {
                  const count = modelsList.filter(m => m.family === f).length;
                  return (
                    <button
                      key={f}
                      onClick={() => setSelectedFamily(f)}
                      className={`px-2.5 py-1 rounded text-xs transition shrink-0 ${selectedFamily === f ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'}`}
                    >
                      {f} ({count})
                    </button>
                  );
                })}

                <div className="ml-auto flex items-center gap-2 text-xs text-slate-500 shrink-0">
                  {viewMode === 'grouped' && (
                    <>
                      <button
                        onClick={() => toggleAllGroups(false)}
                        className="text-slate-400 hover:text-slate-200 underline"
                      >
                        展开全部
                      </button>
                      <span>·</span>
                      <button
                        onClick={() => toggleAllGroups(true)}
                        className="text-slate-400 hover:text-slate-200 underline"
                      >
                        折叠全部
                      </button>
                    </>
                  )}
                  <span>·</span>
                  <button
                    onClick={handleResetToInitial}
                    className="text-slate-400 hover:text-amber-300 flex items-center gap-1"
                    title="重置为默认模型列表"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>恢复预置</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 过滤结果为空 */}
            {filteredAndSortedModels.length === 0 && (
              <div className="p-12 text-center rounded-lg border border-slate-800 bg-slate-900 space-y-3">
                <p className="text-slate-400 text-sm">未找到符合当前筛选条件的模型</p>
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedFamily('all');
                    setSelectedAttention('all');
                  }}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded text-xs font-medium border border-slate-700 transition"
                >
                  重置所有筛选条件
                </button>
              </div>
            )}

            {/* 模式 A：按家族自动分组视图 (Grouped View) */}
            {viewMode === 'grouped' && groupedData.map(group => {
              const isCollapsed = collapsedGroups[group.family];
              return (
                <div key={group.family} className="rounded-lg border border-slate-800 bg-slate-900 overflow-hidden space-y-0">
                  {/* 分组头部 */}
                  <div
                    onClick={() => toggleGroupCollapse(group.family)}
                    className="p-3.5 bg-slate-950/70 hover:bg-slate-950 border-b border-slate-800/80 flex items-center justify-between cursor-pointer select-none transition"
                  >
                    <div className="flex items-center gap-2.5">
                      {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-cyan-400" />}
                      <span className="font-semibold text-slate-100 text-sm">{group.family}</span>
                      <span className="text-xs text-cyan-400 font-mono bg-cyan-950/60 border border-cyan-800 px-2 py-0.5 rounded">
                        {group.count} 个模型
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                      {group.totalWeight && (
                        <span className="hidden sm:inline">
                          显存总计: <strong className="text-emerald-400">{group.totalWeight} GB</strong>
                        </span>
                      )}
                      {group.totalParamsB && (
                        <span className="hidden md:inline">
                          参数量: <strong className="text-slate-300">{group.totalParamsB} B</strong>
                        </span>
                      )}
                      <span className="text-slate-500 text-[11px]">{isCollapsed ? '点击展开' : '点击收起'}</span>
                    </div>
                  </div>

                  {/* 分组内模型卡片/表格 */}
                  {!isCollapsed && (
                    <div className="divide-y divide-slate-800/60 font-mono text-xs">
                      {group.items.map(m => {
                        const paramsB = m.params ? (m.params / 1e9).toFixed(1) : '-';
                        const nativeWeight = m.weights_gb?.native ? `${m.weights_gb.native} GB` : '-';
                        const fp8Weight = m.weights_gb?.fp8 ? `${m.weights_gb.fp8} GB` : null;

                        return (
                          <div key={m.id} className="p-3 hover:bg-slate-800/40 transition flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-cyan-300 hover:underline cursor-pointer" onClick={() => copyToClipboard(m.id, 'url')}>
                                  {m.id}
                                </span>
                                <a
                                  href={`https://huggingface.co/${m.id}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-slate-500 hover:text-slate-300"
                                  title="在 Hugging Face 查看"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                                {m.stale && (
                                  <span className="text-amber-400 text-[10px] border border-amber-800 px-1.5 rounded">STALE</span>
                                )}
                                {m.attention_type === 'CSA/HCA' && (
                                  <span className="text-amber-400 text-[10px] border border-amber-900 bg-amber-950/40 px-1 rounded">压缩注意力</span>
                                )}
                              </div>

                              <div className="text-slate-400 text-[11px] flex items-center gap-3 flex-wrap">
                                {m.created_at && (
                                  <span className="text-cyan-400/90 font-mono">📅 发布: <strong className="text-slate-200">{m.created_at}</strong></span>
                                )}
                                <span>原生主精度: <strong className="text-cyan-300 font-mono px-1 rounded bg-slate-800 border border-slate-700">{m.main_dtype || 'BF16'}</strong></span>
                                <span>层数: <strong className="text-slate-200">{m.layers ?? '-'}</strong></span>
                                <span>KV 头数: <strong className="text-slate-200">{m.kv_heads ?? '-'}</strong></span>
                                <span>单头维度: <strong className="text-slate-200">{m.head_dim ?? '-'}</strong></span>
                                <span>架构: <strong className={m.attention_type === 'MLA' || m.attention_type === 'CSA/HCA' ? 'text-amber-400' : 'text-slate-200'}>{m.attention_type || 'GQA'}</strong></span>
                                {m.max_context && <span>最大 Context: <strong className="text-slate-300 font-semibold">{(m.max_context / 1024).toFixed(0)}K</strong></span>}
                              </div>

                              {m.kv_cache && (() => {
                                const isNativeMax = calcContextK === 'native_max';
                                const targetTokens = isNativeMax
                                  ? (m.max_context || m.kv_cache.actual_max_context_tokens || 131072)
                                  : (parseInt(calcContextK, 10) * 1024);
                                const targetKStr = isNativeMax
                                  ? `${Math.round(targetTokens / 1024)}K (原生 Max)`
                                  : `${calcContextK}K`;

                                const bytesPerTokenFp16 = m.kv_cache.bytes_per_token_fp16 || (m.kv_cache.kb_per_token_fp16 ? m.kv_cache.kb_per_token_fp16 * 1024 : 0);
                                const kvMaxGbFp16 = Number(((bytesPerTokenFp16 * targetTokens) / (1024 ** 3)).toFixed(2));
                                const kvMaxGbFp8 = Number((kvMaxGbFp16 / 2).toFixed(2));
                                const kvMaxGbInt4 = Number((kvMaxGbFp16 / 4).toFixed(2));

                                const isExceeding = m.max_context ? targetTokens > m.max_context : false;

                                return (
                                  <div className="text-[11px] font-mono text-cyan-300/90 flex items-center gap-2.5 pt-1 flex-wrap bg-cyan-950/25 px-2.5 py-1.5 rounded border border-cyan-900/40">
                                    <span className="flex items-center gap-1">
                                      <span>⚡ 单 Token KV:</span>
                                      <strong className="text-cyan-300 bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-800">{m.kv_cache.kb_per_token_fp16} KB</strong>
                                    </span>
                                    <span>·</span>
                                    <span className="flex items-center gap-1 flex-wrap">
                                      <span>测算 Context (<strong>{targetKStr}</strong>) KV 显存:</span>
                                      <strong className="text-emerald-400">{kvMaxGbFp16} GB</strong> <span className="text-[10px] text-slate-400">(FP16)</span> / <strong className="text-cyan-300">{kvMaxGbFp8} GB</strong> <span className="text-[10px] text-slate-400">(FP8)</span> / <strong className="text-indigo-300">{kvMaxGbInt4} GB</strong> <span className="text-[10px] text-slate-400">(INT4)</span>
                                    </span>
                                    {isExceeding && (
                                      <span className="text-amber-400 text-[10px] bg-amber-950/80 border border-amber-800 px-1.5 py-0.5 rounded font-sans">
                                        ⚠️ 超出该模型原生 Max Context ({(m.max_context! / 1024).toFixed(0)}K)
                                      </span>
                                    )}
                                  </div>
                                );
                              })()}

                              {m.note && (
                                <div className="text-[11px] text-amber-400/80 font-sans">
                                  💡 备注: {m.note}
                                </div>
                              )}
                            </div>

                            {/* 右侧显存指标与删除按钮 */}
                            <div className="flex items-center gap-4 shrink-0">
                              <div className="text-right space-y-0.5">
                                <div className="text-slate-200 font-semibold flex items-center justify-end gap-1">
                                  <span>{nativeWeight}</span>
                                  <span className="text-[10px] bg-slate-800 border border-slate-700 text-cyan-300 px-1 rounded">{m.main_dtype || 'BF16'}</span>
                                </div>
                                {fp8Weight && (
                                  <div className="text-emerald-400 text-[11px] flex items-center justify-end gap-1">
                                    <span>{fp8Weight}</span>
                                    <span className="text-[10px] bg-emerald-950 border border-emerald-800 text-emerald-300 px-1 rounded">FP8</span>
                                  </div>
                                )}
                                <div className="text-[10px] text-slate-500 font-mono">
                                  源: HF Safetensors 实测
                                </div>
                              </div>

                              <div className="text-right hidden sm:block">
                                <div className="text-slate-300">{paramsB} B</div>
                                <div className="text-[10px] text-slate-500">参数量</div>
                              </div>

                              <button
                                onClick={() => setDeleteConfirmTarget(m)}
                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/30 rounded border border-transparent hover:border-red-900/50 transition"
                                title="从监控列表中移除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* 模式 B：平铺完整表格视图 (Table View) */}
            {viewMode === 'table' && filteredAndSortedModels.length > 0 && (
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
                      <th className="p-3 font-medium text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-200">
                    {filteredAndSortedModels.map((m) => {
                      const paramsB = m.params ? (m.params / 1e9).toFixed(1) : '-';
                      const nativeWeight = m.weights_gb?.native ? `${m.weights_gb.native} GB` : '-';
                      return (
                        <tr key={m.id} className="hover:bg-slate-800/50 transition">
                          <td className="p-3 font-semibold text-cyan-300">
                            <div className="flex items-center gap-1.5">
                              <span>{m.id}</span>
                              <a href={`https://huggingface.co/${m.id}`} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-slate-300">
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </td>
                          <td className="p-3 text-slate-400">{m.family}</td>
                          <td className="p-3 text-right">{paramsB}</td>
                          <td className="p-3 text-right">{m.layers ?? '-'}</td>
                          <td className="p-3 text-right">{m.kv_heads ?? '-'}</td>
                          <td className="p-3">
                            <span className={m.attention_type === 'MLA' || m.attention_type === 'CSA/HCA' ? 'text-amber-400' : 'text-slate-300'}>
                              {m.attention_type || 'GQA'}
                            </span>
                          </td>
                          <td className="p-3 text-right text-emerald-400">{nativeWeight}</td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => setDeleteConfirmTarget(m)}
                              className="text-slate-500 hover:text-red-400 p-1 rounded transition"
                              title="删除模型"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* 底部导出与状态条 */}
            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="text-slate-400 flex items-center gap-2">
                <span>当前模型库包含: <strong className="text-slate-200">{modelsList.length}</strong> 个模型</span>
                <span>·</span>
                <span>对应配置文件: <code className="text-cyan-300">config/repos.json</code></span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(currentReposJson, 'repos')}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 flex items-center gap-1.5 transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制 repos.json</span>
                </button>
                <button
                  onClick={downloadReposJson}
                  className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下载 repos.json</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 标签 2：批量贴 URL 录入 */}
        {activeTab === 'importer' && (
          <div className="space-y-6 text-xs">
            <div className="p-5 rounded-lg bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Link2 className="w-4 h-4 text-cyan-400" />
                    批量贴 URL 智能解析与追加配置
                  </h3>
                  <p className="text-slate-400 mt-1">
                    在此处粘贴多个 Hugging Face 模型页面 URL（支持多行粘贴，自动去重并推断分组家族）：
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setPasteText(
`https://huggingface.co/Qwen/Qwen3.8-27B
https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro
https://huggingface.co/XiaomiMiMo/MiMo-V2.6-Pro-RL
https://huggingface.co/XiaomiMiMo/MiMo-V2.6-Flash-RL`
                      );
                    }}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                  >
                    填入示例链接
                  </button>
                  {pasteText && (
                    <button
                      onClick={() => setPasteText('')}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition"
                    >
                      清空
                    </button>
                  )}
                </div>
              </div>

              {/* 输入框 */}
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="例如粘贴：&#10;https://huggingface.co/Qwen/Qwen3.8-27B&#10;https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro"
                rows={4}
                className="w-full bg-slate-950 border border-slate-800 rounded-md p-3 font-mono text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition"
              />

              {/* 实时解析结果卡片 */}
              {parsedImportItems.length > 0 && (
                <div className="space-y-4 pt-2 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-400" />
                      已识别到 {parsedImportItems.length} 个模型目标：
                    </span>
                    <button
                      onClick={handleBatchImportToCurrent}
                      className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-medium transition flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>一键导入到当前模型库 ({parsedImportItems.filter(i => !i.exists).length})</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {parsedImportItems.map((item) => (
                      <div key={item.id} className="p-3 rounded bg-slate-950 border border-slate-800 space-y-1">
                        <div className="font-mono text-cyan-300 font-semibold truncate" title={item.id}>
                          {item.id}
                        </div>
                        <div className="text-slate-400 flex items-center justify-between">
                          <span>推断分组: <code className="text-slate-300">{item.family}</code></span>
                          {item.exists ? (
                            <span className="text-cyan-400 text-[10px]">已在库中</span>
                          ) : (
                            <span className="text-emerald-400 text-[10px] font-medium">+ 待追加</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 标签 3：概览与仓库文件树 */}
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
│   ├── crawl.mjs                 # 爬虫主程序（Node.js 20 原生 fetch）
│   ├── add-model.mjs             # 贴 URL 自动录入脚本
│   └── remove-model.mjs          # 快速删除模型脚本
├── models.json                   # 爬虫产出静态数据（根目录公开消费）
└── README.md                     # 中文使用文档与规范`}
              </pre>
            </div>

            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                CLI 命令行一键录入与删除
              </h3>
              <pre className="font-mono text-xs bg-slate-950 p-3 rounded border border-slate-800 text-emerald-400 leading-relaxed overflow-x-auto">
{`# 1. 贴 URL 自动录入（自动嗅探 FP8 量化版本）
node scripts/add-model.mjs https://huggingface.co/Qwen/Qwen3.8-27B

# 2. 命令行删除模型
node scripts/remove-model.mjs Qwen/Qwen3-8B

# 3. 运行爬虫更新数据
node scripts/crawl.mjs`}
              </pre>
            </div>
          </div>
        )}

        {/* 标签 4：字段说明规范 */}
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
                    <td className="py-2.5">Hugging Face 仓库标识符（如 Qwen/Qwen3.8-27B）</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-cyan-300">family</td>
                    <td className="py-2.5 pr-4 text-slate-500">string</td>
                    <td className="py-2.5">模型分组家族（如 Qwen3.8, DeepSeek-V4, MiMo-V2.6）</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-cyan-300">weights_gb</td>
                    <td className="py-2.5 pr-4 text-slate-500">object</td>
                    <td className="py-2.5">实测 .safetensors/.gguf/.bin 物理体积（GB = 字节/1024³，保留1位小数）</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 text-cyan-300">attention_type</td>
                    <td className="py-2.5 pr-4 text-slate-500">string</td>
                    <td className="py-2.5">GQA（标准）、MLA（多头潜变量）、CSA/HCA（压缩注意力）</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 标签 5：GitHub Actions 部署指引 */}
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
            </div>
          </div>
        )}

        {/* 标签 6：F&QA 操作指引 */}
        {activeTab === 'faq' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
              <h4 className="font-semibold text-cyan-400 flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4" />
                如何通过命令行录入或删除模型？
              </h4>
              <p className="text-slate-300 leading-relaxed">
                仓库内提供了原生自动化脚本：<br />
                - 录入：<code className="text-emerald-400 font-mono">node scripts/add-model.mjs https://huggingface.co/Qwen/Qwen3.8-27B</code><br />
                - 删除：<code className="text-red-400 font-mono">node scripts/remove-model.mjs Qwen/Qwen3-8B</code>
              </p>
            </div>
          </div>
        )}
      </main>

      {/* 删除确认弹窗 */}
      {deleteConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-semibold text-slate-100 text-sm">确认移除监控模型？</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              确定要从监控列表中移除模型 <strong className="font-mono text-cyan-300">{deleteConfirmTarget.id}</strong> 吗？
              移除后生成的 <code className="text-slate-400">repos.json</code> 将不再包含此项。
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeleteConfirmTarget(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
              >
                取消
              </button>
              <button
                onClick={() => handleDeleteModel(deleteConfirmTarget)}
                className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 手动高级添加模型弹窗 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-lg max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-400" />
                手动录入新模型
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">模型 ID (如 Qwen/Qwen3.8-27B)</label>
                <input
                  type="text"
                  value={manualId}
                  onChange={(e) => {
                    setManualId(e.target.value);
                    const parsed = parseUrlToModel(e.target.value);
                    if (parsed) setManualFamily(parsed.family);
                  }}
                  placeholder="作者/仓库名"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">所属家族 Family (如 Qwen3.8, DeepSeek-V4)</label>
                <input
                  type="text"
                  value={manualFamily}
                  onChange={(e) => setManualFamily(e.target.value)}
                  placeholder="家族分组名称"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">注意力架构</label>
                <select
                  value={manualAttention}
                  onChange={(e) => setManualAttention(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="GQA">GQA (标准分组查询注意力)</option>
                  <option value="MLA">MLA (多头潜变量注意力)</option>
                  <option value="CSA/HCA">CSA/HCA (压缩上下文注意力)</option>
                </select>
              </div>

              <div>
                <label className="text-slate-300 block mb-1">量化衍生仓库 (可选，如 FP8 仓库)</label>
                <input
                  type="text"
                  value={manualFp8Quant}
                  onChange={(e) => setManualFp8Quant(e.target.value)}
                  placeholder="如 Qwen/Qwen3.8-27B-FP8"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (!manualId.trim()) return;
                  const newEntry: ModelItem = {
                    id: manualId.trim(),
                    family: manualFamily.trim() || manualId.split('/')[1] || manualId,
                    attention_type: manualAttention,
                    crawled_at: new Date().toISOString(),
                    stale: false,
                    weights_gb: {},
                    weights_source: {},
                    gguf: {},
                  };
                  if (manualFp8Quant.trim()) {
                    newEntry.weights_gb = { fp8: 0 };
                  }
                  setModelsList(prev => [newEntry, ...prev]);
                  setIsAddModalOpen(false);
                  setManualId('');
                  setManualFamily('');
                  setManualFp8Quant('');
                }}
                className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium transition"
              >
                添加至列表
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 底部版权 */}
      <footer className="border-t border-slate-800 py-6 text-xs text-slate-500 text-center">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>llm-vram-data · MIT License</span>
          <span>Zero external runtime dependencies · Pure Node.js 20 Native Fetch</span>
        </div>
      </footer>
    </div>
  );
}
