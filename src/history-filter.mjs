export const HISTORY_FILTER_STATUSES = Object.freeze(['all', 'queued', 'running', 'cancelling', 'succeeded', 'failed', 'expired', 'cancelled']);

const SEARCH_FIELDS = ['version', 'prompt', 'model', 'taskId', 'requestId', 'errorMessage', 'errorCode', 'promptHash'];

function normalizedText(value) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
}

export function filterHistory(entries, { query = '', status = 'all' } = {}) {
  const items = Array.isArray(entries) ? entries : [];
  const normalizedQuery = normalizedText(query);
  const normalizedStatus = HISTORY_FILTER_STATUSES.includes(status) ? status : 'all';
  return items.filter((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    if (normalizedStatus !== 'all' && entry.status !== normalizedStatus) return false;
    if (!normalizedQuery) return true;
    return SEARCH_FIELDS.some((field) => normalizedText(entry[field]).includes(normalizedQuery));
  });
}
