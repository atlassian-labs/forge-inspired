// Shared Jira helpers used by both actions.

// Derive the Jira base URL from an issue's self URL so links work
// regardless of tenant hostname.
export function baseUrlFromSelf(selfUrl) {
  if (!selfUrl) return '';
  try {
    const u = new URL(selfUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

// Best-effort ADF → plain-text extraction so the agent's LLM can reason
// about descriptions and comments without parsing ADF itself.
export function adfToText(adf) {
  if (!adf) return '';
  if (typeof adf === 'string') return adf;
  const parts = [];
  const walk = (node) => {
    if (!node) return;
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text);
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(walk);
      // Add a newline between block-level nodes.
      if (['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem'].includes(node.type)) {
        parts.push('\n');
      }
    }
  };
  walk(adf);
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

// Convert Markdown-flavoured plain text to an ADF document suitable for
// updating an issue description. Understands:
//   #, ##, ###    → heading level 1/2/3
//   - x, * x       → bullet list
//   1. x, 2. x     → ordered list
//   **bold**       → strong mark
//   *italic*       → em mark
//   `code`         → code mark
//   [text](url)    → link mark
//   blank line     → paragraph break
// Anything else is treated as a paragraph.
export function textToAdf(text) {
  const src = String(text ?? '').replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  const nodes = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Blank line — skip (paragraph breaks come from the run boundaries).
    if (trimmed.length === 0) {
      i += 1;
      continue;
    }

    // Heading. Accept #, ##, ###, #### (levels 1–4). Space after the
    // hashes is optional so we handle both `## Context` and `##Context`.
    // Also tolerate a trailing colon so `## Context:` reads as a heading.
    const heading = trimmed.match(/^(#{1,6})\s*(.+?):?\s*$/);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      nodes.push({
        type: 'heading',
        attrs: { level },
        content: parseInlineToAdf(heading[2]),
      });
      i += 1;
      continue;
    }

    // Bullet list — consume all consecutive bullet lines.
    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*]\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineToAdf(itemText) }],
        });
        i += 1;
      }
      nodes.push({ type: 'bulletList', content: items });
      continue;
    }

    // Ordered list — consume all consecutive numbered lines.
    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineToAdf(itemText) }],
        });
        i += 1;
      }
      nodes.push({ type: 'orderedList', content: items });
      continue;
    }

    // Paragraph — accumulate consecutive non-blank, non-block lines with soft breaks.
    const paraLines = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim().length > 0 &&
      !/^#{1,3}\s+/.test(lines[i].trim()) &&
      !/^[-*]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }
    nodes.push({
      type: 'paragraph',
      content: parseInlineToAdf(paraLines.join(' ')),
    });
  }

  return {
    type: 'doc',
    version: 1,
    content: nodes.length > 0 ? nodes : [{ type: 'paragraph' }],
  };
}

// Parse inline Markdown (bold / italic / code / link) into ADF text nodes
// with the appropriate marks.
function parseInlineToAdf(text) {
  // Tokeniser regex matches, in order:
  //   [text](url)   link
  //   **text**      strong
  //   *text*        em
  //   `text`        code
  // The gm flag isn't needed; we operate on already-split lines / joined paragraphs.
  const pattern =
    /(\[([^\]]+)\]\(([^)]+)\))|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)/;
  const out = [];
  let remaining = text;
  while (remaining.length > 0) {
    const m = remaining.match(pattern);
    if (!m) {
      if (remaining.length > 0) out.push({ type: 'text', text: remaining });
      break;
    }
    if (m.index > 0) {
      out.push({ type: 'text', text: remaining.slice(0, m.index) });
    }
    if (m[1]) {
      // Link
      out.push({
        type: 'text',
        text: m[2],
        marks: [{ type: 'link', attrs: { href: m[3] } }],
      });
    } else if (m[4]) {
      // Strong
      out.push({ type: 'text', text: m[5], marks: [{ type: 'strong' }] });
    } else if (m[6]) {
      // Em
      out.push({ type: 'text', text: m[7], marks: [{ type: 'em' }] });
    } else if (m[8]) {
      // Code
      out.push({ type: 'text', text: m[9], marks: [{ type: 'code' }] });
    }
    remaining = remaining.slice(m.index + m[0].length);
  }
  if (out.length === 0) out.push({ type: 'text', text: '' });
  return out;
}
