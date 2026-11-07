export type Lang = 'ar' | 'en';
export type Furnishing = 'furnished' | 'unfurnished' | '';

const typeEn: Record<string, string> = {
  'الكل': 'All',
  'شقة': 'Apartment',
  'فيلا': 'Villa',
  'أرض': 'Land',
  'دور': 'Floor',
  'عمارة': 'Building',
  'محل': 'Shop',
  'مزرعة': 'Farm',
  'حوش': 'Yard',
  'ستوديو': 'Studio',
  'بيت': 'House',
  'أرض خام': 'Raw land',
  'أرض تجارية': 'Commercial land',
};

export function typeLabel(type: string, lang: Lang) {
  return lang === 'en' ? typeEn[type] ?? type : type;
}

export function categoryLabel(type: string, listing: 'sale' | 'rent', lang: Lang) {
  if (type === 'الكل') return lang === 'en' ? 'All' : 'الكل';
  if (lang === 'en') return `${typeLabel(type, lang)} for ${listing === 'sale' ? 'sale' : 'rent'}`;
  return `${type} ${listing === 'sale' ? 'للبيع' : 'للإيجار'}`;
}

export function furnishingLabel(value: Furnishing | undefined, lang: Lang) {
  if (value === 'furnished') return lang === 'en' ? 'Furnished' : 'مؤثثة';
  if (value === 'unfurnished') return lang === 'en' ? 'Unfurnished' : 'غير مؤثثة';
  return '';
}

export function storedLang(): Lang {
  try {
    return window.localStorage.getItem('lang') === 'en' ? 'en' : 'ar';
  } catch {
    return 'ar';
  }
}
