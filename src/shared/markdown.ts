import { z } from 'zod';
/** Standard CommonMark plus GFM, without application-specific inline syntax. */
export const markdownDataSchema = z.strictObject({
  text: z.string().min(1).max(20_000).describe('Standard CommonMark + GitHub-flavoured Markdown: headings, emphasis, links, lists, fenced code, tables and task lists. No Kanvas-specific syntax. Raw HTML is literal text; images are not rendered.'),
});
export type MarkdownData = z.infer<typeof markdownDataSchema>;
