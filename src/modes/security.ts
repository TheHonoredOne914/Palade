import type { ModeConfig } from './index.js'

export const SECURITY_MODE: ModeConfig = {
  mode: 'security',
  systemPromptSuffix: `
SECURITY MODE ACTIVE.
Your review is exclusively security-focused. Treat every finding as a potential attack vector.
Prioritise: authentication bypass, injection vulnerabilities, secrets in code, unvalidated inputs,
broken access control, insecure direct object references, missing rate limits, CORS misconfiguration,
unsafe deserialization, sensitive data exposure.
Every finding must include a concrete exploitation path in the description.
Severity must err HIGH — when in doubt, call it high, not medium.
  `,
  synthesisPromptSuffix: `
Produce a security-specific synthesis:
- Lead with the attack surface map (entry points → data flows → vulnerable sinks)
- Group findings by OWASP Top 10 category where applicable
- priorityFixes should be ordered by exploitability, not just severity
- Include a "blast radius" estimate: what data or functionality is at risk if each issue is exploited
  `,
}
