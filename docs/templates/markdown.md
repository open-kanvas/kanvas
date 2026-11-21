# Markdown reading

Use `template:"markdown", data:{text}` for composed formatted text. The optional view title works as on other templates. Syntax is standard CommonMark plus GitHub-flavoured Markdown: headings, emphasis, inline/fenced code, links, lists, blockquotes, rules, strikethrough, tables and task-list checkboxes. There is no Kanvas-specific inline language for colour, size, highlight or alignment.

The view scrolls naturally, follows the session theme and saved `textSize`, and supports reading font size, zoom and words per minute. Code fences use the code template’s monospace and supported language highlighting. Tables and long code lines have their own horizontal overflow. Raw HTML renders literally and images are not rendered. Unsafe link protocols are not followed; external links open separately.

`fact` remains one concise plain-text idea. `document` preserves someone else’s exact plain text, including literal markup. Neither silently becomes Markdown. Text help pages use the Markdown template so operation names read as inline code; diagrams and dedicated help templates remain their own views.
