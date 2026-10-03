import { GoogleGenAI } from '@google/genai';
import { aiError, normalizeProviderError } from './errors.js';

export class GeminiAdapter {
  constructor(settings) { this.settings = settings; this.name = 'gemini'; }
  client() {
    if (!this.settings.apiKey) throw aiError('Chưa cấu hình Gemini API key (tab Cài đặt hoặc file .env).', 400, 'MISSING_API_KEY');
    return new GoogleGenAI({ apiKey: this.settings.apiKey });
  }
  async generateJson({ model, system, contents, schema, temperature = 0.9 }) {
    try {
      const response = await this.client().models.generateContent({ model, contents, config: { ...(system ? { systemInstruction: system } : {}), responseMimeType: 'application/json', responseJsonSchema: schema, temperature } });
      return JSON.parse(response.text || '{}');
    } catch (error) { throw normalizeProviderError('gemini', error); }
  }
  async analyzeImage({ model, image, prompt, schema }) {
    return this.generateJson({ model, contents: [{ role: 'user', parts: [{ inlineData: image }, { text: prompt }] }], schema, temperature: 0.4 });
  }
  async generateImage({ model, prompt, refs, aspectRatio }) {
    const parts = refs.flatMap((ref) => [{ text: `${ref.label}:` }, { inlineData: { mimeType: ref.mimeType, data: ref.data } }]);
    parts.push({ text: prompt });
    try {
      const response = await this.client().models.generateContent({ model, contents: [{ role: 'user', parts }], config: { responseModalities: ['TEXT', 'IMAGE'], ...(aspectRatio ? { imageConfig: { aspectRatio } } : {}) } });
      const candidate = response.candidates?.[0];
      const image = candidate?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData;
      if (!image) throw aiError('Gemini không trả về ảnh. Thử sửa prompt rồi tạo lại.', 502, 'INVALID_PROVIDER_RESPONSE');
      return { buffer: Buffer.from(image.data, 'base64'), mimeType: image.mimeType || 'image/png' };
    } catch (error) { throw normalizeProviderError('gemini', error); }
  }
  async listModels() {
    try {
      const names = [];
      for await (const item of await this.client().models.list({ config: { pageSize: 100 } })) {
        if ((item.supportedActions || []).includes('generateContent') && /^models\/gemini/.test(item.name)) names.push(item.name.replace('models/', ''));
      }
      return names.map((id) => ({ id, capabilities: { text: !id.includes('image'), vision: !id.includes('image'), image: id.includes('image'), 'image-edit': id.includes('image') } }));
    } catch (error) { throw normalizeProviderError('gemini', error); }
  }
  getCapabilities(model) { return { text: !model.includes('image'), vision: !model.includes('image'), image: model.includes('image'), 'image-edit': model.includes('image') }; }
  async testConnection() { await this.listModels(); return { provider: this.name, ok: true }; }
}
