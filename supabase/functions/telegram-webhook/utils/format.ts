/**
 * Converts markdown text to Telegram HTML format
 * Telegram supports: <b>, <i>, <u>, <s>, <code>, <pre>, <a href="">
 */
export function markdownToTelegramHtml(text: string): string {
  if (!text) return '';

  let result = text;

  // Escape HTML special characters first (except our formatting)
  result = result
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Convert markdown to HTML

  // Bold: **text** or __text__ -> <b>text</b>
  result = result.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  result = result.replace(/__(.+?)__/g, '<b>$1</b>');

  // Italic: *text* or _text_ -> <i>text</i>
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<i>$1</i>');
  result = result.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<i>$1</i>');

  // Strikethrough: ~~text~~ -> <s>text</s>
  result = result.replace(/~~(.+?)~~/g, '<s>$1</s>');

  // Code: `text` -> <code>text</code>
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Code blocks: ```text``` -> <pre>text</pre>
  result = result.replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre>$1</pre>');

  // Headers: # Header -> <b>Header</b>
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '<b>$1</b>');

  // Lists: - item or * item -> • item
  result = result.replace(/^[\-\*]\s+/gm, '• ');

  // Numbered lists: 1. item -> 1. item (keep as is)

  // Links: [text](url) -> <a href="url">text</a>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return result;
}

/**
 * Formats currency values in Brazilian format
 */
export function formatCurrency(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Formats a date to Brazilian format
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-BR');
}

/**
 * Truncates text to a maximum length with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Escapes special characters for Telegram HTML
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
