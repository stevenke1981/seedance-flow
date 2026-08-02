export const STORAGE_KEY = 'seedance-flow-workflow-v1';

export const NODE_LIBRARY = [
  { type: 'scene', title: 'Scene', subtitle: '場景與主體', icon: 'SC', accent: 'amber' },
  { type: 'character', title: 'Character', subtitle: '角色一致性', icon: 'CH', accent: 'rose' },
  { type: 'camera', title: 'Camera', subtitle: '鏡頭語法', icon: 'CA', accent: 'cyan' },
  { type: 'motion', title: 'Motion', subtitle: '動作與節拍', icon: 'MO', accent: 'violet' },
  { type: 'style', title: 'Style', subtitle: '光線與風格', icon: 'ST', accent: 'lime' },
  { type: 'audio', title: 'Audio', subtitle: '音效與語音', icon: 'AU', accent: 'blue' },
  { type: 'output', title: 'Output', subtitle: '格式與限制', icon: 'OUT', accent: 'orange' },
];

const FIELD_DEFINITIONS = {
  scene: [
    { key: 'subject', label: '主體', type: 'textarea', placeholder: '一名穿著深色雨衣的台北郵差' },
    { key: 'environment', label: '環境', type: 'textarea', placeholder: '凌晨的城市巷口，濕潤柏油反射霓虹' },
    { key: 'hook', label: '開場鉤子', type: 'text', placeholder: '第一秒就抓住注意力的畫面' },
  ],
  character: [
    { key: 'identity', label: '身份與外觀', type: 'textarea', placeholder: '短黑髮、紅色識別章、沉著而疲憊的眼神' },
    { key: 'consistency', label: '一致性備註', type: 'textarea', placeholder: '全片保持同一張臉、服裝與道具位置' },
    { key: 'reference', label: '參考資產', type: 'text', placeholder: '@角色參考圖 或白模動作參考' },
  ],
  camera: [
    { key: 'shot', label: '景別與視角', type: 'select', options: ['廣角建立鏡頭', '中景跟拍', '近景情緒特寫', '低角度英雄視角', '手持主觀視角'] },
    { key: 'movement', label: '鏡頭運動', type: 'text', placeholder: 'slow dolly-in → smooth lateral tracking' },
    { key: 'lens', label: '鏡頭質感', type: 'text', placeholder: '35mm、淺景深、自然運動模糊' },
  ],
  motion: [
    { key: 'beats', label: '四拍動作設計', type: 'textarea', placeholder: '00-06：抬頭看向遠方；06-14：快步穿過巷口；14-24：轉身追上光線；24-30：停下回望鏡頭' },
    { key: 'physics', label: '動態與物理', type: 'textarea', placeholder: '雨滴受風斜落，衣角與傘面有自然慣性' },
    { key: 'transition', label: '轉場', type: 'text', placeholder: '以一個連續的鏡頭動作完成轉場' },
  ],
  style: [
    { key: 'visual', label: '視覺風格', type: 'textarea', placeholder: '寫實電影感、低飽和青橙色調、細緻膠片顆粒' },
    { key: 'lighting', label: '光線', type: 'text', placeholder: '冷色環境光搭配暖色店家窗光，邊緣輪廓光' },
    { key: 'mood', label: '情緒', type: 'text', placeholder: '孤獨、克制，最後帶一點希望' },
  ],
  audio: [
    { key: 'soundscape', label: '環境聲', type: 'textarea', placeholder: '雨聲、遠處機車通過、低沉城市底噪' },
    { key: 'voice', label: '語音／台詞', type: 'textarea', placeholder: '無台詞；若有旁白，使用溫暖、清晰、近距離的聲音' },
    { key: 'music', label: '配樂', type: 'text', placeholder: 'minimal piano pulse, restrained cinematic rise' },
  ],
  output: [
    { key: 'ratio', label: '畫面比例', type: 'select', options: ['16:9 橫式', '9:16 直式', '1:1 方形', '4:3 經典'] },
    { key: 'duration', label: '時長', type: 'select', options: ['10 秒', '15 秒', '30 秒'] },
    { key: 'constraints', label: '負面與限制', type: 'textarea', placeholder: '不要字幕、不要浮水印、不要多餘人物、避免臉部變形與閃爍' },
  ],
};

const DEFAULT_VALUES = {
  scene: { subject: '一名穿著深色雨衣的台北郵差', environment: '凌晨的城市巷口，濕潤柏油反射霓虹', hook: '雨幕中，一束暖光突然亮起' },
  character: { identity: '短黑髮、紅色識別章、沉著而疲憊的眼神', consistency: '全片保持同一張臉、服裝、背包與道具位置', reference: '@角色參考圖（可替換為實際資產）' },
  camera: { shot: '廣角建立鏡頭', movement: 'slow dolly-in → smooth lateral tracking', lens: '35mm、淺景深、自然運動模糊' },
  motion: { beats: '00-06：抬頭看向遠方；06-14：快步穿過巷口；14-24：轉身追上光線；24-30：停下回望鏡頭', physics: '雨滴受風斜落，衣角與傘面有自然慣性', transition: '以一個連續的鏡頭動作完成轉場' },
  style: { visual: '寫實電影感、低飽和青橙色調、細緻膠片顆粒', lighting: '冷色環境光搭配暖色店家窗光，邊緣輪廓光', mood: '孤獨、克制，最後帶一點希望' },
  audio: { soundscape: '雨聲、遠處機車通過、低沉城市底噪', voice: '無台詞；若有旁白，使用溫暖、清晰、近距離的聲音', music: 'minimal piano pulse, restrained cinematic rise' },
  output: { ratio: '16:9 橫式', duration: '30 秒', constraints: '不要字幕、不要浮水印、不要多餘人物、避免臉部變形與閃爍' },
};

const DEFAULT_LAYOUT = [
  ['scene', 56, 74], ['character', 318, 44], ['camera', 585, 86], ['motion', 246, 300], ['style', 538, 330], ['audio', 92, 520], ['output', 430, 548],
];

let nodeCounter = 1;

export function fieldsFor(type) {
  return (FIELD_DEFINITIONS[type] || []).map((field) => ({ ...field, options: field.options ? [...field.options] : undefined }));
}

export function createNode(type, index = nodeCounter++) {
  const meta = NODE_LIBRARY.find((item) => item.type === type) || NODE_LIBRARY[0];
  const values = DEFAULT_VALUES[type] ? { ...DEFAULT_VALUES[type] } : {};
  return {
    id: `${type}-${Date.now().toString(36)}-${index}`,
    type: meta.type,
    title: meta.title,
    subtitle: meta.subtitle,
    icon: meta.icon,
    accent: meta.accent,
    x: 80 + (index % 3) * 260,
    y: 80 + Math.floor(index / 3) * 250,
    values,
  };
}

export function createDefaultWorkflow() {
  return {
    schemaVersion: 1,
    model: 'Seedance 2.5',
    duration: 30,
    ratio: '16:9 橫式',
    nodes: DEFAULT_LAYOUT.map(([type, x, y], index) => ({ ...createNode(type, index + 1), x, y })),
  };
}

function value(nodes, type, key, fallback = '') {
  const values = nodes
    .filter((item) => item.type === type)
    .map((item) => item.values?.[key])
    .filter((raw) => typeof raw === 'string' && raw.trim())
    .map((raw) => raw.trim());
  return [...new Set(values)].join('；') || fallback;
}

export function beatLines(nodes) {
  const raw = value(nodes, 'motion', 'beats', '00-06：建立空間與主體；06-14：動作開始；14-24：鏡頭與動作升級；24-30：畫面回到情緒核心');
  const pieces = raw.split(/[;；\n]+/).map((piece) => piece.trim()).filter(Boolean);
  const defaults = ['00-06：以明確的開場鉤子建立主體與空間。', '06-14：讓主體完成一個可讀的動作，鏡頭保持連續。', '14-24：加入速度或視角變化，讓情緒與畫面升級。', '24-30：以穩定的收束畫面回扣主體，留下清楚結尾。'];
  return defaults.map((fallback, index) => pieces[index] || fallback);
}

export function buildPrompt(nodes, settings = {}) {
  const safeNodes = Array.isArray(nodes) ? nodes : [];
  const model = settings.model || 'Seedance 2.5';
  const duration = settings.duration || value(safeNodes, 'output', 'duration', '30 秒');
  const ratio = settings.ratio || value(safeNodes, 'output', 'ratio', '16:9 橫式');
  const references = [value(safeNodes, 'character', 'reference'), '將參考資產綁定到角色、產品或動作，不改變其身份'].filter(Boolean).join('；');
  const beats = beatLines(safeNodes);

  return [
    `【${model}／Dreamina 提示詞】`,
    `輸出：${duration}，${ratio}；單一連續敘事，保持角色、光線、服裝與空間的時間一致性。`,
    `主體：${value(safeNodes, 'scene', 'subject', '一個具有明確輪廓的主體')}`,
    `環境：${value(safeNodes, 'scene', 'environment', '具有前景、中景與背景層次的場景')}`,
    `角色一致性：${value(safeNodes, 'character', 'identity', '維持角色外觀與辨識特徵')}`,
    `參考與控制：${references}`,
    `鏡頭：${value(safeNodes, 'camera', 'shot', '中景建立鏡頭')}；${value(safeNodes, 'camera', 'movement', '平滑推進並保持主體在畫面內')}；${value(safeNodes, 'camera', 'lens', '自然景深與運動模糊')}`,
    `動態：${value(safeNodes, 'motion', 'physics', '動作遵守自然物理與重量感')}；轉場：${value(safeNodes, 'motion', 'transition', '以連續動作完成轉場')}`,
    `風格與光線：${value(safeNodes, 'style', 'visual', '電影感寫實風格')}；${value(safeNodes, 'style', 'lighting', '柔和且方向一致的光線')}；情緒：${value(safeNodes, 'style', 'mood', '情緒清楚且克制')}`,
    '四拍節奏：',
    ...beats.map((beat) => `- ${beat}`),
    `聲音：${value(safeNodes, 'audio', 'soundscape', '與動作同步的環境聲')}；語音：${value(safeNodes, 'audio', 'voice', '無不必要台詞')}；配樂：${value(safeNodes, 'audio', 'music', '低存在感、服務情緒的配樂')}`,
    `限制：${value(safeNodes, 'output', 'constraints', '不要字幕、不要浮水印、不要多餘人物；避免閃爍、肢體錯位、臉部變形與不連續的鏡頭切換')}`,
  ].join('\n');
}

export function serializeWorkflow(workflow) {
  const payload = {
    schemaVersion: 1,
    model: workflow?.model || 'Seedance 2.5',
    duration: workflow?.duration || 30,
    ratio: workflow?.ratio || '16:9 橫式',
    nodes: Array.isArray(workflow?.nodes) ? workflow.nodes : [],
    prompt: buildPrompt(workflow?.nodes || [], workflow || {}),
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(payload, null, 2);
}

export function parseWorkflow(serialized) {
  const parsed = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
  if (!parsed || !Array.isArray(parsed.nodes)) throw new Error('工作流格式無效：缺少 nodes 陣列。');
  const nodes = parsed.nodes.filter((node) => node && typeof node.id === 'string' && typeof node.type === 'string').map((node) => ({
    ...node,
    values: node.values && typeof node.values === 'object' ? { ...node.values } : {},
    x: Number.isFinite(node.x) ? node.x : 80,
    y: Number.isFinite(node.y) ? node.y : 80,
  }));
  if (!nodes.length) throw new Error('工作流格式無效：至少需要一個節點。');
  return { schemaVersion: 1, model: parsed.model || 'Seedance 2.5', duration: parsed.duration || 30, ratio: parsed.ratio || '16:9 橫式', nodes };
}

export function cloneWorkflow(workflow) {
  return JSON.parse(JSON.stringify(workflow));
}

export function fieldDefinition(type, key) {
  return fieldsFor(type).find((field) => field.key === key);
}
