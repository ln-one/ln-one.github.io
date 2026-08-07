import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { GraphViewEngine } from './graph-view-engine';
import { type GraphViewCanvasData, PixiGraphViewCanvas, type PixiGraphViewCanvasHandle } from './PixiGraphViewCanvas';
import {
  type KnowledgeNetworkArtifactTone,
  type KnowledgeNetworkSource,
  type KnowledgeNetworkSourceFamily,
  type KnowledgeNetworkTrace,
  prepareKnowledgeNetworkGraphPlan,
} from './knowledge-network-plan';
import type { GraphViewData, GraphViewNodeInput } from './types';

type Theme = 'light' | 'dark';

type KnowledgeNetworkCanvasNodeData = GraphViewCanvasData & {
  label: string;
  detail: string;
  family?: KnowledgeNetworkSourceFamily;
};

const SOURCE_PALETTE: Record<KnowledgeNetworkSourceFamily | 'workspace', Record<Theme, string>> = {
  pdf: { light: '#be123c', dark: '#fda4af' },
  document: { light: '#1d4ed8', dark: '#93c5fd' },
  presentation: { light: '#c2410c', dark: '#fdba74' },
  spreadsheet: { light: '#0f766e', dark: '#5eead4' },
  text: { light: '#0369a1', dark: '#7dd3fc' },
  table: { light: '#15803d', dark: '#86efac' },
  structured: { light: '#7e22ce', dark: '#d8b4fe' },
  code: { light: '#475569', dark: '#cbd5e1' },
  captions: { light: '#0e7490', dark: '#67e8f9' },
  notebook: { light: '#b45309', dark: '#fcd34d' },
  image: { light: '#047857', dark: '#6ee7b7' },
  audio: { light: '#a21caf', dark: '#f0abfc' },
  video: { light: '#4338ca', dark: '#a5b4fc' },
  neutral: { light: '#52525b', dark: '#d4d4d8' },
  workspace: { light: '#5b6ee1', dark: '#8ea2ff' },
};

const ARTIFACT_PALETTE: Record<KnowledgeNetworkArtifactTone, Record<Theme, string>> = {
  orange: { light: '#c2410c', dark: '#fb923c' },
  blue: { light: '#2563eb', dark: '#60a5fa' },
  teal: { light: '#0f766e', dark: '#2dd4bf' },
  rose: { light: '#be123c', dark: '#fb7185' },
  violet: { light: '#7c3aed', dark: '#a78bfa' },
  green: { light: '#15803d', dark: '#4ade80' },
};

const trace: KnowledgeNetworkTrace = {
  id: 'spectra-intelligent-construction',
  query: '智能建造如何引用多个学科与产业知识空间？',
  currentWorkspaceId: 'intelligent-construction',
  workspaces: [
    {
      id: 'intelligent-construction',
      name: '智能建造',
      detail: '面向真实工程问题组织的跨学科课程空间。',
      relation: 'current',
    },
    { id: 'artificial-intelligence', name: '人工智能', detail: '算法与智能决策。', relation: 'referenced' },
    { id: 'civil-engineering', name: '土木工程', detail: '工程对象与专业约束。', relation: 'referenced' },
    { id: 'bim', name: 'BIM 与数字孪生', detail: '工程信息模型与数字映射。', relation: 'referenced' },
    { id: 'iot', name: '物联网', detail: '现场数据采集与设备连接。', relation: 'referenced' },
    { id: 'engineering-management', name: '工程管理', detail: '进度、成本、质量与安全。', relation: 'referenced' },
    { id: 'industry-practice', name: '企业工程实践', detail: '真实项目、标准与经验。', relation: 'referenced' },
  ],
  references: [
    ['artificial-intelligence', 'ai'],
    ['civil-engineering', 'civil'],
    ['bim', 'bim'],
    ['iot', 'iot'],
    ['engineering-management', 'management'],
    ['industry-practice', 'industry'],
  ].map(([targetWorkspaceId, id]) => ({
    id: `intelligent-construction-${id}`,
    sourceWorkspaceId: 'intelligent-construction',
    targetWorkspaceId: targetWorkspaceId ?? '',
  })),
  sources: [
    source('computer-vision', 'artificial-intelligence', '计算机视觉', '施工目标与缺陷识别。', 'image', 'violet'),
    source('machine-learning', 'artificial-intelligence', '机器学习案例', '模型训练、评估与工程应用。', 'notebook'),
    source('structural-mechanics', 'civil-engineering', '结构力学', '结构受力与分析资料。', 'document'),
    source(
      'construction-materials',
      'civil-engineering',
      '土木工程材料',
      '材料性能、检测与工程应用。',
      'pdf',
      'orange'
    ),
    source('digital-twin', 'bim', '数字孪生模型', '工程对象的动态数字映射。', 'structured', 'blue'),
    source('bim-model', 'bim', 'BIM 项目模型', '可用于课堂分析的工程模型。', 'structured'),
    source('sensor-data', 'iot', '现场传感数据', '设备与环境形成的连续数据。', 'table', 'teal'),
    source('edge-devices', 'iot', '边缘设备实验', '现场采集、通信与控制实验。', 'code'),
    source('project-management', 'engineering-management', '项目管理案例', '进度、成本与协作案例。', 'spreadsheet'),
    source('safety-standards', 'engineering-management', '施工安全规范', '行业安全标准与管理要求。', 'pdf', 'rose'),
    source('real-projects', 'industry-practice', '真实工程案例', '企业项目任务、过程与复盘。', 'presentation'),
    source('industry-standards', 'industry-practice', '行业标准', '行业规范、交付标准与工程要求。', 'pdf', 'green'),
  ],
  chunks: [],
  paths: [],
  selectedChunkIds: [],
  citedChunkIds: [],
};

function source(
  id: string,
  workspaceId: string,
  name: string,
  detail: string,
  family: KnowledgeNetworkSourceFamily,
  artifactTone?: KnowledgeNetworkArtifactTone
): KnowledgeNetworkSource {
  return { id, workspaceId, name, detail, family, artifactTone, chunkCount: 1 };
}

function currentTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function sourceColor(sourceNode: KnowledgeNetworkSource | undefined, theme: Theme): string {
  if (!sourceNode) return SOURCE_PALETTE.workspace[theme];
  if (sourceNode.artifactTone) return ARTIFACT_PALETTE[sourceNode.artifactTone][theme];
  return SOURCE_PALETTE[sourceNode.family][theme];
}

export default function SpectraGraphDemo() {
  const plan = useMemo(() => prepareKnowledgeNetworkGraphPlan(trace), []);
  const canvasRef = useRef<PixiGraphViewCanvasHandle | null>(null);
  const invalidateRef = useRef<(() => void) | null>(null);
  const liveEngineRef = useRef<GraphViewEngine<KnowledgeNetworkCanvasNodeData> | null>(null);
  const firstLayoutUpdateRef = useRef(false);
  const fittedRef = useRef(false);
  const [engine, setEngine] = useState<GraphViewEngine<KnowledgeNetworkCanvasNodeData> | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const updateTheme = () => setTheme(currentTheme());
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo<GraphViewData<KnowledgeNetworkCanvasNodeData>>(() => {
    const workspaceById = new Map(trace.workspaces.map((workspace) => [workspace.id, workspace]));
    const sourceById = new Map(trace.sources.map((sourceNode) => [sourceNode.id, sourceNode]));
    const nodes: GraphViewNodeInput<KnowledgeNetworkCanvasNodeData>[] = [];

    for (const id of plan.visibleNodeIds) {
      const workspace = workspaceById.get(id);
      const sourceNode = sourceById.get(id);
      const item = workspace ?? sourceNode;
      const metric = plan.nodeMetrics[id];
      const position = plan.layout[id];
      if (!item || !metric || !position) continue;
      const isWorkspace = workspace !== undefined;
      nodes.push({
        id,
        x: position.x,
        y: position.y,
        weight: metric.weight,
        radius: metric.radius,
        data: {
          label: item.name,
          detail: item.detail,
          color: sourceColor(sourceNode, theme),
          root: isWorkspace && id === trace.currentWorkspaceId,
          selected: selectedId === id,
          ...(isWorkspace && id === trace.currentWorkspaceId ? { type: 'focused' as const } : {}),
          ...(sourceNode ? { family: sourceNode.family } : {}),
        },
      });
    }

    return {
      nodes,
      links: plan.visibleEdges.map((edge) => ({ id: edge.id, source: edge.fromId, target: edge.toId })),
    };
  }, [plan, selectedId, theme]);

  useEffect(() => {
    const graphEngine = new GraphViewEngine<KnowledgeNetworkCanvasNodeData>({
      onUpdate: () => {
        invalidateRef.current?.();
        if (firstLayoutUpdateRef.current) return;
        firstLayoutUpdateRef.current = true;
        setLayoutReady(true);
      },
    });
    firstLayoutUpdateRef.current = false;
    fittedRef.current = false;
    setLayoutReady(false);
    liveEngineRef.current = graphEngine;
    setEngine(graphEngine);
    return () => {
      invalidateRef.current = null;
      if (liveEngineRef.current === graphEngine) liveEngineRef.current = null;
      graphEngine.dispose();
      setEngine((current) => (current === graphEngine ? null : current));
    };
  }, []);

  useEffect(() => {
    if (!engine || liveEngineRef.current !== engine) return;
    engine.setData(graphData);
  }, [engine, graphData]);

  useEffect(() => {
    if (!layoutReady || !canvasReady || fittedRef.current) return;
    fittedRef.current = true;
    canvasRef.current?.fitGraph(680);
  }, [canvasReady, layoutReady]);

  const fitGraph = useCallback(() => canvasRef.current?.fitGraph(680), []);

  return (
    <div
      className="relative h-[420px] overflow-hidden rounded-3xl border border-slate-200 bg-[radial-gradient(circle_at_50%_50%,rgba(219,234,254,0.52),transparent_44%),radial-gradient(circle_at_18%_20%,rgba(248,250,252,0.8),transparent_36%),white] shadow-[0_24px_80px_rgba(30,64,175,0.10)] dark:border-slate-700 dark:bg-[radial-gradient(circle_at_50%_50%,rgba(37,99,235,0.16),transparent_44%),radial-gradient(circle_at_18%_20%,rgba(39,39,42,0.72),transparent_36%),#18181b] md:h-[500px] lg:h-[520px]"
      aria-label="智能建造知识网络"
    >
      <PixiGraphViewCanvas
        engine={engine}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onHover={() => undefined}
        onReady={(handle) => {
          canvasRef.current = handle;
          invalidateRef.current = handle?.invalidate ?? null;
          setCanvasReady(handle !== null);
        }}
        nodeSizeMultiplier={1}
        lineSizeMultiplier={1}
        textFadeMultiplier={-0.8}
        showArrow={false}
      />
      <button
        type="button"
        className="absolute right-4 top-4 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm backdrop-blur hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300"
        onClick={fitGraph}
      >
        适配网络
      </button>
      <div className="pointer-events-none absolute bottom-4 left-5 text-xs text-slate-500 dark:text-slate-400">
        拖动节点 · 滚轮缩放
      </div>
    </div>
  );
}
