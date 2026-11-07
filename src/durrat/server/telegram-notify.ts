// Ported from the original Vercel function. Sends new-listing notices to the rent/sale Telegram channels.
type FirestoreValue = {
  stringValue?: string;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

type FirestoreDocument = {
  fields?: Record<string, FirestoreValue>;
};

type RentPeriod = 'monthly' | 'annual' | 'two_installments';


const TELEGRAM_CAPTION_LIMIT = 1024;

const RENT_CHAT_ID = '@DurratAlHijraRealEstateOffice';
const SALE_CHAT_ID = '@DurratAlHijraRealEstateOffice11';
const DEFAULT_IMAGE = 'https://kommodo.ai/i/HyR58SlhDKy8AyuOuI8O';

type TelegramTarget = { botToken: string; chatId: string };

function telegramTargetFor(isRent: boolean): TelegramTarget {
  const env = process.env;
  const shared = (env.TELEGRAM_BOT_TOKEN || '').trim();
  const botToken = (isRent ? env.TELEGRAM_RENT_BOT_TOKEN : env.TELEGRAM_SALE_BOT_TOKEN)?.trim() || shared;
  return { botToken, chatId: isRent ? RENT_CHAT_ID : SALE_CHAT_ID };
}

const rentPeriodPriceText: Record<RentPeriod, string> = {
  monthly: 'شهرياً',
  annual: 'سنوياً',
  two_installments: 'للدفعة الواحدة',
};

const rentPeriodLabelText: Record<RentPeriod, string> = {
  monthly: 'إيجار شهري',
  annual: 'إيجار سنوي',
  two_installments: 'إيجار على دفعتين',
};

function stringField(fields: Record<string, FirestoreValue>, name: string) {
  const value = fields[name]?.stringValue;
  return typeof value === 'string' ? value : '';
}

function firstTextField(fields: Record<string, FirestoreValue>, names: string[]) {
  for (const name of names) {
    const value = fields[name];
    if (typeof value?.stringValue === 'string' && value.stringValue.trim()) {
      return value.stringValue.trim();
    }
    if (typeof value?.integerValue === 'string') return value.integerValue;
    if (typeof value?.doubleValue === 'number' && Number.isFinite(value.doubleValue)) {
      return String(value.doubleValue);
    }
  }
  return '';
}

function numberField(fields: Record<string, FirestoreValue>, name: string) {
  const value = fields[name];
  const number = value?.doubleValue ?? Number(value?.integerValue);
  return Number.isFinite(number) ? number : 0;
}

function formatNumericText(value: string) {
  const number = Number(value);
  return value.trim() && Number.isFinite(number)
    ? new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(number)
    : value;
}

function areaText(fields: Record<string, FirestoreValue>) {
  const rawArea = limitText(firstTextField(fields, ['area']), 30);
  if (!rawArea) return '';
  const numericArea = Number(rawArea);
  if (Number.isFinite(numericArea) && numericArea <= 0) return '';
  const alreadyHasUnit = /(?:م²|م2|متر|sqm|sq\.?\s*m|ft²|ft2|sq\.?\s*ft)/i.test(rawArea);
  return `${formatNumericText(rawArea)}${alreadyHasUnit ? '' : ' م²'}`;
}

function normalizedLabel(value: string) {
  return value.trim().toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي');
}

function isRentLabel(value: string) {
  return /(?:^|[^a-z])(?:rent|rental|lease)(?:$|[^a-z])|(?:ايجار|استئجار|شهري|شهر|سنوي|سنة)|(?:^|[^a-z])(?:monthly|month|annual|yearly|year)(?:$|[^a-z])/i.test(normalizedLabel(value));
}

function isSaleLabel(value: string) {
  return /(?:^|[^a-z])(?:sale|sell)(?:$|[^a-z])|بيع/i.test(normalizedLabel(value));
}

function rentPeriodFromFields(fields: Record<string, FirestoreValue>): RentPeriod {
  const value = stringField(fields, 'rent_period');
  if (value === 'monthly' || value === 'annual' || value === 'two_installments') return value;
  return 'annual';
}

function isRentListing(fields: Record<string, FirestoreValue>) {
  const exact = stringField(fields, 'listing_type').trim().toLowerCase();
  if (exact === 'rent') return true;
  if (exact === 'sale') return false;
  const listingFields = ['listing_type', 'listingType', 'subType', 'offerType', 'offer_type'];
  const values = listingFields.map((name) => stringField(fields, name).trim()).filter(Boolean);
  const recognized = values.find((value) => isRentLabel(value) || isSaleLabel(value));
  if (recognized) return isRentLabel(recognized);
  return values.some((value) => /(?:^|[^a-z])(?:monthly|month|annual|yearly|year)(?:$|[^a-z])|شهري|شهر|سنوي|سنة/i.test(normalizedLabel(value)));
}

function isApartmentType(propertyType: string) {
  const normalizedType = propertyType.toLowerCase();
  return normalizedType.includes('apartment') || propertyType.includes('شقة') || propertyType.includes('شقق');
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character] ?? character;
  });
}

function limitText(value: string, maxCharacters: number) {
  return Array.from(value.trim()).slice(0, maxCharacters).join('');
}

function isHttpsUrl(value: string) {
  if (!value || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function extractImageUrl(val: unknown): string {
  if (!val) return '';
  if (typeof val === 'string' && isHttpsUrl(val)) return val;
  if (typeof val === 'object' && val !== null) {
    const v = val as FirestoreValue;
    if (v.stringValue && isHttpsUrl(v.stringValue)) return v.stringValue;
    if (v.arrayValue?.values) {
      for (const item of v.arrayValue.values) {
        const found = extractImageUrl(item);
        if (found) return found;
      }
    }
    if (v.mapValue?.fields) {
      for (const key of Object.keys(v.mapValue.fields)) {
        const found = extractImageUrl(v.mapValue.fields[key]);
        if (found) return found;
      }
    }
  }
  return '';
}

function firstImageUrl(fields: Record<string, FirestoreValue>) {
  const imageKeys = [
    'image', 'imageUrl', 'image_url', 'imageURL', 
    'images', 'photos', 'imageUrls', 'photo', 'picture',
    'banner', 'thumbnail', 'media'
  ];
  for (const name of imageKeys) {
    if (fields[name]) {
      const url = extractImageUrl(fields[name]);
      if (url && !url.includes('durrattest23.vercel.app')) return url;
    }
  }
  for (const key of Object.keys(fields)) {
    const url = extractImageUrl(fields[key]);
    if (url && !url.includes('durrattest23.vercel.app')) return url;
  }
  // صورة افتراضية للعقار في حال لم يتم رفع صورة لضمان عدم فشل الإرسال أبداً
  return DEFAULT_IMAGE;
}

function parseBody(body: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) as unknown : body;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

type TelegramResult = { ok: boolean; error?: string };

async function sendTelegram(botToken: string, method: 'sendPhoto' | 'sendMessage', payload: Record<string, unknown>): Promise<TelegramResult> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({})) as { ok?: boolean; description?: string };
    if (response.ok && result.ok === true) return { ok: true };
    const error = `${method}: ${result.description || `HTTP ${response.status}`}`;
    console.error('Telegram error', error);
    return { ok: false, error };
  } catch (err) {
    const error = `${method}: ${String(err)}`;
    console.error('Telegram fetch failed', error);
    return { ok: false, error };
  }
}

function normalizeChatId(value: string) {
  const id = value.trim();
  if (!id) return id;
  return /^(@|-?\d)/.test(id) ? id : `@${id}`;
}

function buildMessage(fields: Record<string, FirestoreValue>, propertyId: string, appUrl: string) {
  const title = limitText(stringField(fields, 'title') || 'عقار جديد', 140);
  const propertyType = limitText(stringField(fields, 'property_type') || 'غير محدد', 60);
  const isRent = isRentListing(fields);
  const rentPeriod = rentPeriodFromFields(fields);
  const listingLabel = isRent ? rentPeriodLabelText[rentPeriod] : 'للبيع';
  const priceValue = new Intl.NumberFormat('ar-SA').format(numberField(fields, 'price'));
  const priceNumber = numberField(fields, 'price');
  const priceSuffix = !isRent ? '' : rentPeriod === 'two_installments'
    ? ` على دفعتين (${new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 }).format(priceNumber / 2)} ر.س للدفعة الواحدة)`
    : ` ${rentPeriodPriceText[rentPeriod]}`;
  const city = limitText(stringField(fields, 'city'), 60);
  const district = limitText(stringField(fields, 'district'), 60);
  const serialNumber = numberField(fields, 'serial_number');
  const advertiserName = limitText(
    stringField(fields, 'publisher_name') || stringField(fields, 'created_by_name') || 'غير محدد',
    80,
  );
  const area = areaText(fields);
  const detailsUrl = `${appUrl}/?property=${encodeURIComponent(propertyId)}`;

  const apartmentLines = isApartmentType(propertyType)
    ? [
        ['غرف النوم', ['bedrooms', 'bedroom_count', 'rooms']],
        ['الصالات', ['lounges', 'living_rooms', 'halls']],
        ['المطابخ', ['kitchens', 'kitchen_count']],
        ['دورات المياه', ['bathrooms', 'bathroom_count', 'baths']],
      ].flatMap(([label, keys]) => {
        const value = firstTextField(fields, keys as string[]);
        return value ? [`${label}: ${escapeHtml(formatNumericText(limitText(value, 30)))}`] : [];
      })
    : [];

  return [
    `<b>🏡 عرض عقاري جديد | ${escapeHtml(title)}</b>`,
    `النوع: ${escapeHtml(propertyType)} — ${escapeHtml(listingLabel)}`,
    `السعر: ${escapeHtml(priceValue)} ر.س${escapeHtml(priceSuffix)}`,
    area ? `المساحة: ${escapeHtml(area)}` : '',
    ...apartmentLines,
    city || district
      ? `الموقع: ${escapeHtml([city, district].filter(Boolean).join(' — '))}`
      : '',
    `المعلن: ${escapeHtml(advertiserName)}`,
    serialNumber
      ? `رقم الإعلان: ${new Intl.NumberFormat('ar-SA').format(serialNumber)}`
      : '',
    `<a href="${escapeHtml(detailsUrl)}">معاينة العقار على الموقع</a>`,
  ].filter(Boolean).join('\n');
}


const FIREBASE_PROJECT_ID = 'durratalhijarh';

export async function handleTelegramNotify(request: Request): Promise<Response> {
  const json = (data: unknown, status = 200) => Response.json(data, { status });
  const authHeader = request.headers.get('authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
  const body = parseBody(await request.text());
  const propertyId = body?.propertyId;
  if (typeof propertyId !== 'string' || !propertyId || propertyId.length > 128) {
    return json({ error: 'Invalid property ID' }, 400);
  }
  const projectId = process.env.FIREBASE_PROJECT_ID || FIREBASE_PROJECT_ID;
  try {
    // Staff session check: the employee record is only readable by signed-in staff (Firestore rules).
    const firestoreBase = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
    const propertyResponse = await fetch(`${firestoreBase}/properties/${encodeURIComponent(propertyId)}`, {
      headers: { Authorization: authHeader },
    });
    if (propertyResponse.status === 401 || propertyResponse.status === 403) return json({ error: 'Unauthorized' }, 401);
    let fields: Record<string, FirestoreValue> = {};
    if (propertyResponse.ok) {
      fields = ((await propertyResponse.json()) as FirestoreDocument).fields ?? {};
    } else {
      return json({ error: 'Property not found' }, 404);
    }
    const bodyListingType = body?.listingType;
    if (bodyListingType === 'rent' || bodyListingType === 'sale') fields.listing_type = { stringValue: bodyListingType };
    const bodyRentPeriod = body?.rentPeriod;
    if (!fields.rent_period && typeof bodyRentPeriod === 'string') fields.rent_period = { stringValue: bodyRentPeriod };

    const appUrl = new URL(request.url).origin;
    const message = buildMessage(fields, propertyId, appUrl);
    const imageUrl = firstImageUrl(fields);
    const isRent = isRentListing(fields);
    const target = telegramTargetFor(isRent);
    const channelType = isRent ? 'rent' : 'sale';
    if (!target.botToken) return json({ error: 'Telegram is not configured', channel: channelType }, 503);
    const chatId = normalizeChatId(target.chatId);
    const errors: string[] = [];
    if (imageUrl && message.length <= TELEGRAM_CAPTION_LIMIT) {
      const photo = await sendTelegram(target.botToken, 'sendPhoto', { chat_id: chatId, photo: imageUrl, caption: message, parse_mode: 'HTML' });
      if (photo.ok) return json({ sent: true, method: 'sendPhoto', channel: channelType });
      if (photo.error) errors.push(photo.error);
    }
    const text = await sendTelegram(target.botToken, 'sendMessage', { chat_id: chatId, text: message, parse_mode: 'HTML', disable_web_page_preview: true });
    if (!text.ok) {
      if (text.error) errors.push(text.error);
      return json({ error: 'Telegram rejected the message', channel: channelType, chatId, details: errors }, 502);
    }
    return json({ sent: true, method: 'sendMessage', channel: channelType });
  } catch (err) {
    return json({ error: 'Notification service unavailable', details: String(err) }, 502);
  }
}
