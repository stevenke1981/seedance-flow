export const NODE_HOVER_PREVIEW_STORAGE_KEY = 'seedance-flow-node-hover-preview-v1';

export function normalizeNodeHoverPreviewPreference(rawValue) {
  return rawValue !== 'false';
}

export function buildNodeHoverPreviewFields(node, definitions) {
  const values = node && typeof node === 'object' && node.values && typeof node.values === 'object' ? node.values : {};
  return (Array.isArray(definitions) ? definitions : []).map((definition) => {
    const rawValue = values[definition.key];
    const value = rawValue === null || rawValue === undefined ? '' : String(rawValue).trim();
    return {
      key: definition.key,
      label: typeof definition.label === 'string' && definition.label ? definition.label : definition.key,
      type: typeof definition.type === 'string' ? definition.type : 'text',
      value: value || '尚未設定',
    };
  });
}
