import { generateCaption as geminiCaption, generateFrames as geminiFrames, generateStoryPlan as geminiPlan } from '../gemini.js';

function activeProvider(args) { return args.settings?.provider || 'gemini'; }
function unsupported(provider, operation) { const error = new Error(`${provider}: ${operation} hiện chưa được bật cho route này; không fallback âm thầm sang Gemini.`); error.status = 501; throw error; }

export async function planStory(args) {
  return geminiPlan(args);
}
export async function generateFrames(args) {
  return geminiFrames(args);
}
export async function generateCaption(args) {
  return geminiCaption(args);
}
