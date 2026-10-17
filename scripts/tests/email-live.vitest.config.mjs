// This config must be explicitly selected. SMTP sending requires a second opt-in.
export default {test:{environment:"node",include:["scripts/tests/email-language-smoke.live.ts"],retry:0}};
