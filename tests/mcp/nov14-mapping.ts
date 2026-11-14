/** 2026-11-14 operations. Exercised against real stores in
 * tests/core/feedback-20261114.test.ts and over MCP in tests/mcp/nov14-contract-http.test.ts. */
export const NOV14_MAPPING=[
 ['kanvas_board_read','kanvas_inspect','board.read'],
 ['kanvas_board_overview','kanvas_inspect','board.overview'],
 ['kanvas_board_post','kanvas_feedback','board.post'],
 ['kanvas_board_update','kanvas_feedback','board.update'],
] as const;
