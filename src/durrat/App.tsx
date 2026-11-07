import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { auth, db, firebaseConfigReady, storage } from '@/durrat/lib/firebase';
import { browserSessionPersistence, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage';
import { CircleMarker, MapContainer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Building2, ChevronDown, ExternalLink, Eye, FilePenLine, LockKeyhole, MapPin, Menu, MessageCircle, Moon, Plus, Search, Sun, Trash2, X, Layers as Layers3, MapPinned, Navigation, Share2, Phone, ClipboardList, LayoutGrid, RefreshCw, Users, Mail, UserRound, Languages, Sofa } from 'lucide-react';
import { createPortal } from 'react-dom';
import { StaffManager } from '@/durrat/components/staff-manager';
import { OwnerInfo } from '@/durrat/components/owner-info';
import { formatListingLabel, formatPrice, type RentPeriod } from '@/durrat/lib/listing-format';
import { loadPropertyOwner, savePropertyOwner } from '@/durrat/lib/property-owner';
import { publisherPhone, whatsappUrl } from '@/durrat/lib/whatsapp';
import { shrinkDataUrl, watermarkImage } from '@/durrat/lib/watermark';
import { SAUDI_CITIES, SAUDI_DISTRICTS } from '@/durrat/lib/saudi-places';
import './index.css';
import { MapLayers } from '@/durrat/components/map-layers';
import { ProfilePanel } from '@/durrat/components/account';
import { categoryLabel, furnishingLabel, storedLang, typeLabel, type Furnishing, type Lang } from '@/durrat/lib/i18n';
import { ADMIN_EMAILS, isAdminEmail } from '@/durrat/lib/admin';

type Staff = { id: string; display_name: string; phone: string; email: string; role: 'employee' | 'super_admin'; active: boolean };
type Property = {
  id: string; created_by_staff_id: string | null; created_by_name: string; publisher_name?: string; publisher_phone?: string; publisher_email?: string; created_by_email?: string; contact_phone?: string;
  furnishing?: Furnishing;
  listing_type: 'sale' | 'rent'; rent_period?: RentPeriod; property_type: string; title: string; city: string; district: string;
  street: string; price: number; area: number; rooms: number; lounges: number; floors: number; kitchens: number;
  bathrooms: number; floor_number: number; has_roof: boolean; has_elevator: boolean; notes: string;
  latitude: number | null; longitude: number | null; images: string[]; published: boolean;
  created_at: string; serial_number?: number;
};
type FormState = Omit<Property, 'id' | 'created_by_staff_id' | 'created_by_name' | 'publisher_name' | 'publisher_phone' | 'publisher_email' | 'created_by_email' | 'contact_phone' | 'created_at'> & {
  images: string[]; owner_name: string; owner_phone: string; contact_email: string;
};

const officePhone = '0569996744';
const whatsappNumber = '0569996744';
/** Only a contact email the employee typed in is public; internal login emails never show. */
function publicEmail(value?: string) {
  const email = (value ?? '').trim();
  return email && !email.toLowerCase().endsWith('@durrat.internal') ? email : '';
}
const logo = '/images/image.png';
const allPropertyTypes = ['شقة', 'فيلا', 'أرض', 'دور', 'عمارة', 'محل', 'مزرعة', 'حوش', 'ستوديو', 'بيت', 'أرض خام', 'أرض تجارية'];
const saleCategories = ['الكل', 'عمارة', 'فيلا', 'أرض', 'شقة', 'محل', 'مزرعة', 'بيت', 'أرض خام', 'دور', 'ستوديو', 'حوش'];
const rentCategories = ['الكل', 'عمارة', 'فيلا', 'أرض تجارية', 'شقة', 'دور', 'محل', 'مزرعة', 'ستوديو'];
const licenseNumber = '1200007348';
const initialForm: FormState = {
  listing_type: 'sale', rent_period: 'annual', property_type: 'شقة', title: '', city: '', district: '', street: '', price: 0,
  area: 0, rooms: 0, lounges: 0, floors: 0, kitchens: 0, bathrooms: 0, floor_number: 0, has_roof: false,
  has_elevator: false, furnishing: '', notes: '', latitude: null, longitude: null, images: [], published: true,
  owner_name: '', owner_phone: '', contact_email: '',
};

function MapClickHandler({ onSelect }: { onSelect: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click: ({ latlng }) => onSelect(latlng.lat, latlng.lng) });
  return null;
}

function OfficeMap({ lang }: { lang: Lang }) {
  return (
    <MapContainer center={[24.4714, 39.6122]} zoom={13} scrollWheelZoom className="leaflet-map">
      <MapLayers lang={lang} />
      <CircleMarker center={[24.4714, 39.6122]} radius={10} pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.9 }} />
    </MapContainer>
  );
}

function LocationPicker({ latitude, longitude, onSelect, lang }: { latitude: number | null; longitude: number | null; onSelect: (latitude: number, longitude: number) => void; lang: Lang }) {
  const position: [number, number] = latitude !== null && longitude !== null ? [latitude, longitude] : [24.4714, 39.6122];
  return (
    <div className="location-map">
      <MapContainer center={position} zoom={latitude !== null ? 15 : 11} scrollWheelZoom className="leaflet-map">
        <MapLayers lang={lang} />
        <MapClickHandler onSelect={onSelect} />
        {latitude !== null && longitude !== null && <CircleMarker center={position} radius={10} pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.9 }} />}
      </MapContainer>
    </div>
  );
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions);
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    } else {
      map.setView([24.4714, 39.6122], 11);
    }
  }, [map, positions]);
  return null;
}

function FloatingMap({ properties, onSelect, lang }: { properties: Property[]; onSelect: (property: Property) => void; lang: Lang }) {
  const en = lang === 'en';
  const mapped = properties.filter((p) => p.latitude !== null && p.longitude !== null);
  const positions = mapped.map((p) => [p.latitude!, p.longitude!] as [number, number]);
  const center: [number, number] = positions.length > 0 ? positions[0]! : [24.4714, 39.6122];
  const createPin = (serial: number | undefined) => L.divIcon({
    className: 'custom-pin',
    html: `<div class="pin-inner">${serial ?? '•'}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -26],
  });
  return (
    <div className="floating-map-wrapper">
      <div className="floating-map-header">
        <span className="eyebrow">{en ? 'Property map' : 'خريطة العقارات'}</span>
        <h3>{en ? 'Property locations on the map' : 'مواقع العقارات على الخريطة'}</h3>
        <small>{mapped.length} {en ? 'mapped' : 'عقار موقع'}</small>
      </div>
      <MapContainer center={center} zoom={12} scrollWheelZoom className="floating-map">
        <MapLayers lang={lang} />
        {mapped.map((property) => (
          <Marker key={property.id} position={[property.latitude!, property.longitude!]} icon={createPin(property.serial_number)}>
            <Popup>
              <div className="map-popup">
                <span className="serial-badge">#{property.serial_number ?? '—'}</span>
                <strong>{property.title}</strong>
                <em className="card-price">{formatPrice(property.price, property.listing_type, property.rent_period, lang)}</em>
                <small><MapPin size={11} /> {property.city} — {property.district}</small>
                <button className="primary-button small" onClick={() => onSelect(property)}>{en ? 'View details' : 'عرض التفاصيل'}</button>
              </div>
            </Popup>
          </Marker>
        ))}
        <FitBounds positions={positions} />
      </MapContainer>
    </div>
  );
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), milliseconds);
    promise.then((value) => { window.clearTimeout(timer); resolve(value); }).catch((error: unknown) => { window.clearTimeout(timer); reject(error); });
  });
}

const ADMIN_PHONE = '0539000650';

/** Staff sign in with mobile + password; the internal email is derived silently. */
function loginEmail(identifier: string) {
  const value = identifier.trim().toLowerCase();
  if (value.includes('@')) return value;
  const digits = value.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g, '');
  return `${digits}@durrat.internal`;
}

async function loadStaff(user: User): Promise<Staff | null> {
  const employeeRef = doc(db, 'employees', user.uid);
  let employeeSnapshot = await getDoc(employeeRef);
  // The admin account gets its staff record created automatically on first login.
  if (!employeeSnapshot.exists() && isAdminEmail(user.email)) {
    await setDoc(employeeRef, {
      displayName: user.displayName || 'الإدارة', email: String(user.email).toLowerCase(), phone: '',
      role: 'super_admin', active: true, created_at: new Date().toISOString(),
    });
    employeeSnapshot = await getDoc(employeeRef);
  }
  const employee = employeeSnapshot.data();
  if (!employeeSnapshot.exists() || employee?.active !== true || !['employee', 'super_admin'].includes(employee?.role)) return null;
  return {
    id: user.uid,
    display_name: String(employee.displayName ?? ''),
    phone: String(employee.phone ?? ''),
    email: String(employee.email ?? user.email ?? '').toLowerCase(),
    role: employee.role === 'super_admin' || isAdminEmail(user.email) ? 'super_admin' : 'employee',
    active: true,
  };
}

function loginErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';

  if (code === 'auth/api-key-not-valid' || code === 'auth/invalid-api-key') {
    return 'إعداد Firebase غير صحيح. راجع VITE_FIREBASE_API_KEY في إعدادات النشر ثم أعد البناء.';
  }
  if (code === 'auth/network-request-failed') {
    return 'تعذر الاتصال بـ Firebase. تحقق من الاتصال بالإنترنت وإعدادات النطاقات المسموح بها.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'تسجيل الدخول بالبريد وكلمة المرور غير مفعّل في Firebase Authentication.';
  }
  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return 'تم تسجيل الدخول، لكن تعذر قراءة صلاحية الموظف. راجع قواعد Firestore المنشورة.';
  }
  if (code === 'auth/too-many-requests') {
    return 'تم إيقاف المحاولات مؤقتاً لكثرتها. انتظر قليلاً ثم حاول مجدداً.';
  }
  return 'بيانات الدخول غير صحيحة أو تعذر التحقق من الحساب. تحقق من الرقم وكلمة المرور وإعدادات Firebase.';
}

async function sendTelegramNotification(propertyId: string, listingType: 'sale' | 'rent', rentPeriod?: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('Employee session is unavailable');
  const idToken = await user.getIdToken();
  const response = await fetch('/api/public/telegram-notify', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ propertyId, listingType, rentPeriod }),
  });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    console.error('[telegram] /api/telegram-notify failed', { status: response.status, ...result });
    const details = Array.isArray(result.details) ? result.details.join(' | ') : String(result.details ?? result.error ?? '');
    const channel = result.channel === 'rent' ? 'الإيجار' : result.channel === 'sale' ? 'البيع' : '';
    throw new Error(`[${response.status}]${channel ? ` قناة ${channel}` : ''}${result.chatId ? ` (${String(result.chatId)})` : ''}: ${details || 'لا يوجد رد من الخادم'}`);
  }
  console.info('[telegram] notification sent', result);
}

async function uploadWatermarkedImages(propertyId: string, images: string[]): Promise<string[]> {
  return Promise.all(images.map(async (image, index) => {
    if (!image.startsWith('data:')) return image;
    try {
      const imageRef = storageRef(storage, `properties/${propertyId}/image-${index}.jpg`);
      return await withTimeout((async () => {
        await uploadString(imageRef, image, 'data_url', { contentType: 'image/jpeg' });
        return getDownloadURL(imageRef);
      })(), 30000);
    } catch {
      return shrinkDataUrl(image);
    }
  }));
}

function App() {
  const [dark, setDark] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '' });
  const [rentFilter, setRentFilter] = useState<'all' | RentPeriod>('all');
  const [staff, setStaff] = useState<Staff | null>(null);
  const [modal, setModal] = useState<'login' | 'profile' | 'form' | 'details' | 'staff' | null>(null);
  const [lang, setLang] = useState<Lang>('ar');
  const en = lang === 'en';
  const t = (ar: string, english: string) => (en ? english : ar);
  useEffect(() => { setLang(storedLang()); }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = en ? 'ltr' : 'rtl';
    try { window.localStorage.setItem('lang', lang); } catch { /* ignore */ }
  }, [lang, en]);
  const [selected, setSelected] = useState<Property | null>(null);
  const [loginMessage, setLoginMessage] = useState('');
  const [helpVisible, setHelpVisible] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'sale' | 'rent'>('rent');
  const [selectedType, setSelectedType] = useState('الكل');
  const [form, setForm] = useState<FormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const isAdmin = Boolean(staff && staff.active && (staff.role === 'super_admin' || isAdminEmail(staff.email)));
  const canManage = (property: Property) => Boolean(staff) && (isAdmin
    || property.created_by_staff_id === staff?.id
    || (Boolean(property.created_by_email) && property.created_by_email === staff?.email));

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void setPersistence(auth, browserSessionPersistence).then(() => {
      if (!active) return;
      unsubscribe = onAuthStateChanged(auth, async (user) => {
        if (!user) {
          setStaff(null);
          return;
        }
        try {
          const loaded = await loadStaff(user);
          if (!loaded) { await signOut(auth); setStaff(null); } else setStaff(loaded);
        } catch {
          setStaff(null);
          setNotice('تعذر التحقق من صلاحيات الموظف.');
        }
      });
    }).catch(() => {
      setNotice('تعذر تهيئة جلسة الدخول.');
    });
    return () => { active = false; unsubscribe?.(); };
  }, []);

  useEffect(() => {
    const propertyCollection = collection(db, 'properties');
    const propertiesQuery = staff
      ? query(propertyCollection, orderBy('created_at', 'desc'))
      : query(propertyCollection, where('published', '==', true));
    return onSnapshot(propertiesQuery, (snapshot) => {
      const loaded = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Property)
        .filter((property) => property.published || Boolean(staff))
        .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
      const sorted = [...loaded].sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
      const existingMax = Math.max(0, ...loaded.map((p) => p.serial_number ?? 0));
      let nextSerial = existingMax;
      sorted.forEach((property) => {
        if (property.serial_number == null) {
          nextSerial += 1;
          property.serial_number = nextSerial;
          void updateDoc(doc(db, 'properties', property.id), { serial_number: nextSerial }).catch(() => undefined);
        }
      });
      setProperties(loaded);
      setLoading(false);
    }, () => setLoading(false));
  }, [staff]);

  useEffect(() => {
    const propertyId = new URLSearchParams(window.location.search).get('property');
    const property = propertyId ? properties.find((item) => item.id === propertyId) : null;
    if (property && !selected) { setSelected(property); setModal('details'); }
  }, [properties, selected]);

  const cities = useMemo(() => [...new Set([...properties.map((property) => property.city).filter(Boolean), ...SAUDI_CITIES])], [properties]);
  const districts = useMemo(() => [...new Set([...properties.map((property) => property.district).filter(Boolean), ...SAUDI_DISTRICTS])], [properties]);
  const visibleProperties = useMemo(() => properties.filter((property) => {
    const search = filters.search.trim().toLowerCase();
    const matchesSearch = !search || [property.title, property.city, property.district, property.street].some((value) => value.toLowerCase().includes(search));
    const matchesListing = property.listing_type === activeTab;
    const matchesType = selectedType === 'الكل' || property.property_type === selectedType;
    const matchesRent = activeTab !== 'rent' || rentFilter === 'all' || (property.rent_period ?? 'annual') === rentFilter;
    return matchesSearch && matchesListing && matchesType && matchesRent;
  }), [properties, filters, activeTab, selectedType, rentFilter]);

  const updateForm = (key: keyof FormState, value: string | number | boolean | null | string[]) => setForm((current) => ({ ...current, [key]: value }));
  const scrollToListings = () => document.getElementById('listings')?.scrollIntoView({ behavior: 'smooth' });
  const openNewForm = () => { setForm(initialForm); setSelected(null); setModal('form'); };
  const openEditForm = (property: Property) => {
    setForm({
      listing_type: property.listing_type, rent_period: property.rent_period ?? 'annual', property_type: property.property_type, title: property.title,
      city: property.city, district: property.district, street: property.street, price: property.price,
      area: property.area ?? 0, rooms: property.rooms, lounges: property.lounges, floors: property.floors, kitchens: property.kitchens,
      bathrooms: property.bathrooms, floor_number: property.floor_number, has_roof: property.has_roof,
      has_elevator: property.has_elevator, furnishing: property.furnishing ?? '', notes: property.notes, latitude: property.latitude,
      longitude: property.longitude, images: property.images, published: property.published,
      owner_name: '', owner_phone: '', contact_email: publicEmail(property.publisher_email),
    });
    setSelected(property);
    setModal('form');
    void loadPropertyOwner(property.id)
      .then((owner) => { if (owner) setForm((current) => ({ ...current, ...owner })); })
      .catch(() => setNotice('تعذر تحميل بيانات المالك. أدخلها من جديد قبل الحفظ.'));
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const loginForm = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const identifier = String(formData.get('phone') ?? '');
    const password = String(formData.get('password') ?? '');
    try {
      if (!firebaseConfigReady) {
        setLoginMessage('إعداد Firebase غير مكتمل: أضف VITE_FIREBASE_API_KEY في .env محلياً أو إعدادات Vercel ثم أعد البناء.');
        return;
      }
      await setPersistence(auth, browserSessionPersistence);
      const credential = await signInWithEmailAndPassword(auth, loginEmail(identifier), password);
      const loaded = await loadStaff(credential.user);
      if (!loaded) {
        await signOut(auth);
        setLoginMessage(t('الحساب غير مفعّل كموظف. تواصل مع الإدارة.', 'This account is not an active employee. Contact the administrator.'));
        return;
      }
      setStaff(loaded);
      setLoginMessage('');
      setModal(null);
      loginForm.reset();
    } catch (error) {
      setLoginMessage(loginErrorMessage(error));
    } finally {
      const passwordInput = loginForm.elements.namedItem('password') as HTMLInputElement | null;
      if (passwordInput) passwordInput.value = '';
    }
  };

  const handleLogout = () => {
    void signOut(auth);
    setStaff(null);
    setModal(null);
    setNotice(t('تم تسجيل الخروج بنجاح.', 'Signed out.'));
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    try {
      const images: string[] = [];
      for (const file of Array.from(files).slice(0, Math.max(0, 6 - form.images.length))) images.push(await watermarkImage(file));
      updateForm('images', [...form.images, ...images].slice(0, 6));
    } catch { setNotice('تعذر معالجة إحدى الصور. يرجى المحاولة مرة أخرى.'); }
  };

  const selectLocation = async (latitude: number, longitude: number) => {
    updateForm('latitude', latitude); updateForm('longitude', longitude);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&accept-language=ar`);
      const result = await response.json() as { address?: { city?: string; town?: string; village?: string; suburb?: string; neighbourhood?: string; road?: string } };
      const address = result.address ?? {};
      updateForm('city', address.city ?? address.town ?? address.village ?? '');
      updateForm('district', address.suburb ?? address.neighbourhood ?? ''); updateForm('street', address.road ?? '');
      setNotice('تم تحديد الدبوس واستخراج العنوان.');
    } catch { setNotice('تم تحديد الدبوس، تعذر استخراج اسم العنوان.'); }
  };

  const saveProperty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!staff || saving) return;
    if (selected && !canManage(selected)) { setNotice(t('لا تملك صلاحية تعديل هذا الإعلان.', 'You cannot edit this listing.')); return; }
    setSaving(true); setNotice('');
    try {
      const { owner_name, owner_phone, contact_email, ...propertyFields } = form;
      const contactEmail = contact_email.trim();
      if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) { setNotice(t('بريد التواصل غير صالح.', 'Invalid contact email.')); setSaving(false); return; }
      const propertyRef = selected ? doc(db, 'properties', selected.id) : doc(collection(db, 'properties'));
      const imageUrls = await uploadWatermarkedImages(propertyRef.id, form.images);
      const isEditing = Boolean(selected);
      const serialNumber = selected?.serial_number ?? (properties.length > 0 ? Math.max(...properties.map((p) => p.serial_number ?? 0)) + 1 : 1);
      const creatorId = selected?.created_by_staff_id ?? staff.id;
      const payload = {
        ...propertyFields,
        created_by_email: selected ? (selected.created_by_email ?? '') : staff.email,
        publisher_email: contactEmail,
        images: imageUrls,
        serial_number: serialNumber,
        created_by_staff_id: creatorId,
        created_by_name: selected?.created_by_name ?? staff.display_name,
        publisher_name: selected ? (selected.publisher_name || selected.created_by_name) : staff.display_name,
        publisher_phone: selected ? (selected.publisher_phone || selected.contact_phone || '') : staff.phone,
        created_at: selected?.created_at ?? new Date().toISOString(),
      };
      await setDoc(propertyRef, payload);
      await savePropertyOwner(propertyRef.id, creatorId, { owner_name: owner_name.trim(), owner_phone: owner_phone.trim() });
      let saveMessage = isEditing ? 'تم تحديث العقار بنجاح.' : 'تم حفظ العقار بنجاح.';
      if (!isEditing) {
        try {
          await sendTelegramNotification(propertyRef.id, payload.listing_type, payload.rent_period);
        } catch (telegramError) {
          const reason = telegramError instanceof Error ? telegramError.message : String(telegramError);
          console.warn('[telegram]', reason);
          saveMessage = 'تم حفظ العقار بنجاح. (تعذر إرسال إشعار تيليجرام حالياً)';
        }
      }
      setNotice(saveMessage);
      setSaving(false); setModal(null); setSelected(null);
    } catch {
      setNotice('تعذر حفظ العقار. تحقق من البيانات وحاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  };

  const deleteProperty = async (property: Property) => {
    if (!staff || !canManage(property) || !window.confirm(t('هل تريد حذف هذا العقار؟', 'Delete this property?'))) return;
    try {
      await deleteDoc(doc(db, 'properties', property.id));
      await deleteDoc(doc(db, 'property_owners', property.id)).catch(() => undefined);
      setNotice('تم حذف العقار من الموقع.');
    } catch {
      setNotice('تعذر حذف العقار.');
    }
  };

  const officeMapUrl = 'https://goo.gl/maps/hP8rVmqhAiBm2XRcA';
  const interestText = (property: Property) => t(
    `السلام عليكم ورحمة الله وبركاته، أنا مهتم بالإعلان رقم ${property.serial_number ?? ''}`,
    `Hello, I'm interested in listing #${property.serial_number ?? ''}`,
  );
  const goTab = (tab: 'sale' | 'rent') => { setActiveTab(tab); setSelectedType('الكل'); scrollToListings(); };
  const openLogin = () => { setLoginMessage(''); setModal('login'); };
  const numberFormat = new Intl.NumberFormat(en ? 'en-US' : 'ar-SA');
  const langButton = <button className="icon-button lang-button" onClick={() => setLang(en ? 'ar' : 'en')} aria-label={t('تغيير اللغة', 'Change language')}><Languages size={16} /><span>{en ? 'عربي' : 'English'}</span></button>;

  return (
    <div dir={en ? 'ltr' : 'rtl'} className={dark ? 'app dark' : 'app light'}>
      <header className="site-header">
        <div className="header-inner">
          <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label={t('الرئيسية', 'Home')}><img src={logo} alt={t('درة الهجرة للعقارات', 'Durrat Al-Hijrah Real Estate')} /><span>{t('درة الهجرة للعقارات', 'Durrat Al-Hijrah Real Estate')}</span></button>
          <nav className="desktop-nav"><button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>{t('الرئيسية', 'Home')}</button><button onClick={() => goTab('rent')}>{t('عقارات للإيجار', 'For rent')}</button><button onClick={() => goTab('sale')}>{t('عقارات للبيع', 'For sale')}</button><a href={officeMapUrl} target="_blank" rel="noreferrer">{t('موقع المكتب', 'Office location')} <ExternalLink size={14} /></a>{staff && <button onClick={() => setModal('profile')}><UserRound size={14} /> {t('حسابي', 'My account')}</button>}</nav>
          <div className="header-actions">{langButton}<button className="icon-button" onClick={() => setDark((value) => !value)} aria-label={t('تبديل الوضع', 'Toggle theme')}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button><button className="mobile-menu icon-button" aria-label={t('القائمة', 'Menu')} aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen((value) => !value)}><Menu size={20} /></button></div>
        </div>
      </header>

      {mobileNavOpen && createPortal(<div className="mobile-nav-overlay" dir={en ? 'ltr' : 'rtl'} onClick={() => setMobileNavOpen(false)}><nav className="mobile-nav" onClick={(event) => event.stopPropagation()}><button onClick={() => { setMobileNavOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{t('الرئيسية', 'Home')}</button><button onClick={() => { setMobileNavOpen(false); goTab('rent'); }}>{t('عقارات للإيجار', 'For rent')}</button><button onClick={() => { setMobileNavOpen(false); goTab('sale'); }}>{t('عقارات للبيع', 'For sale')}</button><a href={officeMapUrl} target="_blank" rel="noreferrer" onClick={() => setMobileNavOpen(false)}>{t('موقع المكتب', 'Office location')} <ExternalLink size={14} /></a>{staff && <button onClick={() => { setMobileNavOpen(false); setModal('profile'); }}><UserRound size={14} /> {t('حسابي', 'My account')}</button>}{staff ? <button onClick={() => { setMobileNavOpen(false); handleLogout(); }}><LockKeyhole size={14} /> {t('تسجيل الخروج', 'Sign out')}</button> : <button onClick={() => { setMobileNavOpen(false); openLogin(); }}><LockKeyhole size={14} /> {t('دخول الموظفين', 'Staff login')}</button>}</nav></div>, document.body)}

      <main className="dashboard-main">
        <section className="dashboard-hero">
          <div className="dashboard-heading"><span className="eyebrow">{t('منصة درة الهجرة', 'Durrat Al-Hijrah platform')}</span><h1>{t('عروضي العقارية', 'Our property listings')}</h1><p>{t('كل عروضك العقارية في مكان واحد، بوضوح وسهولة.', 'All your property listings in one place, clear and simple.')}</p></div>
          <a className="office-location" href={officeMapUrl} target="_blank" rel="noreferrer"><MapPin size={18} /><span>{t('موقع', 'Office')}<br /><b>{t('المكتب', 'location')}</b></span></a>
          <div className="work-hours-note"><Phone size={15} /><span>{t('يمكنكم الاتصال بنا في أوقات العمل الرسمية', 'Call us during official working hours')}<br /><b>{t('9ص-12م، العصر-12ص', '9am–12pm, Asr–12am')}</b></span></div><div className="stats-grid"><div className="stat-card"><span className="stat-icon"><LayoutGrid size={17} /></span><strong>{properties.length}</strong><small>{t('إجمالي العروض', 'Total listings')}</small></div><div className="stat-card"><span className="stat-icon"><MapPin size={17} /></span><strong>{properties.filter((property) => property.latitude !== null).length}</strong><small>{t('على الخريطة', 'On the map')}</small></div><div className="stat-card work-hours-card"><span className="stat-icon"><Phone size={17} /></span><strong>{t('ساعات العمل', 'Working hours')}</strong><small>{t('9ص-12م · العصر-12ص', '9am–12pm · Asr–12am')}</small></div></div>
          <div className="contact-cards"><a className="whatsapp-banner" href={whatsappUrl(whatsappNumber)} target="_blank" rel="noreferrer"><span className="contact-symbol"><MessageCircle size={31} /></span><span><small>{t('التواصل عبر الواتساب', 'Contact us on WhatsApp')}</small><b>{whatsappNumber}</b></span><ChevronDown size={24} className="contact-arrow" /></a><div className="license-banner"><span className="license-symbol"><ClipboardList size={30} /></span><span><small>{t('رقم الرخصة العقارية', 'Real estate license no.')}</small><b>{licenseNumber}</b></span></div></div>
          <div className="dashboard-footer"><span>{t('تواصل معنا لإضافة العروض والطلبات', 'Contact us to add listings and requests')}</span><span>{t('آخر تحديث', 'Last updated')}: {new Intl.DateTimeFormat(en ? 'en-GB' : 'ar-SA', { dateStyle: 'medium' }).format(new Date())}</span></div>
        </section>

        <section className="view-tabs listing-type-tabs" id="listings"><button className={activeTab === 'rent' ? 'active' : ''} onClick={() => { setActiveTab('rent'); setSelectedType('الكل'); }}>{t('عقارات للإيجار', 'For rent')} <b>{properties.filter((property) => property.listing_type === 'rent').length}</b></button><button className={activeTab === 'sale' ? 'active' : ''} onClick={() => { setActiveTab('sale'); setSelectedType('الكل'); }}>{t('عقارات للبيع', 'For sale')} <b>{properties.filter((property) => property.listing_type === 'sale').length}</b></button></section>

        <section className="category-chips-bar"><div className="chips-track">{(activeTab === 'sale' ? saleCategories : rentCategories).map((type) => { const count = type === 'الكل' ? properties.filter((p) => p.listing_type === activeTab).length : properties.filter((p) => p.listing_type === activeTab && p.property_type === type).length; const isActive = selectedType === type; return <button key={type} className={`chip ${isActive ? 'active' : ''} ${count === 0 && type !== 'الكل' ? 'empty' : ''}`} onClick={() => setSelectedType(type)}><span className="chip-label">{categoryLabel(type, activeTab, lang)}</span>{count > 0 && <span className="chip-count">{count}</span>}{count === 0 && type !== 'الكل' && <span className="chip-empty-dot" />}</button>; })}</div></section>

        <section className="filter-panel"><div className="filter-row"><label className="filter-search"><Search size={16} /><input value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} placeholder={t('ابحث باسم العقار أو المدينة أو الحي', 'Search by title, city or district')} /></label><select value={filters.search && cities.includes(filters.search) ? filters.search : ''} onChange={(event) => setFilters({ ...filters, search: event.target.value })}><option value="">{t('المدينة', 'City')}</option>{cities.map((city) => <option key={city}>{city}</option>)}</select><select value={filters.search && districts.includes(filters.search) ? filters.search : ''} onChange={(event) => setFilters({ ...filters, search: event.target.value })}><option value="">{t('الحي', 'District')}</option>{districts.map((district) => <option key={district}>{district}</option>)}</select></div>{activeTab === 'rent' && <div className="filter-row rent-filter-row">{([['all', t('كل الإيجارات', 'All rentals')], ['monthly', t('شهري', 'Monthly')], ['annual', t('سنوي', 'Yearly')], ['two_installments', t('دفعتين', '2 installments')]] as const).map(([value, label]) => <button type="button" key={value} className={rentFilter === value ? 'rent-chip active' : 'rent-chip'} onClick={() => setRentFilter(value)}>{label}</button>)}</div>}</section>

        <FloatingMap lang={lang} properties={visibleProperties} onSelect={(property) => { setSelected(property); setModal('details'); }} />

        <section className="listings-section listing-results"><div className="section-top"><div><span className="eyebrow">{t('مكتبة العروض', 'Listings library')}</span><h2>{t('العروض العقارية', 'Property listings')}</h2></div><div className="section-actions">{isAdmin && <button className="outline-button" onClick={() => setModal('staff')}><Users size={15} /> {t('إدارة الموظفين', 'Manage staff')}</button>}{staff && <button className="primary-button small" onClick={openNewForm}><Plus size={17} /> {t('إضافة عقار', 'Add property')}</button>}</div></div><div className="results-meta"><span>{visibleProperties.length} {t('عرض متاح', 'listings')}</span><button className="refresh-button" onClick={() => window.location.reload()}><RefreshCw size={14} /> {t('تحديث', 'Refresh')}</button></div>
          {loading ? <div className="empty-state"><span className="loader" /> {t('جاري تحميل العقارات', 'Loading properties')}</div> : visibleProperties.length === 0 ? <div className="empty-state"><Building2 size={38} /><p>{t('لا توجد عقارات مطابقة للبحث', 'No properties match your search')}</p><small>{t('جرّب تغيير خيارات البحث أو التصنيف.', 'Try changing the search or category.')}</small></div> : <div className="property-grid">{visibleProperties.map((property) => <article className="property-card" key={property.id}><div className="card-topline"><span className="serial-badge">#{property.serial_number ?? '—'}</span><span className={`listing-badge ${property.listing_type}`}>{formatListingLabel(property.listing_type, property.rent_period, lang)}</span></div><button className="card-image" onClick={() => { setSelected(property); setModal('details'); }}><img src={property.images[0] || logo} alt={property.title} /><span className="view-icon"><Eye size={17} /></span></button><div className="card-body"><h3>{property.title}</h3><div className="card-location"><MapPin size={14} /> {typeLabel(property.property_type, lang)} · {property.city} — {property.district}{property.street && ` — ${property.street}`}</div><p className="card-description">{property.notes || t(`عرض عقاري مميز في ${property.city || 'موقع مميز'}، تواصل معنا لمعرفة التفاصيل.`, `A great property in ${property.city || 'a prime location'}. Contact us for details.`)}</p><strong className="card-price">{formatPrice(property.price, property.listing_type, property.rent_period, lang)}</strong>{property.area > 0 && <span className="card-area"><Layers3 size={13} /> {numberFormat.format(property.area)} {t('م²', 'm²')}</span>}{property.furnishing && <span className="card-area"><Sofa size={13} /> {furnishingLabel(property.furnishing, lang)}</span>}<div className="card-actions"><a className="location-action" href={property.latitude && property.longitude ? `https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}` : officeMapUrl} target="_blank" rel="noreferrer"><Navigation size={15} /> {t('الموقع', 'Location')}</a><a className="whatsapp-action" href={whatsappUrl(publisherPhone(property), interestText(property))} target="_blank" rel="noreferrer"><MessageCircle size={15} /> WhatsApp</a><button className="share-action" onClick={() => { void navigator.share?.({ title: property.title, text: property.title, url: `${window.location.origin}/?property=${property.id}` }); }}><Share2 size={15} /> {t('مشاركة', 'Share')}</button></div><div className="card-owner">{t('بواسطة', 'By')} {property.publisher_name || property.created_by_name}{publicEmail(property.publisher_email) && <> · <a href={`mailto:${publicEmail(property.publisher_email)}`} dir="ltr">{publicEmail(property.publisher_email)}</a></>}</div>{canManage(property) && <div className="owner-actions"><button onClick={() => openEditForm(property)}><FilePenLine size={14} /> {t('تعديل', 'Edit')}</button><button onClick={() => void deleteProperty(property)}><Trash2 size={14} /> {t('حذف', 'Delete')}</button></div>}</div></article>)}</div>}
        </section>

        <section className="office-section"><div className="office-copy"><span className="eyebrow">{t('موقع المكتب', 'Office location')}</span><h2>{t('درة الهجرة للعقارات', 'Durrat Al-Hijrah Real Estate')}</h2><p>{t('الجوال متاح يومياً من 9:00 صباحاً إلى 12:00 ظهراً، ومن صلاة العصر حتى 12:00 ليلاً.', 'Phone available daily 9:00am–12:00pm, and from Asr prayer until midnight.')}</p><p>{t('موقع المكتب متاح خلال ساعات التواصل المذكورة أعلاه.', 'The office is open during the hours above.')}</p><a className="outline-button" href={officeMapUrl} target="_blank" rel="noreferrer"><MapPin size={17} /> {t('فتح الموقع في قوقل ماب', 'Open in Google Maps')}</a></div><div className="map-frame"><OfficeMap lang={lang} /></div></section>
      </main>

      <footer className="site-footer"><div className="footer-inner"><div className="footer-brand"><img src={logo} alt="" /><span>{t('مكتب درة الهجرة للعقارات', 'Durrat Al-Hijrah Real Estate Office')}</span></div><div className="footer-contact"><a href={`tel:${officePhone}`}><MessageCircle size={17} /> {officePhone}</a><a href={officeMapUrl} target="_blank" rel="noreferrer"><MapPin size={17} /> {t('موقع المكتب', 'Office location')}</a></div><button className="staff-link" onClick={() => staff ? handleLogout() : openLogin()}><LockKeyhole size={12} /> {staff ? t('تسجيل الخروج', 'Sign out') : t('دخول الموظفين', 'Staff login')}</button></div><div className="copyright">© {new Date().getFullYear()} {t('درة الهجرة للعقارات', 'Durrat Al-Hijrah Real Estate')}</div></footer>
      {helpVisible && <div className="help-bubble"><button onClick={() => setHelpVisible(false)} aria-label={t('إغلاق', 'Close')}><X size={15} /></button><span>{t('تحتاج مساعدة؟ تواصل معنا', 'Need help? Contact us')}</span></div>}<a className="floating-whatsapp" href={whatsappUrl(whatsappNumber)} target="_blank" rel="noreferrer" aria-label="WhatsApp"><MessageCircle size={24} /></a>{notice && <div className="toast" role="status">{notice}</div>}

      {modal && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}><div className={`modal ${modal === 'form' || modal === 'staff' ? 'wide-modal' : ''}`}>
        <button className="modal-close" onClick={() => setModal(null)} aria-label={t('إغلاق', 'Close')}><X size={19} /></button>
        {modal === 'login' && <div className="login-modal"><div className="modal-icon"><LockKeyhole size={22} /></div><span className="eyebrow">{t('بوابة المكتب', 'Office portal')}</span>
          <><p>{t('سجّل الدخول برقم الجوال وكلمة المرور.', 'Sign in with your mobile number and password.')}</p><form onSubmit={handleLogin}><label>{t('رقم الجوال', 'Mobile number')}<input name="phone" type="tel" inputMode="tel" autoComplete="tel" required dir="ltr" placeholder="05xxxxxxxx" /></label><label>{t('كلمة المرور', 'Password')}<input name="password" type="password" required /></label>{loginMessage && <div className="form-error">{loginMessage}</div>}<button className="primary-button submit-button">{t('دخول', 'Sign in')} <ChevronDown size={18} /></button></form></>
        </div>}
        {modal === 'profile' && staff && <ProfilePanel lang={lang} staffId={staff.id} displayName={staff.display_name} onNameChange={(name) => setStaff({ ...staff, display_name: name })} />}
        {modal === 'staff' && isAdmin && staff && <StaffManager currentStaffId={staff.id} />}
        {modal === 'details' && selected && <div className="details-modal"><div className="details-image"><img src={selected.images[0] || logo} alt={selected.title} /></div><span className={`listing-badge ${selected.listing_type}`}>{formatListingLabel(selected.listing_type, selected.rent_period, lang)}</span><span className="serial-badge">#{selected.serial_number ?? '—'}</span><div className="card-location"><MapPin size={14} /> {typeLabel(selected.property_type, lang)} · {selected.city} — {selected.district} {selected.street && `— ${selected.street}`}</div><h2>{selected.title}</h2><strong className="detail-price">{formatPrice(selected.price, selected.listing_type, selected.rent_period, lang)}</strong>{selected.area > 0 && <div className="detail-area"><Layers3 size={15} /> {t('المساحة', 'Area')}: {numberFormat.format(selected.area)} {t('م²', 'm²')}</div>}{selected.furnishing && <div className="detail-area"><Sofa size={15} /> {t('حالة التأثيث', 'Furnishing')}: {furnishingLabel(selected.furnishing, lang)}</div>}{selected.property_type === 'شقة' && <div className="detail-grid"><span>{t('عدد الغرف', 'Bedrooms')} <b>{selected.rooms}</b></span><span>{t('الحمامات', 'Bathrooms')} <b>{selected.bathrooms}</b></span><span>{t('الصالات', 'Living rooms')} <b>{selected.lounges}</b></span><span>{t('المطابخ', 'Kitchens')} <b>{selected.kitchens}</b></span><span>{t('الدور', 'Floor')} <b>{selected.floor_number}</b></span><span>{t('عدد الأدوار', 'Floors')} <b>{selected.floors}</b></span><span>{t('مصعد', 'Elevator')} <b>{selected.has_elevator ? t('نعم', 'Yes') : t('لا', 'No')}</b></span><span>{t('سطح', 'Roof')} <b>{selected.has_roof ? t('نعم', 'Yes') : t('لا', 'No')}</b></span></div>}{selected.notes && <p className="notes">{selected.notes}</p>}
          <div className="advertiser-card"><span className="eyebrow">{t('المعلن', 'Listed by')}</span><div className="advertiser-name"><UserRound size={18} /><strong>{selected.publisher_name || selected.created_by_name || t('درة الهجرة', 'Durrat Al-Hijrah')}</strong></div><a href={`tel:${publisherPhone(selected)}`} dir="ltr"><Phone size={14} /> {publisherPhone(selected)}</a><a href={whatsappUrl(publisherPhone(selected), interestText(selected))} target="_blank" rel="noreferrer" dir="ltr"><MessageCircle size={14} /> WhatsApp</a>{publicEmail(selected.publisher_email) && <a href={`mailto:${publicEmail(selected.publisher_email)}`} dir="ltr"><Mail size={14} /> {publicEmail(selected.publisher_email)}</a>}</div>
          {staff && <OwnerInfo propertyId={selected.id} />}<a className="primary-button submit-button" href={whatsappUrl(publisherPhone(selected), interestText(selected))} target="_blank" rel="noreferrer"><MessageCircle size={18} /> {t('تواصل عبر واتساب', 'Contact on WhatsApp')}</a></div>}
        {modal === 'form' && <form className="property-form" onSubmit={(event) => void saveProperty(event)}><div className="form-heading"><div><span className="eyebrow">{t('إدارة العروض', 'Listing management')}</span><h2>{selected ? t('تعديل العقار', 'Edit property') : t('إضافة عقار جديد', 'Add new property')}</h2></div><span className="secure-note"><LockKeyhole size={14} /> {staff?.display_name}</span></div><div className="form-grid"><label className="full">{t('عنوان العقار', 'Title')}<input required value={form.title} onChange={(event) => updateForm('title', event.target.value)} placeholder={t('مثال: فيلا عائلية بحي النخيل', 'e.g. Family villa in Al-Nakheel')} /></label><label>{t('نوع العرض', 'Listing type')}<select value={form.listing_type} onChange={(event) => updateForm('listing_type', event.target.value)}><option value="sale">{t('بيع', 'Sale')}</option><option value="rent">{t('إيجار', 'Rent')}</option></select></label>{form.listing_type === 'rent' && <label>{t('مدة الإيجار', 'Rent period')}<select value={form.rent_period ?? 'annual'} onChange={(event) => updateForm('rent_period', event.target.value as RentPeriod)}><option value="monthly">{t('شهري', 'Monthly')}</option><option value="annual">{t('سنوي', 'Yearly')}</option><option value="two_installments">{t('على دفعتين', 'Two installments')}</option></select></label>}<label>{t('نوع العقار', 'Property type')}<select value={form.property_type} onChange={(event) => updateForm('property_type', event.target.value)}>{allPropertyTypes.map((type) => <option key={type} value={type}>{typeLabel(type, lang)}</option>)}</select></label><label>{t('حالة التأثيث', 'Furnishing')}<select value={form.furnishing ?? ''} onChange={(event) => updateForm('furnishing', event.target.value)}><option value="">{t('— غير محدد —', '— Not specified —')}</option><option value="furnished">{t('مؤثثة', 'Furnished')}</option><option value="unfurnished">{t('غير مؤثثة', 'Unfurnished')}</option></select></label><label>{t('المدينة', 'City')}<input required value={form.city} onChange={(event) => updateForm('city', event.target.value)} /></label><label>{t('الحي', 'District')}<input required value={form.district} onChange={(event) => updateForm('district', event.target.value)} /></label><label>{t('الشارع', 'Street')}<input value={form.street} onChange={(event) => updateForm('street', event.target.value)} /></label><label>{form.listing_type === 'rent' && form.rent_period === 'two_installments' ? t('السعر على الدفعة الواحدة', 'Price per installment') : t('السعر', 'Price')}<input required type="number" min="0" value={form.price} onChange={(event) => updateForm('price', Number(event.target.value))} /></label><label>{t('المساحة (م²)', 'Area (m²)')}<input type="number" min="0" value={form.area} onChange={(event) => updateForm('area', Number(event.target.value))} /></label>{form.property_type === 'شقة' && ([['rooms', t('عدد الغرف', 'Bedrooms')], ['bathrooms', t('الحمامات', 'Bathrooms')], ['lounges', t('الصالات', 'Living rooms')], ['kitchens', t('المطابخ', 'Kitchens')], ['floor_number', t('الدور', 'Floor')], ['floors', t('عدد الأدوار', 'Floors')]] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min="0" value={form[key]} onChange={(event) => updateForm(key, Number(event.target.value))} /></label>)}{form.property_type === 'شقة' && <label className="check"><input type="checkbox" checked={form.has_roof} onChange={(event) => updateForm('has_roof', event.target.checked)} /> {t('يوجد سطح', 'Has roof')}</label>}{form.property_type === 'شقة' && <label className="check"><input type="checkbox" checked={form.has_elevator} onChange={(event) => updateForm('has_elevator', event.target.checked)} /> {t('يوجد مصعد', 'Has elevator')}</label>}<label>{t('اسم المالك', 'Owner name')} <small>({t('للموظفين فقط', 'staff only')})</small><input required value={form.owner_name} onChange={(event) => updateForm('owner_name', event.target.value)} /></label><label>{t('رقم جوال المالك', 'Owner mobile')} <small>({t('للموظفين فقط', 'staff only')})</small><input required inputMode="tel" value={form.owner_phone} onChange={(event) => updateForm('owner_phone', event.target.value)} /></label><label className="full">{t('بريد التواصل (اختياري)', 'Contact email (optional)')}<input type="email" dir="ltr" maxLength={120} value={form.contact_email} onChange={(event) => updateForm('contact_email', event.target.value)} placeholder="name@example.com" /></label><label className="full">{t('ملاحظات إضافية', 'Notes')}<textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} rows={3} /></label><label className="full file-label"><span>{t('صور العقار', 'Photos')} <small>{t('علامة مائية بيضاء شفافة في منتصف الصورة', 'A transparent watermark is added')}</small></span><input type="file" accept="image/*" multiple onChange={(event) => void handleFiles(event.target.files)} /></label></div><div className="image-previews">{form.images.map((image, index) => <div key={`${image.slice(0, 20)}-${index}`}><img src={image} alt={`${index + 1}`} /><button type="button" onClick={() => updateForm('images', form.images.filter((_, imageIndex) => imageIndex !== index))}><X size={14} /></button></div>)}</div><div className="location-heading"><span>{t('موقع العقار', 'Property location')}</span><small>{t('اضغط على الخريطة لوضع الدبوس، ويمكنك التبديل بين الخريطة الداكنة والعادية والقمر الصناعي من زر الطبقات.', 'Click the map to drop the pin. Switch between dark, normal and satellite from the layers button.')}</small></div><LocationPicker lang={lang} latitude={form.latitude} longitude={form.longitude} onSelect={(latitude, longitude) => void selectLocation(latitude, longitude)} />{form.latitude !== null && <div className="location-row"><MapPinned size={16} /><span>{form.latitude.toFixed(5)}, {form.longitude?.toFixed(5)}</span></div>}{notice && <div className="form-note">{notice}</div>}<div className="form-footer"><button type="button" className="cancel-button" onClick={() => setModal(null)}>{t('إلغاء', 'Cancel')}</button><button className="primary-button" disabled={saving}>{saving ? t('جارٍ الحفظ...', 'Saving…') : t('حفظ العقار', 'Save property')}</button></div></form>}
      </div></div>}
    </div>
  );
}

export default App;
