/** Independent November feedback inventory. Every entry is exercised through
 * both real SDK transports in november-contract-http.test.ts, with committed
 * state and authorization assertions. Never generate from implementation. */
export const NOVEMBER_MAPPING = [
 ['kanvas_guidance_suggestions_list','kanvas_inspect','guidance.suggestions.list'],
 ['kanvas_guidance_suggestions_save','kanvas_configure','guidance.suggestions.save'],
 ['kanvas_guidance_suggestions_delete','kanvas_configure','guidance.suggestions.delete'],
 ['kanvas_guidance_suggestions_import','kanvas_configure','guidance.suggestions.import'],
 ['kanvas_satisfaction_read','kanvas_inspect','satisfaction.read'],
 ['kanvas_window_viewport','kanvas_control','window.viewport'],
] as const;
