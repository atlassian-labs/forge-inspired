// Entry point for the Implementation Plan Agent Forge functions.
//
// Each `function` in manifest.yml points at one of these exports. Forge action
// functions receive the invocation payload (the input the agent passed in) as
// their first argument and the invocation context (installation, principal,
// etc) as their second — we don't need the context for these two actions.

import { handleInspectIssue } from './actions/inspect-issue.js';
import { handlePostImplementationPlan } from './actions/post-implementation-plan.js';

// GET-style action: read-only, returns a lean JSON object the agent can reason
// about. See src/actions/inspect-issue.js for the field selection.
export const inspectIssue = async (payload, context) => {
  return handleInspectIssue({ payload, context });
};

// TRIGGER-style action: the sole write path. Posts ONE comment on the issue.
// See src/actions/post-implementation-plan.js.
export const postImplementationPlan = async (payload, context) => {
  return handlePostImplementationPlan({ payload, context });
};
