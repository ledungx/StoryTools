# StoryTools Refactoring Roadmap

## 0. Mục tiêu và quyết định kiến trúc

StoryTools phải hỗ trợ bốn chế độ cấu hình:

1. **Gemini native**: dùng Google Gemini SDK hiện tại.
2. **9router**: dùng endpoint OpenAI-compatible cho Codex, Antigravity và các model khác.
3. **Hybrid**: chọn provider theo capability của từng tác vụ.
4. **Local shared services**: dùng Ollama cho text/vision fallback và ComfyUI cho image workflow chạy trên PC local, dùng chung cho nhiều project.

Cấu hình phải được lưu cố định qua:

- file `.env` cho triển khai/server;
- mục **Settings** trong giao diện StoryTools cho người dùng.

Không được yêu cầu người dùng dán API key 9router vào biến `GEMINI_API_KEY`. Hai loại credential phải tách riêng.

Mục tiêu cuối:

```text
StoryTools UI
  -> Story application services
     -> Capability-aware provider router
        -> GeminiAdapter
        -> NineRouterAdapter
           -> Codex / Antigravity / image providers
           -> LocalServiceAdapter
              -> Ollama (text/vision fallback)
              -> ComfyUI (image workflow)
```

## 1. Phạm vi chức năng

Provider abstraction phải bao phủ các tác vụ hiện đang có:

- `planStory`: lập dàn ý truyện;
- `generateFrames`: viết khung truyện;
- `placeBubbles`: vision, định vị nhân vật và bóng thoại;
- `generateCaption`: tiêu đề, caption, hashtag;
- `generateImage`: text-to-image;
- `listModels`: lấy catalog và capability model;
- kiểm tra kết nối và chuẩn hóa lỗi.

Các tác vụ không được gọi trực tiếp `GoogleGenAI` từ route hoặc UI.

## 2. Cấu hình chuẩn

### Biến môi trường

Bổ sung vào `.env.example`:

```env
AI_PROVIDER=gemini

GEMINI_API_KEY=
GEMINI_TEXT_MODEL=gemini-3.8-flash
GEMINI_IMAGE_MODEL=gemini-3.1-flash-image

NINEROUTER_BASE_URL=http://localhost:20128/v1
NINEROUTER_API_KEY=
NINEROUTER_TEXT_MODEL=
NINEROUTER_VISION_MODEL=
NINEROUTER_IMAGE_MODEL=

AI_REQUEST_TIMEOUT_MS=120000
AI_MAX_RETRIES=1
```

Không ghi API key vào log, response, project JSON hoặc client bundle.

### Settings trong ứng dụng

Settings cần có:

- provider mặc định: Gemini / 9router / Hybrid;
- base URL 9router;
- API key 9router;
- model text;
- model vision;
- model image;
- nút **Test connection**;
- nút **Refresh models**;
- bảng capability: text, vision, image, image-edit;
- trạng thái provider/model đang hoạt động.
- cấu hình local service: Ollama base URL/model và ComfyUI base URL/workflow;
- nút **Test local services**;
- trạng thái health của Ollama/ComfyUI và workflow đang dùng.

Giá trị trong Settings được lưu server-side. API chỉ trả về `hasApiKey` và `apiKeyHint`, không trả key đầy đủ.

## 3. Cấu trúc mã đích

Tạo các module:

```text
server/ai/
  types.js
  provider-router.js
  gemini-adapter.js
  ninerouter-adapter.js
  model-catalog.js
  request.js
  errors.js
server/services/
  story-service.js
  vision-service.js
  image-service.js
```

### Contract tối thiểu

```js
provider.generateJson({ model, system, contents, schema, temperature })
provider.analyzeImage({ model, image, prompt, schema })
provider.generateImage({ model, prompt, refs, aspectRatio })
provider.listModels()
provider.getCapabilities(model)
provider.testConnection()
```

Local service contract bổ sung:

```js
local.listModels()
local.generateJson({ model, system, contents, schema, temperature })
local.generateImage({ workflow, inputs, prompt, refs })
local.testConnection()
```

ComfyUI và Ollama là shared services cấp máy, không lưu credential hoặc model binary trong từng project. Mỗi project chỉ lưu provider/model/workflow ID và các input cần thiết.

Provider adapter phải trả về kiểu dữ liệu nội bộ thống nhất. Không để format Gemini hoặc OpenAI-compatible lan sang UI.

## 4. Chiến lược provider

### GeminiAdapter

Di chuyển logic hiện tại từ `server/gemini.js` sang adapter này:

- giữ GoogleGenAI native;
- giữ JSON schema;
- giữ Gemini `inlineData`;
- giữ tạo ảnh có `responseModalities: ['TEXT', 'IMAGE']`;
- giữ reference images và aspect ratio.

Đây là backend tương thích đầy đủ với hành vi hiện tại.

### NineRouterAdapter

Dùng:

- `/v1/chat/completions` cho text và vision;
- `/v1/images/generations` cho text-to-image;
- `/v1/models` hoặc catalog tương ứng để liệt kê model;
- chuẩn hóa response URL, base64 và binary thành `{ buffer, mimeType }`.

Model Codex và Antigravity được chọn bằng model ID trong catalog thực tế. Không hard-code một model ID chưa được kiểm tra.

### Hybrid routing

Mặc định:

```text
text       -> model text được chọn
vision     -> model vision có capability vision
image      -> model image có capability image
image-ref  -> Gemini native cho đến khi image-edit 9router được kiểm thử
```

Không fallback âm thầm sang provider/model khác. Nếu fallback được bật, phải hiển thị provider/model thực tế trong UI và log audit không chứa secret.

## 5. Xử lý reference image

Có hai loại tạo ảnh:

1. **Text-to-image**: có thể dùng 9router image generation.
2. **Reference-image generation**: cần giữ ảnh nhân vật/ảnh khung trước.

Trong phase đầu, reference-image generation tiếp tục dùng Gemini native trong Hybrid mode. Chỉ bật 9router cho reference image sau khi có probe xác nhận:

- ảnh được truyền đủ;
- model giữ được nhân vật và style;
- output được lưu đúng mime type;
- lỗi edit được chuẩn hóa.

Không được làm mất reference images chỉ để đạt tương thích OpenAI.

## 6. Lộ trình triển khai

### Phase 0 — Baseline và bảo vệ hành vi

- tạo test/probe cho các flow hiện tại;
- ghi lại payload/response shape đã chuẩn hóa;
- xác nhận `npm run dev`, `npm run build`, `npm start`;
- không thay đổi UI hành vi.

**Gate:** baseline chạy được, project và ảnh cũ vẫn đọc được.

### Phase 1 — Tách GeminiAdapter

- tạo provider contract;
- chuyển logic Gemini hiện tại sang adapter;
- route gọi service thay vì gọi trực tiếp `gemini.js`;
- migrate settings cũ `GEMINI_API_KEY` tự động.

**Gate:** tất cả flow Gemini hiện tại pass.

### Phase 2 — NineRouterAdapter cho text

- thêm cấu hình 9router;
- implement request/error/timeout;
- implement text JSON;
- implement catalog và test connection;
- hỗ trợ Codex và Antigravity bằng model ID.

**Gate:** plan story, frames và caption chạy được qua 9router.

### Phase 3 — Vision qua 9router

- chuyển ảnh sang OpenAI multimodal format;
- implement bubble placement;
- kiểm tra base64/data URL;
- giới hạn kích thước và timeout.

**Gate:** bubble placement cho kết quả hợp lệ hoặc trả lỗi rõ ràng.

### Phase 4 — Image generation qua 9router

- implement `/v1/images/generations`;
- hỗ trợ URL/base64/binary;
- map aspect ratio sang size phù hợp;
- lưu ảnh qua storage hiện tại.

**Gate:** text-to-image hoạt động, không ảnh hưởng ảnh Gemini.

### Phase 4A — Local shared services: Ollama + ComfyUI

- Cài Ollama và ComfyUI một lần ở cấp máy, không cài lặp theo project.
- Ollama mặc định phục vụ tại `http://127.0.0.1:11434` với API `/api`.
- ComfyUI mặc định phục vụ tại `http://127.0.0.1:8188` với API `/prompt`, `/history` và `/view`.
- Quản lý vòng đời ComfyUI bằng launcher global trong `D:\AI\Comfy Desktop\service`, tách khỏi bất kỳ project nào; mỗi project chỉ gọi API `http://127.0.0.1:8188`.
- Thêm health check, timeout, retry hữu hạn và thông báo hướng dẫn khi service chưa cài/chưa chạy.
- Text fallback chỉ dùng Ollama khi người dùng chọn Local/Hybrid hoặc provider chính unavailable và fallback đã bật rõ ràng.
- Image local chỉ chạy workflow ComfyUI đã được kiểm thử; không tự đoán node, checkpoint, LoRA hoặc workflow.
- Reference-image dùng img2img workflow đã probe: StoryTools upload ảnh nhân vật hoặc khung trước vào ComfyUI, VAE-encode ảnh đó và dùng denoise thấp để giữ diện mạo/trang phục/bối cảnh. Với một character reference, workflow IP-Adapter Plus Face SDXL đã được probe để giữ khuôn mặt, tóc, trang phục và phụ kiện mạnh hơn img2img. ControlNet Union SDXL + `OpenposePreprocessor` đã được probe để giữ pose; ControlNet Union SDXL + `LineArtPreprocessor` đã được probe để giữ đường nét/bố cục panel trước. Nhiều reference đồng thời và identity lock tuyệt đối vẫn không được tuyên bố.

**Gate:** Ollama text JSON pass với schema nội bộ; ComfyUI text-to-image, img2img reference, IP-Adapter Plus Face SDXL, ControlNet OpenPose và ControlNet Lineart pass bằng prompt API, upload input và lưu được output; provider/model thực tế hiển thị trong audit/UI; không fallback âm thầm.

### Phase 5 — Hybrid UI và capability routing

- thêm provider/model selectors;
- hiển thị capability;
- thêm test connection;
- thêm trạng thái request;
- hiển thị provider/model thực tế sau mỗi lần tạo.
- hiển thị Local/Ollama/ComfyUI như provider dùng chung cho mọi project.

**Gate:** người dùng có thể chọn Gemini, 9router hoặc Hybrid mà không sửa code.

### Phase 6 — Reference image và hardening

- probe image-edit/reference cho model cụ thể;
- chỉ bật capability khi probe pass;
- retry có giới hạn;
- chống request trùng;
- chuẩn hóa lỗi 401, 403, 404, 408, 429, 5xx;
- kiểm tra không rò rỉ credential.

**Gate:** release candidate pass toàn bộ regression và security checks.

## 7. Tiêu chí chấp nhận

### Functional

- Gemini native tiếp tục tạo story, frames, bubbles, caption và image.
- 9router Codex tạo được text JSON.
- 9router Antigravity tạo được text/vision theo capability.
- 9router image model tạo được text-to-image.
- chuyển provider không làm mất project, character hoặc panel image.
- model list không làm server crash khi một provider unavailable.

### Reliability

- timeout request hữu hạn;
- retry tối đa theo cấu hình;
- không retry lỗi validation/401/403;
- response lỗi có message tiếng Việt có hướng xử lý;
- không fallback không thông báo.

### Security

- secret chỉ tồn tại server-side;
- không log Authorization header;
- không trả full API key cho frontend;
- không commit `.env`;
- request tới base URL được validate.

### Compatibility

- giữ nguyên schema project hiện tại;
- giữ nguyên thư mục `data/`;
- giữ nguyên API route hiện tại nếu không cần breaking change;
- migration settings có thể chạy nhiều lần an toàn.

## 8. Quy trình review bắt buộc cho Codex

Codex phải thực hiện theo thứ tự:

1. đọc roadmap này và cấu trúc repository;
2. lập implementation plan có file cụ thể;
3. không sửa code trước khi xác định contract;
4. triển khai từng phase nhỏ;
5. sau mỗi phase chạy test/build phù hợp;
6. kiểm tra diff và dữ liệu mẫu;
7. báo cáo:
   - files changed;
   - behavior changed;
   - tests run;
   - known limitations;
   - rollback path;
8. không tự thay đổi model ID hoặc schema provider nếu chưa có probe.

Codex phải đóng ba vai trò đồng thời:

- **System Designer:** bảo vệ boundary giữa UI, service và provider adapter.
- **Principal Architect:** đánh giá trade-off, backward compatibility và khả năng mở rộng.
- **Independent Reviewer:** tìm regression, secret leakage, silent fallback và capability mismatch.

## 9. Prompt thực thi cho Codex

> Bạn đang refactor StoryTools theo `roadmap.md`. Đóng vai System Designer, Principal Architect và Independent Reviewer.
>
> Trước tiên hãy đọc toàn bộ roadmap, package.json, server/index.js, server/gemini.js, server/storage.js, src/api.js và Settings UI. Lập plan theo phase, nêu rõ file sẽ thay đổi và acceptance criteria.
>
> Xây dựng provider adapter hai backend:
>
> - Gemini native;
> - 9router OpenAI-compatible cho Codex/Antigravity.
>
> Giữ backward compatibility với `GEMINI_API_KEY`, thêm cấu hình `NINEROUTER_*`, và cho phép chọn provider trong Settings. Tách text, vision và image thành capability-aware services. Không đưa API key ra frontend. Không dùng 9router image-edit/reference image cho đến khi probe chứng minh payload và output tương thích.
>
> Triển khai từng phase, chạy test sau mỗi phase, không sửa ngoài phạm vi roadmap. Nếu phát hiện model ID, endpoint hoặc capability chưa chắc chắn, dừng ở adapter/configuration point và tạo probe thay vì đoán. Không fallback âm thầm. Cuối mỗi phase, review diff như một Principal Architect và báo cáo rủi ro còn lại.
>
> Hoàn tất chỉ khi Gemini flow cũ vẫn pass, 9router text pass, 9router vision pass, 9router text-to-image pass, settings migration pass, build pass và không có credential leak.

## 10. Rollback

- đặt `AI_PROVIDER=gemini`;
- giữ nguyên dữ liệu `data/`;
- disable 9router trong Settings;
- revert riêng các adapter/service mà không cần migrate project data.
- đặt `LOCAL_AI_ENABLED=false` để vô hiệu hoá shared services mà không xoá model/workflow local.

Roadmap này ưu tiên giữ chức năng Gemini hiện tại, thêm Codex/Antigravity qua 9router theo capability, và cho phép mở rộng provider sau này mà không viết lại StoryTools.

## 11. Cài đặt local global trên Windows

Trạng thái kiểm tra ngày 2026-10-02: ComfyUI Desktop đã được cài tại `D:\\AI\\Comfy Desktop`; dữ liệu shared (models/input/output) dùng cùng root `D:\\AI\\Comfy Desktop\\ComfyUI-Shared`. Ollama chưa được cài.

### Ollama

1. Cài Ollama for Windows từ trang chính thức của Ollama.
2. Mở terminal mới và kiểm tra `ollama --version`.
3. Tải một model text phù hợp, ví dụ `ollama pull llama3.2` hoặc model đã được đội dự án phê duyệt.
4. Để Ollama chạy nền tại cổng mặc định `11434`; kiểm tra bằng `ollama list` và `http://127.0.0.1:11434/api/tags`.

### ComfyUI

1. Cài ComfyUI portable hoặc từ source vào một thư mục cố định ngoài các project, ví dụ `D:\\AI\\ComfyUI`.
2. Cài checkpoint/workflow theo license và yêu cầu phần cứng; không tải tự động từ StoryTools.
3. Khởi động ComfyUI ở cổng `8188`, bật API server mặc định.
4. Import workflow đã kiểm thử, lưu JSON vào thư mục workflow dùng chung; ghi rõ checkpoint, custom nodes và input/output node IDs.

### ComfyUI web service (verified 2026-10-02)

- Shared service runs locally only at `http://127.0.0.1:8188`; the same URL provides both the browser GUI and StoryTools API.
- ComfyUI Desktop is optional after setup: use it for model/node/workflow administration, but do not run its backend at the same time as the service because both use port `8188`.
- Use `D:\AI\Comfy Desktop\service\start-comfyui-hidden.vbs` for a no-console launch, or `D:\AI\Comfy Desktop\service\start-comfyui.bat` when you want visible status output.
- Use `D:\AI\Comfy Desktop\service\check-comfyui.bat` to confirm `/system_stats`, and `D:\AI\Comfy Desktop\service\stop-comfyui.bat` to stop only a service started by this launcher.
- Service paths are fixed to the shared installation: source and Python environment under `D:\AI\Comfy Desktop\ComfyUI-Installs\ComfyUI\ComfyUI`; model/input/output data under `D:\AI\Comfy Desktop\ComfyUI-Shared`.
- The launcher enables ComfyUI Manager, loads the Desktop instance model-path configuration, and writes launcher-owned PID/log files under `D:\AI\Comfy Desktop\service\runtime`.

### Cấu hình StoryTools

Đặt trong `.env` hoặc Settings server-side:

```env
LOCAL_AI_ENABLED=false
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_TEXT_MODEL=llama3.2
OLLAMA_VISION_MODEL=
COMFYUI_BASE_URL=http://127.0.0.1:8188
COMFYUI_WORKFLOW=
LOCAL_AI_FALLBACK=false
```

Chỉ bật `LOCAL_AI_ENABLED=true` sau khi đã test health và chọn model/workflow thực tế. `LOCAL_AI_FALLBACK` mặc định tắt để tránh thay đổi chất lượng hoặc phát sinh workflow ngoài ý muốn.

