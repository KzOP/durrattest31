import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { collection, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '@/durrat/lib/firebase';
import { isAdminEmail } from '@/durrat/lib/admin';
import type { Lang } from '@/durrat/lib/i18n';

function authError(error: unknown, lang: Lang) {
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
  const en = lang === 'en';
  if (code === 'auth/email-already-in-use') return en ? 'This email is already registered.' : 'البريد الإلكتروني مسجل مسبقاً.';
  if (code === 'auth/invalid-email') return en ? 'Invalid email address.' : 'البريد الإلكتروني غير صالح.';
  if (code === 'auth/weak-password') return en ? 'Password is too weak (min 6 characters).' : 'كلمة المرور ضعيفة (6 أحرف على الأقل).';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') return en ? 'Current password is incorrect.' : 'كلمة المرور الحالية غير صحيحة.';
  if (code === 'auth/operation-not-allowed') return en ? 'Email sign-up is disabled in Firebase Authentication.' : 'التسجيل بالبريد غير مفعّل في Firebase Authentication.';
  return en ? 'Something went wrong. Please try again.' : 'حدث خطأ. حاول مرة أخرى.';
}

export function RegisterForm({ lang, onDone }: { lang: Lang; onDone: (message: string) => void }) {
  const en = lang === 'en';
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const displayName = String(data.get('displayName') ?? '').trim();
    const email = String(data.get('email') ?? '').trim().toLowerCase();
    const phone = String(data.get('phone') ?? '').replace(/\D/g, '');
    const password = String(data.get('password') ?? '');
    const confirm = String(data.get('confirm') ?? '');
    if (!displayName || displayName.length > 80) return setError(en ? 'Enter your name.' : 'أدخل الاسم.');
    if (!/^\d{9,15}$/.test(phone)) return setError(en ? 'Enter a valid mobile number.' : 'أدخل رقم جوال صحيح.');
    if (password.length < 6) return setError(en ? 'Password must be at least 6 characters.' : 'كلمة المرور 6 أحرف على الأقل.');
    if (password !== confirm) return setError(en ? 'Passwords do not match.' : 'كلمة المرور وتأكيدها غير متطابقتين.');
    setBusy(true);
    setError('');
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      try {
        await updateProfile(credential.user, { displayName });
        await setDoc(doc(db, 'employees', credential.user.uid), {
          displayName,
          email,
          phone,
          role: isAdminEmail(email) ? 'super_admin' : 'employee',
          active: true,
          created_at: new Date().toISOString(),
        });
      } catch (profileError) {
        await deleteUser(credential.user).catch(() => undefined);
        throw profileError;
      }
      onDone(en ? 'Account created. Welcome!' : 'تم إنشاء الحساب بنجاح. أهلاً بك!');
    } catch (failure) {
      setError(authError(failure, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <label>{en ? 'Full name' : 'الاسم'}<input name="displayName" required maxLength={80} /></label>
      <label>{en ? 'Email' : 'البريد الإلكتروني'}<input name="email" type="email" required dir="ltr" /></label>
      <label>{en ? 'Mobile number' : 'رقم الجوال'}<input name="phone" inputMode="tel" required placeholder="05xxxxxxxx" dir="ltr" /></label>
      <label>{en ? 'Password' : 'كلمة المرور'}<input name="password" type="password" required minLength={6} /></label>
      <label>{en ? 'Confirm password' : 'تأكيد كلمة المرور'}<input name="confirm" type="password" required minLength={6} /></label>
      {error && <div className="form-error">{error}</div>}
      <button className="primary-button submit-button" disabled={busy}>{busy ? (en ? 'Creating…' : 'جارٍ الإنشاء...') : (en ? 'Create account' : 'إنشاء الحساب')}</button>
    </form>
  );
}

export function ProfilePanel({ lang, staffId, displayName, onNameChange }: {
  lang: Lang; staffId: string; displayName: string; onNameChange: (name: string) => void;
}) {
  const en = lang === 'en';
  const [name, setName] = useState(displayName);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const saveName = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = name.trim();
    if (!next || next.length > 80) return;
    setBusy(true); setMessage(''); setError('');
    try {
      await updateDoc(doc(db, 'employees', staffId), { displayName: next });
      if (auth.currentUser) await updateProfile(auth.currentUser, { displayName: next }).catch(() => undefined);
      const own = await getDocs(query(collection(db, 'properties'), where('created_by_staff_id', '==', staffId)));
      await Promise.all(own.docs.map((item) => updateDoc(item.ref, { publisher_name: next, created_by_name: next }).catch(() => undefined)));
      onNameChange(next);
      setMessage(en ? 'Name updated.' : 'تم تحديث الاسم.');
    } catch (failure) {
      setError(authError(failure, lang));
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const current = String(data.get('current') ?? '');
    const next = String(data.get('next') ?? '');
    const confirm = String(data.get('confirm') ?? '');
    setMessage(''); setError('');
    if (next.length < 6) return setError(en ? 'Password must be at least 6 characters.' : 'كلمة المرور 6 أحرف على الأقل.');
    if (next !== confirm) return setError(en ? 'Passwords do not match.' : 'كلمة المرور وتأكيدها غير متطابقتين.');
    const user = auth.currentUser;
    if (!user?.email) return;
    setBusy(true);
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await updatePassword(user, next);
      form.reset();
      setMessage(en ? 'Password changed.' : 'تم تغيير كلمة المرور.');
    } catch (failure) {
      setError(authError(failure, lang));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-panel">
      <span className="eyebrow">{en ? 'My account' : 'حسابي'}</span>
      <h2>{en ? 'Profile' : 'الملف الشخصي'}</h2>
      <form className="property-form" onSubmit={(event) => void saveName(event)}>
        <label>{en ? 'Display name' : 'الاسم الظاهر'}<input value={name} maxLength={80} required onChange={(event) => setName(event.target.value)} /></label>
        <button className="primary-button small" disabled={busy}>{en ? 'Save name' : 'حفظ الاسم'}</button>
      </form>
      <form className="property-form" onSubmit={(event) => void savePassword(event)}>
        <label>{en ? 'Current password' : 'كلمة المرور الحالية'}<input name="current" type="password" required /></label>
        <label>{en ? 'New password' : 'كلمة المرور الجديدة'}<input name="next" type="password" required minLength={6} /></label>
        <label>{en ? 'Confirm new password' : 'تأكيد كلمة المرور الجديدة'}<input name="confirm" type="password" required minLength={6} /></label>
        <button className="primary-button small" disabled={busy}>{en ? 'Change password' : 'تغيير كلمة المرور'}</button>
      </form>
      {message && <div className="form-note">{message}</div>}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}
