import { GeminiAdapter } from './gemini-adapter.js';
import { NineRouterAdapter } from './ninerouter-adapter.js';

export function createProviderRouter(settings) {
  const gemini = new GeminiAdapter(settings);
  let ninerouter;
  const getNineRouter = () => (ninerouter ||= new NineRouterAdapter(settings));
  const provider = settings.provider || 'gemini';
  const choose = (kind) => {
    if (provider === 'gemini') return gemini;
    if (provider === '9router') return getNineRouter();
    if (kind === 'image-ref' || kind === 'image-edit') return gemini;
    return getNineRouter();
  };
  return { provider, choose, gemini, get ninerouter() { return getNineRouter(); } };
}

export async function listProviderModels(settings) {
  const router = createProviderRouter(settings);
  const result = { text: [], vision: [], image: [], 'image-edit': [], providers: {} };
  const targets = settings.provider === 'hybrid' ? [router.gemini, router.ninerouter] : [router.choose('text')];
  for (const adapter of targets) {
    let models = [];
    try { models = await adapter.listModels(); } catch (error) { result.providers[adapter.name] = { unavailable: true, error: error.message }; continue; }
    result.providers[adapter.name] = models;
    for (const model of models) for (const [capability, enabled] of Object.entries(model.capabilities)) if (enabled && result[capability]) result[capability].push(model.id);
  }
  return result;
}
