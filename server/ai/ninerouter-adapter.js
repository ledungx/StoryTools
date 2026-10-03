import { aiError } from './errors.js';
import { providerRequest, validatedBaseUrl } from './request.js';

const imageData = (value) => {
  if (!value) return null;
  if (value.startsWith('data:')) {
    const [, mimeType = 'image/png', data = ''] = value.match(/^data:([^;]+);base64,(.*)$/) || [];
    return data ? { buffer: Buffer.from(data, 'base64'), mimeType } : null;
  }
  return null;
};

function toOpenAiContent(contents) {
  if (typeof contents === 'string') return contents;
  const parts = contents?.[0]?.parts;
  if (!Array.isArray(parts)) return JSON.stringify(contents);
  return parts.flatMap((part) => {
    if (part.text) return [{ type: 'text', text: part.text }];
    if (part.inlineData?.data) return [{ type: 'image_url', image_url: { url: `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}` } }];
    return [];
  });
}

function parseProviderJson(content) {
  if (typeof content !== 'string') return content;
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

export class NineRouterAdapter {
  constructor(settings) {
    this.settings = settings;
    this.name = '9router';
    this.baseUrl = validatedBaseUrl(settings.ninerouterBaseUrl);
  }
  headers() { return this.settings.ninerouterApiKey ? { Authorization: 'configured' } : { Authorization: 'missing' }; }
  async generateJson({ model, system, contents, schema, temperature = 0.9 }) {
    if (!this.settings.ninerouterApiKey) throw aiError('Chưa cấu hình API key 9router trong Cài đặt hoặc file .env.', 400, 'MISSING_API_KEY');
    const schemaRule = schema ? ` Output must satisfy this JSON schema: ${JSON.stringify(schema)}.` : '';
    const messages = [{ role: 'system', content: `${system || 'Bạn trả về JSON hợp lệ.'}${schemaRule} Return only the JSON object: no Markdown, code fence, or explanation.` }, { role: 'user', content: toOpenAiContent(contents) }];
    const data = await providerRequest({ provider: this.name, url: `${this.baseUrl}/chat/completions`, apiKey: this.settings.ninerouterApiKey, timeoutMs: this.settings.timeoutMs, maxRetries: this.settings.maxRetries, method: 'POST', body: { model, messages, temperature, response_format: { type: 'json_object' } } });
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw aiError('9router không trả về nội dung JSON.', 502, 'INVALID_PROVIDER_RESPONSE');
    try { return parseProviderJson(content); } catch {
      throw aiError('9router trả về nội dung không khớp JSON contract. Hãy thử lại.', 502, 'INVALID_PROVIDER_RESPONSE');
    }
  }
  async analyzeImage(args) { return this.generateJson({ ...args, contents: [{ image: args.image, prompt: args.prompt }] }); }
  async generateImage({ model, prompt, aspectRatio }) {
    const data = await providerRequest({ provider: this.name, url: `${this.baseUrl}/images/generations`, apiKey: this.settings.ninerouterApiKey, timeoutMs: this.settings.timeoutMs, maxRetries: this.settings.maxRetries, method: 'POST', body: { model, prompt, size: aspectRatio === '16:9' ? '1792x1024' : aspectRatio === '9:16' ? '1024x1792' : '1024x1024', response_format: 'b64_json' } });
    const item = data.data?.[0];
    if (item?.b64_json) return { buffer: Buffer.from(item.b64_json, 'base64'), mimeType: 'image/png' };
    const parsed = imageData(item?.url);
    if (parsed) return parsed;
    if (item?.url) { const response = await fetch(item.url); return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: response.headers.get('content-type') || 'image/png' }; }
    throw aiError('9router không trả về ảnh.', 502, 'INVALID_PROVIDER_RESPONSE');
  }
  async listModels() {
    const data = await providerRequest({ provider: this.name, url: `${this.baseUrl}/models`, apiKey: this.settings.ninerouterApiKey, timeoutMs: this.settings.timeoutMs, maxRetries: this.settings.maxRetries });
    return (data.data || []).map(({ id, capabilities = {} }) => ({ id, capabilities: { text: true, vision: Boolean(capabilities.vision), image: Boolean(capabilities.imageOutput), 'image-edit': false } }));
  }
  getCapabilities(model) { return { text: true, vision: model === this.settings.ninerouterVisionModel, image: model === this.settings.ninerouterImageModel, 'image-edit': false }; }
  async testConnection() { await this.listModels(); return { provider: this.name, ok: true }; }
}
