/*
 * The MCP server: how a member's own AI client reads and edits the tree.
 *
 * One server is made per request, for the caller of that request, so the
 * tools it lists are exactly the ones that caller may use. Nothing is kept
 * between requests, which is why this works the same in one container or on a
 * serverless host.
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import type { App } from '@reactive-family-tree/server';

import { INSTRUCTIONS, PROMPTS, SCHEMA_GUIDE } from './guide';
import { registerTools } from './tools';
import type { Caller, RecentWrites } from './tools';

const PLAIN = 'text/plain';

export function buildServer(app: App, caller: Caller, recentWrites: RecentWrites): McpServer {
  const { store, views } = app;
  const { settings } = store;
  const server = new McpServer({ name: 'reactive-family-tree', title: settings.familyName, version: '0.1.0' }, { instructions: INSTRUCTIONS });

  registerTools(server, app, caller, recentWrites);

  const fixed = (name: string, description: string, read: () => string | Promise<string>) => {
    const uri = `tree://${name}`;
    server.registerResource(name, uri, { description, mimeType: PLAIN }, async () => ({ contents: [{ uri, mimeType: PLAIN, text: await read() }] }));
  };
  fixed('summary', 'The family’s name, size and year range, and whom you act for.', async () => {
    const tree = await views.tree(caller.actor);
    const years = tree.people.flatMap((p) => (!p.masked && !p.pending && p.born ? [p.born] : []));
    const range = years.length ? `, born ${Math.min(...years)} to ${Math.max(...years)}` : '';
    return `${settings.familyName}. ${settings.description}\n${tree.people.length} people${range}.\nYou act for ${caller.actor.name}.`;
  });
  fixed('guidelines', 'This family’s conventions for names and dates, and the rules every AI follows here.',
    () => `${settings.guidelines || 'This family has not written its own conventions yet.'}\n\n${INSTRUCTIONS}`);
  fixed('schema', 'A short guide to the data: fact types, how dates are written, kinds of relatives.', () => SCHEMA_GUIDE);
  server.registerResource('person', new ResourceTemplate('tree://person/{id}', { list: undefined }), { description: 'One person as a document.', mimeType: PLAIN },
    async (uri, { id }) => ({ contents: [{ uri: uri.href, mimeType: PLAIN, text: JSON.stringify(await views.person(caller.actor, String(id)), null, 2) }] }));

  for (const prompt of PROMPTS) {
    server.registerPrompt(prompt.name, { description: prompt.description }, () => ({ messages: [{ role: 'user', content: { type: 'text', text: prompt.text } }] }));
  }
  return server;
}
