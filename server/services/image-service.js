import { generateImage as geminiGenerateImage } from '../gemini.js';
import { ComfyUiAdapter } from '../ai/comfyui-adapter.js';

export async function generateImage(args) {
  if (args.settings?.localAiEnabled) {
    // Keep a stable character reference as identity; chaining the previous panel causes drift.
    const reference = args.refs?.find((item) => item.label?.startsWith('Reference image of the character')) || args.refs?.at(-1);
    return new ComfyUiAdapter(args.settings).generateImage({ ...args, reference, identity: Boolean(reference), controlMode: reference ? (args.controlMode || 'openpose') : '' });
  }
  if ((args.settings?.provider || 'gemini') === 'gemini' || args.refs?.length) return geminiGenerateImage(args);
  const error = new Error('9router: tạo ảnh text-to-image chưa được nối vào route lưu ảnh; reference image vẫn giữ Gemini native.');
  error.status = 501;
  throw error;
}
