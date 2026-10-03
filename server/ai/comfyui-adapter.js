import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { aiError, normalizeProviderError } from './errors.js';
import { validatedBaseUrl } from './request.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEFAULT_WORKFLOW = path.join(ROOT, 'workflow', 'storytools-animagine-sdxl-api.json');
const DEFAULT_REFERENCE_WORKFLOW = path.join(ROOT, 'workflow', 'storytools-animagine-sdxl-img2img-api.json');
const DEFAULT_IDENTITY_WORKFLOW = path.join(ROOT, 'workflow', 'storytools-animagine-sdxl-ipadapter-face-api.json');
const DEFAULT_OPENPOSE_WORKFLOW = path.join(ROOT, 'workflow', 'storytools-animagine-sdxl-ipadapter-openpose-api.json');
const DEFAULT_LINEART_WORKFLOW = path.join(ROOT, 'workflow', 'storytools-animagine-sdxl-ipadapter-lineart-api.json');
const NEGATIVE_PROMPT = 'low quality, blurry, out of focus, washed out, overexposed, faded colors, deformed, bad anatomy, extra limbs, mutated, wrong gender, gender swap, wrong age, watermark, text, logo, signature';

function imageSize(aspectRatio) {
  if (aspectRatio === '16:9') return { width: 1024, height: 576 };
  if (aspectRatio === '9:16') return { width: 768, height: 1024 };
  if (aspectRatio === '4:3') return { width: 1024, height: 768 };
  if (aspectRatio === '3:4') return { width: 768, height: 1024 };
  return { width: 1024, height: 1024 };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  const detail = data?.error?.message || (typeof data?.error === 'string' ? data.error : JSON.stringify(data?.error || data));
  if (!response.ok) throw aiError(`ComfyUI: ${detail || `HTTP ${response.status}`}`, response.status, 'COMFYUI_REQUEST_FAILED');
  return data;
}

export class ComfyUiAdapter {
  constructor(settings) {
    this.settings = settings;
    this.name = 'comfyui';
    this.baseUrl = validatedBaseUrl(settings.comfyuiBaseUrl);
  }

  async testConnection() {
    const stats = await fetchJson(`${this.baseUrl}/system_stats`);
    const device = stats.devices?.find((item) => item.type === 'cuda');
    if (!device) throw aiError('ComfyUI đang chạy nhưng chưa nhận GPU CUDA.', 503, 'COMFYUI_NO_CUDA');
    return { provider: this.name, ok: true, device: device.name, vramTotal: device.vram_total };
  }

  async workflow(reference = false, identity = false, controlMode = '') {
    const configured = controlMode === 'openpose' ? DEFAULT_OPENPOSE_WORKFLOW : controlMode === 'lineart' ? DEFAULT_LINEART_WORKFLOW : identity ? DEFAULT_IDENTITY_WORKFLOW : reference ? DEFAULT_REFERENCE_WORKFLOW : this.settings.comfyuiWorkflow || DEFAULT_WORKFLOW;
    const file = path.resolve(configured);
    let workflow;
    try { workflow = JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (error) { throw aiError(`Không đọc được ComfyUI API workflow: ${error.message}`, 500, 'COMFYUI_WORKFLOW_INVALID'); }
    const required = controlMode ? ['7', '10', '11', '12', '13', '14', '15', '16', '18', '19', '20', '21', '22', '23'] : identity ? ['7', '10', '11', '12', '13', '14', '15', '16', '18', '19'] : reference ? ['7', '10', '11', '12', '14', '15', '16', '17'] : ['7', '10', '11', '12', '13', '15'];
    for (const id of required) if (!workflow[id]?.inputs) throw aiError(`ComfyUI workflow thiếu node bắt buộc ${id}.`, 500, 'COMFYUI_WORKFLOW_INVALID');
    return workflow;
  }

  async uploadReference(reference) {
    const buffer = reference.buffer || (reference.data ? Buffer.from(reference.data, 'base64') : null);
    if (!buffer?.length) throw aiError('Ảnh reference trống hoặc không đọc được.', 400, 'COMFYUI_REFERENCE_INVALID');
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[reference.mimeType];
    if (!extension) throw aiError(`ComfyUI không hỗ trợ định dạng reference ${reference.mimeType || 'không xác định'}.`, 400, 'COMFYUI_REFERENCE_UNSUPPORTED');
    const form = new FormData();
    form.append('image', new Blob([buffer], { type: reference.mimeType }), `storytools-${crypto.randomUUID()}.${extension}`);
    const data = await fetchJson(`${this.baseUrl}/upload/image`, { method: 'POST', body: form });
    if (!data.name) throw aiError('ComfyUI không xác nhận ảnh reference đã upload.', 502, 'COMFYUI_UPLOAD_FAILED');
    return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
  }

  async generateImage({ prompt, aspectRatio, reference, identity = false, controlMode = '' }) {
    const workflow = await this.workflow(Boolean(reference), identity, controlMode);
    const { width, height } = imageSize(aspectRatio);
    workflow['10'].inputs.text = prompt;
    workflow['11'].inputs.text = NEGATIVE_PROMPT;
    workflow['12'].inputs.seed = crypto.randomInt(0, 2 ** 32);
    if (reference) workflow['16'].inputs.image = await this.uploadReference(reference);
    else {
      workflow['13'].inputs.width = width;
      workflow['13'].inputs.height = height;
    }
    workflow['7'].inputs.filename_prefix = 'storytools';

    let promptId;
    try { ({ prompt_id: promptId } = await fetchJson(`${this.baseUrl}/prompt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: workflow }) })); }
    catch (error) { throw normalizeProviderError('ComfyUI', error); }
    if (!promptId) throw aiError('ComfyUI không trả về prompt_id.', 502, 'COMFYUI_INVALID_RESPONSE');

    const deadline = Date.now() + this.settings.timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 750));
      const history = await fetchJson(`${this.baseUrl}/history/${encodeURIComponent(promptId)}`);
      const job = history[promptId];
      if (!job) continue;
      if (job.status?.status_str === 'error') throw aiError(`ComfyUI tạo ảnh thất bại: ${job.status?.messages?.at(-1)?.[1]?.exception_message || 'không rõ lỗi'}`, 502, 'COMFYUI_GENERATION_FAILED');
      const image = Object.values(job.outputs || {}).flatMap((output) => output.images || [])[0];
      if (!image) continue;
      const params = new URLSearchParams({ filename: image.filename, type: image.type || 'output', ...(image.subfolder ? { subfolder: image.subfolder } : {}) });
      const response = await fetch(`${this.baseUrl}/view?${params}`);
      if (!response.ok) throw aiError('ComfyUI đã hoàn tất nhưng không tải được ảnh output.', 502, 'COMFYUI_OUTPUT_UNAVAILABLE');
      return { buffer: Buffer.from(await response.arrayBuffer()), mimeType: response.headers.get('content-type') || 'image/png', provider: this.name, model: workflow['15'].inputs.ckpt_name };
    }
    throw aiError('ComfyUI tạo ảnh quá thời gian chờ. Kiểm tra queue hoặc tăng AI_REQUEST_TIMEOUT_MS.', 504, 'COMFYUI_TIMEOUT');
  }
}
