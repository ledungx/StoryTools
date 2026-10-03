import { useEffect, useState } from 'react';
import { api } from '../api.js';
import ImageModelSelect from './image-model-select.jsx';

// Fallback suggestions when the model list can't be fetched (no key yet or offline).
const FALLBACK_MODELS = {
  text: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.1-pro-preview'],
  image: ['gemini-3.1-flash-image', 'gemini-3-pro-image', 'gemini-3.1-flash-lite-image'],
};

export default function SettingsView({ settings, onSaved }) {
  const [apiKey, setApiKey] = useState('');
  const [ninerouterApiKey, setNineRouterApiKey] = useState('');
  const [provider, setProvider] = useState('gemini');
  const [ninerouterBaseUrl, setNineRouterBaseUrl] = useState('http://localhost:20128/v1');
  const [ninerouterTextModel, setNineRouterTextModel] = useState('');
  const [ninerouterVisionModel, setNineRouterVisionModel] = useState('');
  const [ninerouterImageModel, setNineRouterImageModel] = useState('');
  const [visionModel, setVisionModel] = useState('');
  const [textModel, setTextModel] = useState('');
  const [imageModel, setImageModel] = useState('');
  const [models, setModels] = useState(FALLBACK_MODELS);
  const [modelsNote, setModelsNote] = useState('');
  const [message, setMessage] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setTextModel(settings.textModel);
    setProvider(settings.provider || 'gemini');
    setVisionModel(settings.visionModel || settings.textModel);
    setImageModel(settings.imageModel);
    setNineRouterBaseUrl(settings.ninerouterBaseUrl || 'http://localhost:20128/v1');
    setNineRouterTextModel(settings.ninerouterTextModel || '');
    setNineRouterVisionModel(settings.ninerouterVisionModel || '');
    setNineRouterImageModel(settings.ninerouterImageModel || '');
    if (!settings.hasApiKey) return;
    api
      .listModels()
      .then((list) => {
        setModels(list);
        setModelsNote(`Danh sách lấy từ API key của bạn (${list.text.length} model text, ${list.image.length} model ảnh).`);
      })
      .catch((err) => setModelsNote(`Không lấy được danh sách model: ${err.message}`));
  }, [settings]);

  async function save(e) {
    e.preventDefault();
    try {
      await api.saveSettings({ provider, apiKey, ninerouterApiKey, ninerouterBaseUrl, textModel, visionModel, imageModel, ninerouterTextModel, ninerouterVisionModel, ninerouterImageModel });
      setApiKey('');
      setNineRouterApiKey('');
      setMessage('Đã lưu cài đặt.');
      onSaved();
    } catch (err) {
      setMessage(err.message);
    }
  }

  async function testConnection() {
    setTesting(true);
    try { const result = await api.testConnection(); setMessage(`Kết nối ${result.provider} thành công.`); }
    catch (err) { setMessage(err.message); }
    finally { setTesting(false); }
  }

  return (
    <form className="card narrow stack" onSubmit={save}>
      <h2>Cài đặt AI provider</h2>
      <label>Provider mặc định<select value={provider} onChange={(e) => setProvider(e.target.value)}><option value="gemini">Gemini native</option><option value="9router">9router</option><option value="hybrid">Hybrid</option></select></label>
      <label>
        API key {settings?.hasApiKey && <span className="muted">(đang dùng key {settings.apiKeyHint}, để trống nếu không đổi)</span>}
        <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="AIza…" autoComplete="off" />
      </label>
      <label>
        Model viết kịch bản, caption, đặt lời thoại
        <input list="text-models" value={textModel} onChange={(e) => setTextModel(e.target.value)} />
      </label>
      <ImageModelSelect value={imageModel} onChange={setImageModel} stacked />
      <label>Model vision<input value={visionModel} onChange={(e) => setVisionModel(e.target.value)} /></label>
      <fieldset><legend>9router</legend><label>Base URL<input value={ninerouterBaseUrl} onChange={(e) => setNineRouterBaseUrl(e.target.value)} /></label><label>API key {settings?.hasNineRouterApiKey && <span className="muted">(đang dùng {settings.nineRouterApiKeyHint})</span>}<input type="password" value={ninerouterApiKey} onChange={(e) => setNineRouterApiKey(e.target.value)} autoComplete="off" /></label><label>Text model<input value={ninerouterTextModel} onChange={(e) => setNineRouterTextModel(e.target.value)} /></label><label>Vision model<input value={ninerouterVisionModel} onChange={(e) => setNineRouterVisionModel(e.target.value)} /></label><label>Image model<input value={ninerouterImageModel} onChange={(e) => setNineRouterImageModel(e.target.value)} /></label></fieldset>
      <datalist id="text-models">{models.text.map((m) => <option key={m} value={m} />)}</datalist>
      <p className="muted small">
        {modelsNote} Model đời cũ (VD <code>gemini-2.5-*</code>) có thể vẫn hiện trong danh sách nhưng bị khoá với tài khoản mới – nên chọn bản mới nhất.
      </p>
      <p className="muted small">
        Key được lưu cục bộ trong <code>data/settings.json</code> (đã gitignore). Model ảnh Gemini không có free tier – mỗi lần tạo đều tính phí.
      </p>
      <div className="row">
        <button className="primary" type="submit">Lưu</button>
        <button type="button" onClick={testConnection} disabled={testing}>{testing ? 'Đang kiểm tra…' : 'Test connection'}</button>
        {message && <span className="muted">{message}</span>}
      </div>
    </form>
  );
}
