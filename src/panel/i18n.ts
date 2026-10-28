import { TranslationError, TranslationLimitError } from '../translation/errors';

export type UiLocale = 'zh-CN' | 'en' | 'ru';
export type UiLanguage = 'auto' | UiLocale;

const en = {
  interfaceLanguage: 'Interface language', auto: 'Same as OpenChamber',
  modelHint: 'Choose a model in Settings → Sessions → Small Model',
  target: 'Translate to', targetLanguage: 'Target language', source: 'Original',
  autoSelection: 'Auto-translate selection', autoSelectionHint: 'Automatically translate selected original text',
  inputPlaceholder: 'Paste or type original text…', paste: 'Read clipboard', clear: 'Clear original',
  translate: 'Translate all', translateHint: 'Translate all (Ctrl/Cmd + Enter)', translating: 'Translating…',
  selection: 'Selection translation', copySelection: 'Copy selection translation', closeSelection: 'Close selection translation',
  retry: 'Retry', cancel: 'Cancel', displayMode: 'Display mode', bilingual: 'Both', translation: 'Translation',
  expand: 'Expand translation', collapse: 'Collapse translation', copy: 'Copy translation', copied: 'Copied',
  resultContent: 'Translation content', privacy: 'Content is not saved to the conversation',
  preparing: 'Preparing translation…', progress: 'Translating {completed}/{total}', cancelling: 'Cancelling…',
  maxChars: 'Up to {limit} characters', overLimit: '{count}, exceeding the limit of {limit}',
  textTooLong: 'Up to {limit} characters. Shorten the text and try again.',
  selectionTooLong: 'Selection exceeds {limit} characters. Use full-text translation.',
  copyTooLong: 'Over {limit} characters. Copy in smaller parts.',
  selectionCopyTooLong: 'Over {limit} characters. Select a smaller part.',
  copyFailed: 'Copy failed. Please copy manually.', clipboardEmpty: 'The clipboard is empty.',
  clipboardRead: 'Clipboard read.', pasteManually: 'Use Ctrl/Cmd + V to paste.',
  saveFailed: 'The setting could not be saved. Your current selection is still applied.',
  failed: 'Translation did not complete. Try again.', noText: 'There is no text to translate.',
  noModel: 'No Small Model configured. Choose one in Settings → Sessions → Small Model and try again.',
  permissionDenied: 'Model permission is missing. Approve it again in Settings → Extensions.',
  providerUnavailable: 'The model is unavailable. Reopen the panel.',
  modelFailed: 'Model request failed. Check that the model is available.',
  timeout: 'The model timed out. Shorten the text or choose a faster model.',
  responseTooLarge: 'The model response is too large. Shorten the text.',
  invalidResponse: 'The model returned an invalid response. Try again.',
  emptyResponse: 'The model returned an empty translation. Try again.',
  countMismatch: 'The number of returned translations does not match. Try again.',
  incompleteResult: 'The model did not translate all segments. Try again.',
  cancelled: 'Translation cancelled.',
  connecting: 'Connecting to OpenChamber',
  connectionFailed: 'Cannot connect to OpenChamber. Open the translation panel from Settings → Extensions.',
  loadFailed: 'Could not load the translation panel. Reopen it.',
  charactersOne: 'character', charactersFew: 'characters', charactersMany: 'characters', charactersOther: 'characters',
  paragraphsOne: 'paragraph', paragraphsFew: 'paragraphs', paragraphsMany: 'paragraphs', paragraphsOther: 'paragraphs',
  seconds: 's',
};

export type MessageKey = keyof typeof en;
export const dictionaries: Record<UiLocale, Record<MessageKey, string>> = {
  en,
  ru: {
    interfaceLanguage: 'Язык интерфейса', auto: 'Как в OpenChamber',
    modelHint: 'Выберите модель в Настройки → Сессии → Small Model',
    target: 'Перевести на', targetLanguage: 'Язык перевода', source: 'Оригинал',
    autoSelection: 'Автоперевод выделенного', autoSelectionHint: 'Автоматически переводить выделенный текст оригинала',
    inputPlaceholder: 'Вставьте или введите оригинал…', paste: 'Прочитать буфер обмена', clear: 'Очистить оригинал',
    translate: 'Перевести всё', translateHint: 'Перевести всё (Ctrl/Cmd + Enter)', translating: 'Перевод…',
    selection: 'Перевод выделенного', copySelection: 'Скопировать перевод выделенного', closeSelection: 'Закрыть перевод выделенного',
    retry: 'Повторить', cancel: 'Отменить', displayMode: 'Режим отображения', bilingual: 'Оба текста', translation: 'Перевод',
    expand: 'Развернуть перевод', collapse: 'Свернуть перевод', copy: 'Скопировать перевод', copied: 'Скопировано',
    resultContent: 'Текст перевода', privacy: 'Содержимое не записывается в сессию',
    preparing: 'Подготовка перевода…', progress: 'Перевод {completed}/{total}', cancelling: 'Отмена…',
    maxChars: 'Не более {limit} символов', overLimit: '{count}, превышен предел {limit}',
    textTooLong: 'Не более {limit} символов. Сократите текст и повторите попытку.',
    selectionTooLong: 'Выделено более {limit} символов. Используйте перевод всего текста.',
    copyTooLong: 'Более {limit} символов. Копируйте по частям.',
    selectionCopyTooLong: 'Более {limit} символов. Выделите меньший фрагмент.',
    copyFailed: 'Не удалось скопировать. Скопируйте вручную.', clipboardEmpty: 'Буфер обмена пуст.',
    clipboardRead: 'Буфер обмена прочитан.', pasteManually: 'Для вставки используйте Ctrl/Cmd + V.',
    saveFailed: 'Не удалось сохранить настройку. Текущий выбор продолжает действовать.',
    failed: 'Перевод не завершён. Повторите попытку.', noText: 'Нет текста для перевода.',
    noModel: 'Small Model не настроена. Выберите модель в Настройки → Сессии → Small Model и повторите попытку.',
    permissionDenied: 'Нет разрешения на модель. Выдайте его повторно в Настройки → Расширения.',
    providerUnavailable: 'Модель недоступна. Откройте панель заново.',
    modelFailed: 'Ошибка вызова модели. Проверьте доступность модели.',
    timeout: 'Модель не ответила вовремя. Сократите текст или выберите более быструю модель.',
    responseTooLarge: 'Ответ модели слишком большой. Сократите текст.',
    invalidResponse: 'Модель вернула некорректный ответ. Повторите попытку.',
    emptyResponse: 'Модель вернула пустой перевод. Повторите попытку.',
    countMismatch: 'Количество переводов в ответе не совпадает с ожидаемым. Повторите попытку.',
    incompleteResult: 'Модель перевела не все фрагменты. Повторите попытку.',
    cancelled: 'Перевод отменён.',
    connecting: 'Подключение к OpenChamber',
    connectionFailed: 'Не удалось подключиться к OpenChamber. Откройте панель перевода из Настройки → Расширения.',
    loadFailed: 'Не удалось загрузить панель перевода. Откройте её заново.',
    charactersOne: 'символ', charactersFew: 'символа', charactersMany: 'символов', charactersOther: 'символа',
    paragraphsOne: 'абзац', paragraphsFew: 'абзаца', paragraphsMany: 'абзацев', paragraphsOther: 'абзаца',
    seconds: 'с',
  },
  'zh-CN': {
    interfaceLanguage: '界面语言', auto: '跟随 OpenChamber',
    modelHint: '在 设置 → 会话 → Small Model 中选择模型',
    target: '译为', targetLanguage: '目标语言', source: '原文',
    autoSelection: '自动划词', autoSelectionHint: '选中原文时自动划词翻译',
    inputPlaceholder: '粘贴或输入原文…', paste: '读取剪贴板', clear: '清空原文',
    translate: '翻译全文', translateHint: '翻译全文（Ctrl/Cmd + Enter）', translating: '翻译中…',
    selection: '划词翻译', copySelection: '复制划词译文', closeSelection: '关闭划词翻译',
    retry: '重试', cancel: '取消', displayMode: '显示方式', bilingual: '对照', translation: '译文',
    expand: '展开译文', collapse: '收起译文', copy: '复制译文', copied: '已复制',
    resultContent: '译文内容', privacy: '内容不写入会话',
    preparing: '准备翻译…', progress: '正在翻译 {completed}/{total}', cancelling: '正在取消…',
    maxChars: '最多 {limit} 字', overLimit: '{count}，超过单次上限 {limit} 字',
    textTooLong: '最多 {limit} 字，请缩短后重试。', selectionTooLong: '选区超过 {limit} 字，请改用全文翻译。',
    copyTooLong: '超过 {limit} 字，请分段复制。', selectionCopyTooLong: '超过 {limit} 字，请减小选区。',
    copyFailed: '复制失败，请手动复制。', clipboardEmpty: '剪贴板为空。',
    clipboardRead: '已读取剪贴板。', pasteManually: '请使用 Ctrl/Cmd + V 粘贴。',
    saveFailed: '设置保存失败，当前选择仍然有效。',
    failed: '翻译没有完成，请重试。', noText: '没有可翻译的文本。',
    noModel: '未配置 Small Model。请在 设置 → 会话 → Small Model 中选择模型后重试。',
    permissionDenied: '缺少模型权限，请在 设置 → 扩展 中重新批准。',
    providerUnavailable: '当前无法使用模型，请重新打开面板。',
    modelFailed: '模型调用失败，请检查模型是否可用。', timeout: '模型响应超时，请缩短文本或换用更快的模型。',
    responseTooLarge: '模型返回内容过大，请缩短文本。', invalidResponse: '模型返回异常结果，请重试。',
    emptyResponse: '模型返回空译文，请重试。', countMismatch: '模型返回的结果数量不匹配，请重试。',
    incompleteResult: '模型未完成所有片段的翻译，请重试。', cancelled: '翻译已取消。',
    connecting: '正在连接 OpenChamber', connectionFailed: '无法连接 OpenChamber。请从 设置 → 扩展 打开翻译面板。',
    loadFailed: '翻译面板加载失败，请重新打开。',
    charactersOne: '字', charactersFew: '字', charactersMany: '字', charactersOther: '字',
    paragraphsOne: '段', paragraphsFew: '段', paragraphsMany: '段', paragraphsOther: '段', seconds: '秒',
  },
};

export function isUiLanguage(value: unknown): value is UiLanguage {
  return value === 'auto' || value === 'zh-CN' || value === 'en' || value === 'ru';
}

export function resolveUiLocale(choice: UiLanguage, hostLocale: string | undefined): UiLocale {
  if (choice !== 'auto') return choice;
  try {
    const tag = new Intl.Locale((hostLocale ?? '').trim().replace(/_/g, '-'));
    if (tag.language === 'zh') return 'zh-CN';
    if (tag.language === 'ru') return 'ru';
  } catch { /* Missing and malformed host tags use English. */ }
  return 'en';
}

export function isMessageKey(value: string): value is MessageKey {
  return Object.hasOwn(en, value);
}

export function message(locale: UiLocale, key: MessageKey, params: Record<string, number | string> = {}): string {
  return dictionaries[locale][key].replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Missing message parameter: ${key}.${name}`);
    return typeof value === 'number' ? new Intl.NumberFormat(locale).format(value) : value;
  });
}

export function formatCount(locale: UiLocale, count: number, unit: 'characters' | 'paragraphs'): string {
  const category = new Intl.PluralRules(locale).select(count);
  const suffix = category === 'one' ? 'One' : category === 'few' ? 'Few' : category === 'many' ? 'Many' : 'Other';
  return `${new Intl.NumberFormat(locale).format(count)} ${message(locale, `${unit}${suffix}`)}`;
}

export function formatDuration(locale: UiLocale, milliseconds: number): string {
  const number = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${number.format(Math.max(0.1, milliseconds / 1000))} ${message(locale, 'seconds')}`;
}

export interface ErrorMessage {
  key: MessageKey;
  limit?: number;
  detail?: string;
}

export function describeError(error: unknown): ErrorMessage {
  if (error instanceof TranslationLimitError) return { key: 'textTooLong', limit: error.limit };
  if (error instanceof TranslationError) {
    const keys = {
      'no-model': 'noModel', 'permission-denied': 'permissionDenied', 'provider-unavailable': 'providerUnavailable',
      'model-failed': 'modelFailed', timeout: 'timeout', 'response-too-large': 'responseTooLarge',
      'invalid-response-shape': 'invalidResponse', 'empty-response': 'emptyResponse',
      'count-mismatch': 'countMismatch', 'incomplete-result': 'incompleteResult', cancelled: 'cancelled',
      unknown: 'failed',
    } as const;
    const key = keys[error.reason];
    return { key, ...(error.reason === 'unknown' ? { detail: error.message } : {}) };
  }
  return { key: 'failed', ...(error instanceof Error && error.message.trim() ? { detail: error.message } : {}) };
}

export function formatError(locale: UiLocale, error: ErrorMessage): string {
  const text = message(locale, error.key, error.limit === undefined ? {} : { limit: error.limit });
  return error.detail ? `${text}\n${error.detail}` : text;
}
