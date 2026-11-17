import { expect,it } from 'vitest';
import { listToolDefinitions,resolveToolCall } from '../../src/server/mcp/catalog.js';
import { helpInputSchema } from '../../src/shared/help.js';
import { GUIDE_TOPICS } from '../../src/server/mcp/guide.js';
import { invitationSchema } from '../../src/shared/invitations.js';
it.each(['discovery'] as const)('has no games in the %s public catalog',profile=>{
 const tools=listToolDefinitions(profile);expect(tools.some(t=>t.name.includes('games'))).toBe(false);
 expect(JSON.stringify(tools)).not.toMatch(/gameId|online-meeting|in-person-meeting|updatePolicy|KANVAS_MODEL/);
 expect(resolveToolCall(profile,'kanvas_games',{operation:'types.list'}).error).toBeDefined();
});
it('rejects retired topics and invitation scopes without changing generic invitations',()=>{
 expect(helpInputSchema.safeParse({topic:'games'}).success).toBe(false);expect(GUIDE_TOPICS).not.toContain('conversation');expect(GUIDE_TOPICS).not.toContain('modes-and-policy');
 expect(invitationSchema.safeParse({requestId:'one',gameId:'old'}).success).toBe(false);expect(invitationSchema.safeParse({requestId:'one'}).success).toBe(true);
});
