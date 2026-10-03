export function aiError(message, status = 502, code = 'AI_REQUEST_FAILED') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function normalizeProviderError(provider, error) {
  if (error?.status && error.status < 500 && error.code !== 'AI_REQUEST_FAILED') return error;
  const status = Number(error?.status) || 502;
  const prefix = provider === '9router' ? '9router' : 'Gemini';
  const hints = {
    400: 'Yêu cầu không hợp lệ. Kiểm tra model và dữ liệu đầu vào.',
    401: 'API key không hợp lệ. Kiểm tra lại trong Cài đặt.',
    403: 'API key không có quyền dùng model này.',
    404: 'Không tìm thấy endpoint hoặc model. Kiểm tra base URL và model ID.',
    408: 'Yêu cầu hết thời gian chờ. Hãy thử lại.',
    429: 'Đã vượt giới hạn/quota. Hãy chờ rồi thử lại.',
  };
  const detail = status >= 500 ? 'Dịch vụ provider hiện không phản hồi. Hãy thử lại sau.' : hints[status] || error?.message || 'Lỗi không xác định.';
  return aiError(`${prefix}: ${detail}`, status >= 500 ? 502 : status, 'AI_REQUEST_FAILED');
}
