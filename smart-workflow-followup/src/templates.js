/**
 * User-editable follow-up comment.
 *
 * The template is a plain string with `{{placeholder}}` tokens. It is
 * rendered to ADF (Atlassian Document Format) at post time. Users edit it
 * from the app's project page — no code changes required.
 */

/** The default template shipped with the app. */
export const DEFAULT_TEMPLATE =
  'Smart Workflow Follow-up: {{issueKey}} moved to Done by {{actorDisplayName}}.\n' +
  'Time to double-check the acceptance criteria, close any linked work, ' +
  "and let the reporter know it's ready.";

/** Placeholders the editor UI exposes to the user. */
export const SUPPORTED_PLACEHOLDERS = [
  { key: 'issueKey', help: "The issue's key, e.g. PROJ-42" },
  { key: 'actorDisplayName', help: 'The person who moved the issue to Done' },
  { key: 'issueSummary', help: "The issue's title" },
];

/**
 * Replace every `{{placeholder}}` in `template` with the matching value from
 * `vars`. Unknown placeholders and missing values become an empty string —
 * we prefer a clean comment over noisy `{{unresolved}}` text in a customer
 * Jira issue.
 */
export function renderTemplate(template, vars = {}) {
  const src = typeof template === 'string' && template.length > 0
    ? template
    : DEFAULT_TEMPLATE;
  return src.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

/**
 * Build the ADF document posted on an issue. Each blank line in the rendered
 * text becomes a paragraph break.
 */
export function buildComment({ template, vars }) {
  const text = renderTemplate(template, vars);
  const paragraphs = text.split(/\n{2,}/);
  return {
    type: 'doc',
    version: 1,
    content: paragraphs.map((p) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: p.replace(/\n/g, ' ') }],
    })),
  };
}
