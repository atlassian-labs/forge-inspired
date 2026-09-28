// Small Jira helpers used by both action handlers. Kept tiny on purpose so
// workshop participants can read them end-to-end.

/**
 * Extract the Jira base URL (e.g. https://your-site.atlassian.net) from an
 * issue's `self` link. Used to build canonical `/browse/KEY` URLs we can
 * hand back to the agent so it can share links with the user.
 */
export function baseUrlFromSelf(self) {
  if (!self || typeof self !== 'string') return null;
  try {
    const u = new URL(self);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Flatten an Atlassian Document Format (ADF) node tree into plain text.
 *
 * Jira's REST API returns rich fields (like description) as ADF, which is
 * a JSON tree of nodes. For an agent that only needs to reason about the
 * content, plain text is easier to prompt with than ADF. This walks the
 * tree, concatenating any `text` node it finds and inserting blank lines
 * between block-level nodes so paragraphs stay visually separated.
 *
 * If the input is already a string (some field shapes return plain text),
 * we return it as-is.
 */
export function adfToText(adf) {
  if (adf == null) return '';
  if (typeof adf === 'string') return adf;

  // Nodes that should break to a new paragraph in the flattened output.
  const BLOCK_TYPES = new Set([
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'listItem',
    'blockquote',
    'codeBlock',
    'rule',
    'panel',
    'table',
    'tableRow',
    'tableHeader',
    'tableCell',
  ]);

  const parts = [];
  const walk = (node) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node.type === 'text' && typeof node.text === 'string') {
      parts.push(node.text);
    }
    if (Array.isArray(node.content)) {
      walk(node.content);
    }
    if (BLOCK_TYPES.has(node.type)) {
      parts.push('\n');
    }
  };

  walk(adf);
  return parts.join('').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Convert a Markdown string into a minimal Atlassian Document Format (ADF)
 * document suitable for POSTing to Jira's comment API.
 *
 * Jira comments render ADF, NOT Markdown, so if we send raw Markdown the
 * user sees literal `**bold**` and `## Heading` markers. This converter
 * handles the subset of Markdown the Implementation Plan Agent actually
 * produces — headings (`#`..`######`), unordered lists (`-` / `*` / `+`),
 * ordered lists (`1.`), paragraphs — with inline **bold**, *italic* /
 * _italic_, `code`, and [label](url) links. Anything it doesn't recognise
 * falls through as a plain-text paragraph, so it never loses content.
 *
 * We deliberately hand-roll this (no external Markdown parser) to keep
 * the workshop code readable end-to-end.
 */
export function textToAdf(markdown) {
  const src = String(markdown ?? '').replace(/\r\n?/g, '\n');
  const lines = src.split('\n');

  // Top-level ADF block nodes we'll accumulate as we walk the lines.
  const blocks = [];

  // Buffers for multi-line constructs. We flush them into `blocks` when
  // we hit a line that ends the current construct (e.g. a blank line
  // ends a paragraph, a non-list line ends a list).
  let paragraphBuffer = []; // array of raw text lines to be joined
  let listBuffer = null;    // { ordered: boolean, items: string[] }

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return;
    const text = paragraphBuffer.join(' ').trim();
    paragraphBuffer = [];
    if (!text) return;
    blocks.push({
      type: 'paragraph',
      content: parseInline(text),
    });
  };

  const flushList = () => {
    if (!listBuffer) return;
    blocks.push({
      type: listBuffer.ordered ? 'orderedList' : 'bulletList',
      content: listBuffer.items.map((itemText) => ({
        type: 'listItem',
        content: [
          { type: 'paragraph', content: parseInline(itemText) },
        ],
      })),
    });
    listBuffer = null;
  };

  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  // Regexes for block-level Markdown constructs.
  const HEADING_RE = /^(#{1,6})\s+(.*)$/;
  const UL_RE = /^\s*[-*+]\s+(.*)$/;
  const OL_RE = /^\s*\d+\.\s+(.*)$/;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, ''); // trim trailing whitespace

    // Blank line — end whatever multi-line construct we were building.
    if (line.trim() === '') {
      flushAll();
      continue;
    }

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch) {
      flushAll();
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      blocks.push({
        type: 'heading',
        attrs: { level },
        content: parseInline(text),
      });
      continue;
    }

    const olMatch = line.match(OL_RE);
    if (olMatch) {
      flushParagraph();
      if (!listBuffer || !listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: true, items: [] };
      }
      listBuffer.items.push(olMatch[1].trim());
      continue;
    }

    const ulMatch = line.match(UL_RE);
    if (ulMatch) {
      flushParagraph();
      if (!listBuffer || listBuffer.ordered) {
        flushList();
        listBuffer = { ordered: false, items: [] };
      }
      listBuffer.items.push(ulMatch[1].trim());
      continue;
    }

    // Anything else is paragraph text. If we were in a list, close it.
    flushList();
    paragraphBuffer.push(line.trim());
  }

  flushAll();

  // ADF requires at least one content node. If we somehow produced none
  // (e.g. empty input), emit an empty paragraph so the POST doesn't fail.
  if (blocks.length === 0) {
    blocks.push({ type: 'paragraph', content: [] });
  }

  return {
    version: 1,
    type: 'doc',
    content: blocks,
  };
}

/**
 * Convert a single line/run of Markdown into an array of ADF inline nodes.
 * Handles **bold**, *italic*, _italic_, `code`, and [label](url) links.
 *
 * Approach: tokenise the string left-to-right. At each position, try to
 * match the highest-priority inline construct (link, code, bold, italic).
 * If none matches, consume one character as literal text and continue.
 * The resulting tokens are merged into ADF text nodes with the right
 * `marks` applied.
 *
 * This is deliberately simple — no nested marks (e.g. bold inside a
 * link's label are treated as literal). Good enough for agent output.
 */
export function parseInline(text) {
  const nodes = [];
  let i = 0;
  const src = String(text ?? '');
  let literalBuf = '';

  // Flush any accumulated literal characters as a single text node.
  const flushLiteral = () => {
    if (literalBuf.length === 0) return;
    nodes.push({ type: 'text', text: literalBuf });
    literalBuf = '';
  };

  // Push a text node with an optional marks array.
  const pushMarked = (nodeText, marks) => {
    if (!nodeText) return;
    const node = { type: 'text', text: nodeText };
    if (marks && marks.length) node.marks = marks;
    nodes.push(node);
  };

  while (i < src.length) {
    // Link: [label](url)
    // Match label greedily up to the next `]`, then require `(url)`.
    if (src[i] === '[') {
      const close = src.indexOf(']', i + 1);
      if (close !== -1 && src[close + 1] === '(') {
        const urlClose = src.indexOf(')', close + 2);
        if (urlClose !== -1) {
          const label = src.slice(i + 1, close);
          const href = src.slice(close + 2, urlClose).trim();
          flushLiteral();
          pushMarked(label, [{ type: 'link', attrs: { href } }]);
          i = urlClose + 1;
          continue;
        }
      }
    }

    // Inline code: `code`
    if (src[i] === '`') {
      const end = src.indexOf('`', i + 1);
      if (end !== -1) {
        flushLiteral();
        pushMarked(src.slice(i + 1, end), [{ type: 'code' }]);
        i = end + 1;
        continue;
      }
    }

    // Bold: **text** or __text__
    if (
      (src[i] === '*' && src[i + 1] === '*') ||
      (src[i] === '_' && src[i + 1] === '_')
    ) {
      const marker = src.slice(i, i + 2);
      const end = src.indexOf(marker, i + 2);
      if (end !== -1) {
        flushLiteral();
        pushMarked(src.slice(i + 2, end), [{ type: 'strong' }]);
        i = end + 2;
        continue;
      }
    }

    // Italic: *text* or _text_
    // Only match if the character is a valid single-marker (not a
    // stray asterisk in the middle of a word) — cheap heuristic: the
    // marker must not be immediately followed by whitespace.
    if ((src[i] === '*' || src[i] === '_') && src[i + 1] && src[i + 1] !== src[i] && !/\s/.test(src[i + 1])) {
      const marker = src[i];
      const end = src.indexOf(marker, i + 1);
      // Require the closing marker to not be part of a stronger construct.
      if (end !== -1 && src[end + 1] !== marker) {
        flushLiteral();
        pushMarked(src.slice(i + 1, end), [{ type: 'em' }]);
        i = end + 1;
        continue;
      }
    }

    // Nothing matched — take one literal character and move on.
    literalBuf += src[i];
    i += 1;
  }

  flushLiteral();

  // If we produced nothing (empty line), ADF paragraphs may have empty
  // content — that's valid, return the empty array.
  return nodes;
}
