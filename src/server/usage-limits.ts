/** Deployment-admin guardrails. Restart after changing the environment; no billing implied. */
export function usageLimits(){
 const read=(name:string,fallback:number)=>{const raw=process.env[name];if(raw===undefined||raw==='')return fallback;const n=Number(raw);if(!Number.isSafeInteger(n)||n<1||n>100000)throw new Error(`${name} must be a positive integer up to 100000.`);return n;};
 return {sessions:read('KANVAS_MAX_SESSIONS_PER_ACCOUNT',10),views:read('KANVAS_MAX_VIEWS_PER_SESSION',50)};
}
