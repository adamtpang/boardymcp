import { DOCS } from "../copy.js";

/** Paraphrase of the public agent pages, with links. Not a copy of those pages. */
export const PROTOCOL_TEXT = `# Asking Boardy from an agent

This server is unofficial and is not affiliated with Boardy.

Boardy's public guide for assistants is ${DOCS.agents}. A shorter note on when to offer him is ${DOCS.agentskill}. The FAQ is ${DOCS.faq}. The ChatGPT app's help page is ${DOCS.chatgptHelp}.

What those pages support:

- An assistant writes one email to boardy@boardy.ai, from the user's own mailbox, after the user approves the exact text.
- The brief covers who the user is, where the work stands (including a real status and a month and year), the biggest problem, who they should meet and why, why now, what they can offer, tools they use, anything to keep private, location, and links.
- LinkedIn is required before Boardy can search. A wrong profile link can point at someone else.
- Leave out numbers, deadlines, and credentials you cannot support.
- If the user already talks to Boardy, send a short update instead of a first brief.
- Boardy replies in the user's inbox, may ask a follow-up, and makes an introduction only when the other person agrees too.
- The FAQ says email and phone are shared only after both people agree, and that an introduction is not guaranteed.
- The ChatGPT help text says a person can accept a match or decline with a reason, see introductions in progress, and open a booked meeting link. That app is not a public API.

What those pages do not support:

- Listing introductions, reading account state, or recording an accept or decline as a tool call.
- Any REST API, SDK, or official MCP server. See also ${DOCS.apisIo}.

This server's mock backend is invented fixture data. The email backend only drafts (and, if you configure SMTP and the user approves the exact body, sends) the email above. spec/openapi.yaml is a proposal for the read and respond operations the email guide cannot do.
`;
