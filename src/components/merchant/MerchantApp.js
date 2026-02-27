import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Package, Camera, ShoppingBag, Clock, Settings, LogOut,
  X, Plus, Minus, Check, BarChart3, Edit2, MapPin, ChevronRight,
  AlertCircle, Save, Navigation, Search, CheckCircle, Loader,
  Shield
} from 'lucide-react';
import { useLocalStorage, writeLocalStorage, readLocalStorage } from '../../hooks/useLocalStorage';
import { merchantService, orderService } from '../../lib/supabase';
import { useNotification } from '../../hooks/useNotification';
import { formatCurrency, formatDate } from '../../utils/helpers';
import { NotificationContainer } from '../shared/NotificationContainer';
import { LoadingSpinner } from '../shared/SkeletonLoader';
import { VerificationFlow } from './VerificationFlow';

/* ─── Address Picker ─── */
const AddressPicker = ({ value, onChange, error }) => {
  const [query, setQuery]           = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [confirmed, setConfirmed]   = useState(!!value);
  const debounceRef                 = useRef(null);

  const searchAddress = async (q) => {
    if (q.length < 4) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`, { headers: { 'Accept-Language': 'es' } });
      const data = await res.json();
      setSuggestions(data);
    } catch { setSuggestions([]); }
    finally { setLoading(false); }
  };

  const handleInput = (val) => {
    setQuery(val);
    setConfirmed(false);
    onChange(val, null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAddress(val), 500);
  };

  const selectSuggestion = (s) => {
    const addr = s.display_name;
    setQuery(addr);
    setSuggestions([]);
    setConfirmed(true);
    onChange(addr, { lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
  };

  const useGPS = () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'es' } });
          const data = await res.json();
          const addr = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setQuery(addr); setConfirmed(true); setSuggestions([]);
          onChange(addr, { lat, lng });
        } catch {
          const addr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
          setQuery(addr); setConfirmed(true);
          onChange(addr, { lat, lng });
        }
        setGpsLoading(false);
      },
      () => setGpsLoading(false),
      { timeout: 8000 }
    );
  };

  return (
    <div className="space-y-2">
      <button type="button" onClick={useGPS} disabled={gpsLoading}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-purple-300 bg-purple-50 text-purple-700 rounded-xl font-semibold text-sm hover:bg-purple-100 transition-colors disabled:opacity-60">
        {gpsLoading
          ? <><Loader size={15} className="animate-spin"/> Obteniendo ubicación...</>
          : <><Navigation size={15}/> Usar mi ubicación actual</>}
      </button>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <div className="flex-1 h-px bg-gray-200"/>
        <span>o busca tu dirección</span>
        <div className="flex-1 h-px bg-gray-200"/>
      </div>
      <div className="relative">
        <MapPin className={`absolute left-4 top-3.5 ${confirmed ? 'text-green-500' : 'text-gray-400'}`} size={17}/>
        <input type="text" placeholder="Calle, número, colonia, ciudad..." value={query}
          onChange={e => handleInput(e.target.value)}
          className={`w-full pl-11 pr-10 py-3 bg-gray-50 border-2 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all text-sm ${
            error ? 'border-red-400' : confirmed ? 'border-green-400' : 'border-gray-200'
          }`}/>
        <div className="absolute right-4 top-3.5">
          {loading ? <Loader size={15} className="animate-spin text-gray-400"/>
           : confirmed ? <CheckCircle size={15} className="text-green-500"/>
           : null}
        </div>
      </div>
      {suggestions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button key={i} type="button" onClick={() => selectSuggestion(s)}
              className="w-full text-left px-4 py-3 text-sm hover:bg-purple-50 transition-colors border-b border-gray-50 last:border-0 flex items-start gap-2">
              <MapPin size={13} className="text-purple-500 mt-0.5 shrink-0"/>
              <span className="text-gray-700 line-clamp-2">{s.display_name}</span>
            </button>
          ))}
        </div>
      )}
      {confirmed && <p className="text-xs text-green-600 flex items-center gap-1 font-medium"><CheckCircle size={11}/> Ubicación confirmada en el mapa</p>}
      {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle size={11}/>{error}</p>}
    </div>
  );
};

const CATEGORY_OPTIONS = [
  { id: 'restaurant', label: '🍽️ Restaurante' },
  { id: 'bakery',     label: '🥐 Panadería'   },
  { id: 'cafe',       label: '☕ Café'         },
  { id: 'grocery',    label: '🥬 Supermercado' },
];
const EMOJI_OPTIONS = ['🍽️','🥐','☕','🥗','🌮','🍕','🍱','🥩','🥨','🍰','🧁','🥪'];

/* ─── BAG EDITOR MODAL ─── */
const BagEditorModal = ({ merchant, onSave, onClose }) => {
  const [form, setForm] = useState({
    name:          merchant.name                || '',
    type:          merchant.type                || '',
    category:      merchant.category            || 'restaurant',
    description:   merchant.description         || '',
    originalPrice: merchant.originalPrice       || 300,
    savePrice:     merchant.savePrice           || 99,
    pickupStart:   merchant.pickupWindow?.start || '20:00',
    pickupEnd:     merchant.pickupWindow?.end   || '22:00',
    image:         merchant.image               || '🍽️',
    coverImage:    merchant.coverImage          || '',
    address:       merchant.address             || '',
    location:      merchant.location            || null,
    phone:         merchant.phone               || '',
  });
  const [errors, setErrors]           = useState({});
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [photoPreview, setPhotoPreview]       = useState(merchant.coverImage || '');
  const photoInputRef                         = useRef(null);

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('La foto debe ser menor a 5 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setPhotoPreview(dataUrl);
      setForm(f => ({ ...f, coverImage: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const discount = form.originalPrice > 0
    ? Math.round(((form.originalPrice - form.savePrice) / form.originalPrice) * 100) : 0;

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    const e = {};
    if (!form.name.trim())        e.name        = 'El nombre es requerido';
    if (!form.type.trim())        e.type        = 'El tipo de negocio es requerido';
    if (!form.description.trim()) e.description = 'Agrega una descripción de tu bolsa';
    if (Number(form.originalPrice) <= 0) e.originalPrice = 'El precio original debe ser mayor a $0';
    if (Number(form.savePrice) <= 0)     e.savePrice     = 'El precio Save debe ser mayor a $0';
    if (Number(form.savePrice) >= Number(form.originalPrice))
      e.savePrice = 'El precio Save debe ser menor al precio original';
    if (!form.pickupStart) e.pickupStart = 'Hora de inicio requerida';
    if (!form.pickupEnd)   e.pickupEnd   = 'Hora de fin requerida';
    if (form.pickupStart >= form.pickupEnd) e.pickupEnd = 'La hora de fin debe ser posterior';
    if (!form.address.trim()) e.address = 'La dirección es requerida';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onSave({
      ...merchant,
      name: form.name.trim(), type: form.type.trim(), category: form.category,
      description: form.description.trim(),
      originalPrice: Number(form.originalPrice), savePrice: Number(form.savePrice),
      pickupWindow: { start: form.pickupStart, end: form.pickupEnd },
      image: form.image, coverImage: form.coverImage || merchant.coverImage || null,
      address: form.address.trim(), phone: form.phone.trim(),
      location: form.location || merchant.location,
    });
  };

  const inputCls = (field) =>
    `w-full px-4 py-3 border-2 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all ${errors[field] ? 'border-red-400' : 'border-gray-200'}`;

  const Field = ({ label, error, children }) => (
    <div>
      <label className="text-sm font-semibold text-gray-700 mb-1 block">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle size={12}/>{error}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl">
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-10 rounded-t-3xl">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Editar mi bolsa</h2>
            <p className="text-sm text-gray-500">Configura cómo apareces en la app</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={22}/></button>
        </div>

        <div className="p-6 space-y-5">
          {/* Emoji */}
          <Field label="Ícono de tu negocio">
            <div className="flex items-center gap-3">
              <button onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="w-16 h-16 bg-purple-50 border-2 border-purple-200 rounded-2xl text-4xl flex items-center justify-center hover:border-purple-400 transition-colors">
                {form.image}
              </button>
              <span className="text-sm text-gray-500">Toca para cambiar el ícono</span>
            </div>
            {showEmojiPicker && (
              <div className="mt-2 p-3 bg-gray-50 rounded-2xl grid grid-cols-6 gap-2">
                {EMOJI_OPTIONS.map(emoji => (
                  <button key={emoji}
                    onClick={() => { setForm(f => ({...f, image: emoji})); setShowEmojiPicker(false); }}
                    className={`text-2xl p-2 rounded-xl hover:bg-purple-100 transition-colors ${form.image === emoji ? 'bg-purple-200' : ''}`}>
                    {emoji}
                  </button>
                ))}
              </div>
            )}
          </Field>

          {/* Photo upload */}
          <Field label="📸 Foto de tu negocio (aparece en Destacados)">
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange}/>
            {photoPreview ? (
              <div className="relative rounded-2xl overflow-hidden h-40 bg-gray-100 group cursor-pointer"
                onClick={() => photoInputRef.current?.click()}>
                <img src={photoPreview} alt="Foto del negocio" className="w-full h-full object-cover"/>
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="bg-white rounded-full px-4 py-2 text-sm font-bold text-gray-800 flex items-center gap-2">
                    <Camera size={16}/> Cambiar foto
                  </div>
                </div>
              </div>
            ) : (
              <button onClick={() => photoInputRef.current?.click()}
                className="w-full h-36 border-2 border-dashed border-purple-300 bg-purple-50 rounded-2xl flex flex-col items-center justify-center gap-2 hover:bg-purple-100 transition-colors text-purple-600">
                <Camera size={28}/>
                <span className="font-semibold text-sm">Subir foto del negocio</span>
                <span className="text-xs text-purple-400">JPG, PNG · máx 5 MB</span>
              </button>
            )}
            {photoPreview && (
              <button onClick={() => { setPhotoPreview(''); setForm(f => ({...f, coverImage: ''})); }}
                className="text-xs text-red-400 hover:text-red-600 mt-1">
                ✕ Quitar foto
              </button>
            )}
          </Field>

          <Field label="Nombre del negocio" error={errors.name}>
            <input type="text" value={form.name} onChange={set('name')} placeholder="Ej. Panadería San Ángel" className={inputCls('name')}/>
          </Field>

          <Field label="Tipo de negocio" error={errors.type}>
            <input type="text" value={form.type} onChange={set('type')} placeholder="Ej. Panadería Artesanal" className={inputCls('type')}/>
          </Field>

          <Field label="Categoría">
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_OPTIONS.map(cat => (
                <button key={cat.id} onClick={() => setForm(f => ({...f, category: cat.id}))}
                  className={`py-2.5 px-3 rounded-xl text-sm font-semibold border-2 transition-all text-left ${
                    form.category === cat.id ? 'bg-purple-600 text-white border-purple-600' : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-purple-300'}`}>
                  {cat.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Descripción de tu bolsa sorpresa" error={errors.description}>
            <textarea value={form.description} onChange={set('description')} rows={3} className={inputCls('description') + ' resize-none'}
              placeholder="Ej. Incluye pan artesanal, croissants y pasteles del día recién horneados..."/>
            <p className="text-xs text-gray-400 mt-1 text-right">{form.description.length} caracteres</p>
          </Field>

          {/* Precios */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-4">
            <h3 className="font-bold text-gray-800">💰 Precios</h3>
            <Field label="Precio original (valor real de los productos)" error={errors.originalPrice}>
              <div className="relative">
                <span className="absolute left-4 top-3 text-gray-500 font-bold">$</span>
                <input type="number" value={form.originalPrice} onChange={set('originalPrice')} min="1" placeholder="300" className={inputCls('originalPrice') + ' pl-8'}/>
              </div>
            </Field>
            <Field label="Precio Save (lo que paga el cliente)" error={errors.savePrice}>
              <div className="relative">
                <span className="absolute left-4 top-3 text-gray-500 font-bold">$</span>
                <input type="number" value={form.savePrice} onChange={set('savePrice')} min="1" placeholder="99" className={inputCls('savePrice') + ' pl-8'}/>
              </div>
            </Field>
            {form.originalPrice > 0 && form.savePrice > 0 && Number(form.savePrice) < Number(form.originalPrice) && (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl p-3">
                <span className="text-sm text-green-700 font-medium">Los clientes ahorran:</span>
                <div className="text-right">
                  <span className="text-lg font-bold text-green-600">{formatCurrency(form.originalPrice - form.savePrice)}</span>
                  <span className="ml-2 bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">-{discount}%</span>
                </div>
              </div>
            )}
          </div>

          {/* Horario */}
          <div className="bg-gray-50 rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-gray-800">🕐 Horario de recogida</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hora inicio" error={errors.pickupStart}>
                <input type="time" value={form.pickupStart} onChange={set('pickupStart')} className={inputCls('pickupStart')}/>
              </Field>
              <Field label="Hora fin" error={errors.pickupEnd}>
                <input type="time" value={form.pickupEnd} onChange={set('pickupEnd')} className={inputCls('pickupEnd')}/>
              </Field>
            </div>
          </div>

          <Field label="Dirección" error={errors.address}>
            <AddressPicker
              value={form.address}
              error={errors.address}
              onChange={(address, location) =>
                setForm(f => ({ ...f, address, location: location || f.location }))
              }
            />
          </Field>

          <Field label="Teléfono de contacto (opcional)">
            <input type="tel" value={form.phone} onChange={set('phone')} placeholder="+52 55 1234 5678" className={inputCls('phone')}/>
          </Field>

          {Object.keys(errors).length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <p className="text-sm text-red-600 font-medium flex items-center gap-2">
                <AlertCircle size={16}/>Corrige los errores antes de guardar
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="flex-1 py-3.5 border-2 border-gray-200 text-gray-600 rounded-2xl font-bold hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button onClick={handleSubmit} className="flex-1 py-3.5 bg-purple-600 text-white rounded-2xl font-bold shadow-lg shadow-purple-600/30 hover:bg-purple-700 transition-colors flex items-center justify-center gap-2">
              <Save size={18}/>Guardar cambios
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ─── MAIN MERCHANT APP ─── */
export const MerchantApp = ({ user, onLogout, onSwitchToClient }) => {
  const [activeTab, setActiveTab]           = useState('dashboard');
  const [myMerchant, setMyMerchant]         = useState(null);
  const [orders, setOrders]                 = useLocalStorage('save-orders', []);
  const [showStockModal, setShowStockModal] = useState(false);
  const [showBagEditor, setShowBagEditor]   = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [newStock, setNewStock]             = useState(0);
  const [showQRScanner, setShowQRScanner]   = useState(false);
  const [scanResult, setScanResult]         = useState(null);
  const [isLoading, setIsLoading]           = useState(true);
  const { notifications, showNotification, removeNotification } = useNotification();

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        // Try Supabase first
        const cloudMerchant = await merchantService.getMine();
        if (cloudMerchant) {
          setMyMerchant(cloudMerchant);
          writeLocalStorage('save-merchant', cloudMerchant); // keep local copy in sync
          // Load orders from Supabase
          const cloudOrders = await orderService.getMerchantOrders(cloudMerchant.id);
          if (cloudOrders?.length) setOrders(cloudOrders);
        } else {
          // Fallback to localStorage
          const saved = readLocalStorage('save-merchant');
          if (saved) {
            setMyMerchant(saved);
          } else {
            const fresh = {
              id: user?.id || Date.now(),
              name: user?.businessName || 'Mi Negocio',
              type: user?.businessType || 'Restaurante', category: 'restaurant',
              address: 'Calle Principal 123, CDMX',
              location: { lat: 19.4326, lng: -99.1332 },
              pickupWindow: { start: '20:00', end: '22:00' },
              originalPrice: 300, savePrice: 99, bagsAvailable: 5,
              rating: 5.0, reviews: 0, totalSaved: 0, image: '🍽️',
              description: 'Descripción de mi negocio. ¡Edítame desde Configuración!',
              phone: user?.phone || '', email: user?.email || '',
              isActive: true, createdAt: new Date().toISOString(),
            };
            setMyMerchant(fresh);
            writeLocalStorage('save-merchant', fresh);
            // Save to Supabase too
            merchantService.create(fresh).catch(() => {});
          }
        }
      } catch {
        // Pure localStorage fallback
        const saved = readLocalStorage('save-merchant');
        if (saved) setMyMerchant(saved);
        else showNotification('Error al cargar datos', 'error');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [user, showNotification]);

  const saveMerchant = async (updated) => {
    setMyMerchant(updated);
    writeLocalStorage('save-merchant', updated);
    setShowBagEditor(false);
    // Save to Supabase if it has a cloud ID (UUID format)
    try {
      if (updated.id && String(updated.id).includes('-')) {
        await merchantService.update(updated);
      }
    } catch {}
    showNotification('¡Bolsa actualizada correctamente! ✅', 'success');
  };

  const updateStock = async (val) => {
    const updated = { ...myMerchant, bagsAvailable: val };
    setMyMerchant(updated);
    writeLocalStorage('save-merchant', updated);
    setShowStockModal(false);
    try {
      if (updated.id && String(updated.id).includes('-')) {
        await merchantService.update(updated);
      }
    } catch {}
    showNotification(`Stock actualizado: ${val} bolsas disponibles`);
  };

  const simulateScan = () => {
    setShowQRScanner(true); setScanResult(null);
    setTimeout(() => {
      setScanResult({ orderId: 'ORD_'+Date.now(), code: 'ABC123', customerName: 'Cliente Ejemplo', bags: 1, amount: myMerchant?.savePrice || 99 });
      showNotification('Código escaneado correctamente', 'success');
    }, 2000);
  };

  const confirmOrder = (orderId) => {
    setOrders(prev => prev.map(o => o.id === orderId ? {...o, status:'completed', completedAt: new Date().toISOString()} : o));
    showNotification('Orden confirmada correctamente');
    setScanResult(null); setShowQRScanner(false);
  };

  const stats = useMemo(() => {
    const pending   = orders.filter(o => o.status === 'pending');
    const completed = orders.filter(o => o.status === 'completed');
    const revenue   = completed.reduce((acc, o) => acc + (o.amount || myMerchant?.savePrice || 0), 0);
    return { pending: pending.length, completed: completed.length, revenue, pendingList: pending, completedList: completed };
  }, [orders, myMerchant]);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><LoadingSpinner size="lg"/></div>;
  if (!myMerchant) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-gray-600 mb-4">Error al cargar el negocio</p>
        <button onClick={onSwitchToClient} className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold">Volver al modo cliente</button>
      </div>
    </div>
  );

  const discount = Math.round(((myMerchant.originalPrice - myMerchant.savePrice) / myMerchant.originalPrice) * 100);

  return (
    <div className="max-w-lg mx-auto bg-gray-50 min-h-screen pb-24">
      <NotificationContainer notifications={notifications} onRemove={removeNotification}/>
      {showVerification && <VerificationFlow merchant={myMerchant} onClose={() => setShowVerification(false)} />}

      {/* Header */}
      <div className="bg-gradient-to-br from-purple-600 via-purple-500 to-indigo-600 text-white p-6 pb-8 rounded-b-[2.5rem] shadow-xl">
        <div className="flex justify-between items-start mb-4">
          <div>
            <span className="bg-white/20 backdrop-blur px-2 py-0.5 rounded text-xs font-bold">MODO NEGOCIO</span>
            <h1 className="text-2xl font-bold mt-1">{myMerchant.name}</h1>
            <p className="text-purple-100 text-sm">{myMerchant.type}</p>
          </div>
          <button onClick={onSwitchToClient} className="bg-white/20 backdrop-blur px-4 py-2 rounded-full text-sm font-semibold hover:bg-white/30 transition-colors">
            Modo cliente
          </button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: myMerchant.bagsAvailable, label: 'Bolsas hoy', alert: myMerchant.bagsAvailable === 0 },
            { value: stats.pending,            label: 'Pendientes' },
            { value: formatCurrency(stats.revenue), label: 'Ingresos' },
          ].map(s => (
            <div key={s.label} className={`backdrop-blur rounded-2xl p-3 text-center border ${s.alert ? 'bg-red-500/30 border-red-400/50' : 'bg-white/10 border-white/20'}`}>
              <p className="text-2xl font-bold">{s.value}</p>
              <p className="text-xs text-purple-100">{s.label}</p>
              {s.alert && <p className="text-xs text-red-200 font-bold">¡Sin stock!</p>}
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Verification banner */}
        {(() => {
          const verif = JSON.parse(localStorage.getItem('save-verification') || 'null');
          const status = verif?.status || 'draft';
          if (status === 'approved') return (
            <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <CheckCircle size={20} className="text-green-500 shrink-0" />
              <p className="text-sm font-semibold text-green-700 flex-1">Negocio verificado ✓ — los clientes ven tu sello de confianza</p>
            </div>
          );
          if (status === 'pending') return (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-3">
              <Clock size={20} className="text-amber-500 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-700">Verificación en revisión</p>
                <p className="text-xs text-amber-600">Responderemos en 24-48 horas hábiles</p>
              </div>
              <button onClick={() => setShowVerification(true)} className="text-xs text-amber-700 font-bold underline">Ver estado</button>
            </div>
          );
          return (
            <button onClick={() => setShowVerification(true)}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl px-4 py-3.5 flex items-center gap-3 hover:opacity-95 transition-opacity shadow-lg shadow-blue-600/20">
              <Shield size={22} className="shrink-0" />
              <div className="flex-1 text-left">
                <p className="font-bold text-sm">Verifica tu negocio</p>
                <p className="text-xs text-blue-100">Genera más confianza y mayor visibilidad</p>
              </div>
              <ChevronRight size={18} className="shrink-0" />
            </button>
          );
        })()}
        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setShowBagEditor(true)}
            className="bg-purple-600 text-white p-4 rounded-2xl font-bold shadow-lg shadow-purple-600/30 flex flex-col items-center gap-2 hover:bg-purple-700 transition-colors">
            <Edit2 size={24}/>Editar bolsa
          </button>
          <button onClick={simulateScan}
            className="bg-blue-600 text-white p-4 rounded-2xl font-bold shadow-lg shadow-blue-600/30 flex flex-col items-center gap-2 hover:bg-blue-700 transition-colors">
            <Camera size={24}/>Escanear QR
          </button>
        </div>

        {/* Bag preview */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 px-5 py-3 flex justify-between items-center border-b border-gray-100">
            <p className="text-sm font-bold text-purple-700">Vista previa de tu bolsa</p>
            <button onClick={() => setShowBagEditor(true)} className="text-xs text-purple-600 font-semibold flex items-center gap-1 hover:underline">
              <Edit2 size={12}/>Editar
            </button>
          </div>
          <div className="p-5 flex gap-4 items-start">
            <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center text-4xl shrink-0 overflow-hidden">
              {myMerchant.coverImage
                ? <img src={myMerchant.coverImage} alt={myMerchant.name} className="w-full h-full object-cover"/>
                : myMerchant.image}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 truncate">{myMerchant.name}</h3>
              <p className="text-xs text-gray-500 mb-1">{myMerchant.type}</p>
              <p className="text-xs text-gray-600 line-clamp-2 mb-2">{myMerchant.description}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl font-bold text-green-600">{formatCurrency(myMerchant.savePrice)}</span>
                <span className="text-sm text-gray-400 line-through">{formatCurrency(myMerchant.originalPrice)}</span>
                <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">-{discount}%</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${myMerchant.bagsAvailable > 0 ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'}`}>
                  🛍️ {myMerchant.bagsAvailable} disponibles
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <Clock size={11}/>{myMerchant.pickupWindow.start} – {myMerchant.pickupWindow.end}
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {[{id:'dashboard',label:'Dashboard',icon:BarChart3},{id:'orders',label:`Órdenes (${stats.pending})`,icon:ShoppingBag},{id:'history',label:'Historial',icon:Clock},{id:'settings',label:'Configuración',icon:Settings}].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all ${activeTab===tab.id?'bg-purple-600 text-white shadow-md':'bg-white text-gray-600 border border-gray-200'}`}>
              <tab.icon size={16}/>{tab.label}
            </button>
          ))}
        </div>

        {/* Dashboard */}
        {activeTab==='dashboard' && (
          <div className="space-y-4">

            {/* Revenue summary */}
            <div className="bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl p-5 text-white shadow-lg shadow-purple-600/30">
              <p className="text-purple-200 text-sm font-medium mb-1">Ingresos totales</p>
              <p className="text-4xl font-bold mb-3">{formatCurrency(stats.revenue)}</p>
              <div className="flex gap-4">
                <div className="bg-white/15 rounded-xl px-4 py-2 text-center">
                  <p className="text-2xl font-bold">{stats.completed}</p>
                  <p className="text-xs text-purple-200">Completadas</p>
                </div>
                <div className="bg-white/15 rounded-xl px-4 py-2 text-center">
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-xs text-purple-200">Pendientes</p>
                </div>
                <div className="bg-white/15 rounded-xl px-4 py-2 text-center">
                  <p className="text-2xl font-bold">{myMerchant.totalSaved || 0}</p>
                  <p className="text-xs text-purple-200">Salvadas</p>
                </div>
              </div>
            </div>

            {/* Bolsas disponibles — tarjeta prominente */}
            <div className={`rounded-2xl p-5 border-2 ${myMerchant.bagsAvailable > 3 ? 'bg-green-50 border-green-200' : myMerchant.bagsAvailable > 0 ? 'bg-amber-50 border-amber-300' : 'bg-red-50 border-red-300'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl ${myMerchant.bagsAvailable > 3 ? 'bg-green-100' : myMerchant.bagsAvailable > 0 ? 'bg-amber-100' : 'bg-red-100'}`}>
                    🛍️
                  </div>
                  <div>
                    <p className={`text-4xl font-black ${myMerchant.bagsAvailable > 3 ? 'text-green-600' : myMerchant.bagsAvailable > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                      {myMerchant.bagsAvailable}
                    </p>
                    <p className="text-sm font-semibold text-gray-600">bolsas disponibles hoy</p>
                    {myMerchant.bagsAvailable === 0 && (
                      <p className="text-xs text-red-500 font-bold mt-0.5">⚠️ Sin stock — los clientes no te verán</p>
                    )}
                    {myMerchant.bagsAvailable > 0 && myMerchant.bagsAvailable <= 3 && (
                      <p className="text-xs text-amber-600 font-bold mt-0.5">⏳ Pocas bolsas restantes</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { setNewStock(myMerchant.bagsAvailable); setShowStockModal(true); }}
                  className={`px-4 py-2 rounded-xl font-bold text-sm transition-colors ${myMerchant.bagsAvailable > 3 ? 'bg-green-600 text-white hover:bg-green-700' : myMerchant.bagsAvailable > 0 ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-red-500 text-white hover:bg-red-600'}`}>
                  Cambiar stock
                </button>
              </div>
            </div>

            {/* Pending orders quick view */}
            {stats.pending > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="font-bold text-amber-800 mb-3 flex items-center gap-2">
                  <ShoppingBag size={18}/> {stats.pending} orden{stats.pending > 1 ? 'es' : ''} pendiente{stats.pending > 1 ? 's' : ''}
                </p>
                <div className="space-y-2">
                  {stats.pendingList.slice(0, 3).map(order => (
                    <div key={order.id} className="flex justify-between items-center bg-white rounded-xl px-4 py-3">
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{order.customerName || 'Cliente'}</p>
                        <p className="text-xs text-gray-500">Código: {order.code}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-600 text-sm">{formatCurrency(order.amount || myMerchant.savePrice)}</p>
                        <button onClick={() => confirmOrder(order.id)}
                          className="text-xs text-purple-600 font-bold hover:underline mt-0.5">
                          Confirmar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {stats.pending > 3 && (
                  <button onClick={() => setActiveTab('orders')} className="text-sm text-amber-700 font-semibold mt-2 hover:underline">
                    Ver todas ({stats.pending}) →
                  </button>
                )}
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-4">Información del negocio</h3>
              <div className="space-y-3">
                {[
                  {label:'Dirección', value:myMerchant.address},
                  {label:'Horario pickup', value:`${myMerchant.pickupWindow.start} – ${myMerchant.pickupWindow.end}`},
                  {label:'Precio original', value:formatCurrency(myMerchant.originalPrice)},
                  {label:'Precio Save', value:formatCurrency(myMerchant.savePrice), green:true},
                  {label:'Descuento', value:`-${discount}%`, green:true},
                ].map(row => (
                  <div key={row.label} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl">
                    <span className="text-gray-600 text-sm">{row.label}</span>
                    <span className={`font-semibold text-sm text-right max-w-[55%] ${row.green?'text-green-600':'text-gray-900'}`}>{row.value}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowBagEditor(true)} className="w-full mt-4 text-sm text-purple-600 font-bold flex items-center justify-center gap-1 hover:underline">
                <Edit2 size={14}/> Editar información
              </button>
            </div>
          </div>
        )}

        {/* Orders */}
        {activeTab==='orders' && (
          <div className="space-y-3">
            {stats.pendingList.length > 0 ? stats.pendingList.map(order=>(
              <div key={order.id} className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
                <div className="flex justify-between items-start mb-3">
                  <div><p className="text-sm text-gray-500">Orden #{order.code||order.id.slice(-6)}</p><p className="font-bold text-gray-900 text-lg">{order.customerName||'Cliente'}</p></div>
                  <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold">Pendiente</span>
                </div>
                <p className="text-sm text-gray-600 mb-3">Reservado: {formatDate(order.createdAt||order.purchaseDate)}</p>
                <button onClick={()=>confirmOrder(order.id)} className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-colors">Confirmar recogida</button>
              </div>
            )):(
              <div className="text-center py-12 bg-white rounded-2xl shadow-sm"><ShoppingBag size={48} className="mx-auto text-gray-300 mb-4"/><p className="text-gray-500 font-medium">No hay órdenes pendientes</p></div>
            )}
          </div>
        )}

        {/* History */}
        {activeTab==='history' && (
          <div className="space-y-3">
            {stats.completedList.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 flex justify-between items-center">
                <div>
                  <p className="font-bold text-green-800">{stats.completedList.length} bolsas entregadas</p>
                  <p className="text-sm text-green-600">Total recaudado</p>
                </div>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.revenue)}</p>
              </div>
            )}
            {stats.completedList.length > 0 ? stats.completedList.map(order=>(
              <div key={order.id} className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100 flex justify-between items-center">
                <div><p className="font-bold text-gray-900">Orden #{order.code||order.id.slice(-6)}</p><p className="text-sm text-gray-500">{formatDate(order.completedAt)}</p></div>
                <div className="text-right"><p className="font-bold text-green-600">{formatCurrency(order.amount||myMerchant.savePrice)}</p><span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">Completada</span></div>
              </div>
            )):(
              <div className="text-center py-12 bg-white rounded-2xl shadow-sm"><Check size={48} className="mx-auto text-gray-300 mb-4"/><p className="text-gray-500 font-medium">No hay historial aún</p></div>
            )}
          </div>
        )}
        {activeTab==='settings' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
              <h3 className="font-bold text-gray-900 mb-4">Configuración</h3>
              <div className="space-y-3">
                <button onClick={()=>setShowBagEditor(true)} className="w-full flex items-center justify-between p-4 bg-purple-50 border border-purple-200 rounded-xl hover:bg-purple-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <Edit2 className="text-purple-600" size={20}/>
                    <div className="text-left"><p className="font-semibold text-gray-800">Editar mi bolsa</p><p className="text-xs text-gray-500">Nombre, precio, descripción, horario, dirección</p></div>
                  </div>
                  <ChevronRight size={20} className="text-gray-400"/>
                </button>
                <button onClick={()=>{setNewStock(myMerchant.bagsAvailable);setShowStockModal(true);}} className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <Package className="text-gray-600" size={20}/>
                    <div className="text-left"><p className="font-semibold text-gray-800">Cantidad de bolsas</p><p className="text-xs text-gray-500">Actualmente: {myMerchant.bagsAvailable} disponibles</p></div>
                  </div>
                  <ChevronRight size={20} className="text-gray-400"/>
                </button>
              </div>
            </div>
            <button onClick={onLogout} className="w-full bg-red-50 border-2 border-red-200 text-red-600 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-red-100 transition-colors">
              <LogOut size={20}/>Cerrar sesión
            </button>
          </div>
        )}
      </div>

      {/* Bag Editor Modal */}
      {showBagEditor && <BagEditorModal merchant={myMerchant} onSave={saveMerchant} onClose={()=>setShowBagEditor(false)}/>}

      {/* Stock Modal */}
      {showStockModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Actualizar stock</h3>
              <button onClick={()=>setShowStockModal(false)} className="p-2 hover:bg-gray-100 rounded-full"><X size={24}/></button>
            </div>
            <p className="text-gray-600 text-center mb-6">¿Cuántas bolsas tienes disponibles hoy?</p>
            <div className="flex items-center justify-center gap-6 mb-8">
              <button onClick={()=>setNewStock(Math.max(0,newStock-1))} className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center hover:bg-gray-200 text-2xl font-bold">−</button>
              <span className="text-5xl font-bold text-gray-900 w-24 text-center">{newStock}</span>
              <button onClick={()=>setNewStock(newStock+1)} className="w-14 h-14 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center hover:bg-purple-200 text-2xl font-bold">+</button>
            </div>
            <button onClick={()=>updateStock(newStock)} className="w-full bg-purple-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-purple-700 transition-colors">Guardar</button>
          </div>
        </div>
      )}

      {/* QR Scanner */}
      {showQRScanner && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
          <div className="flex justify-between items-center p-4 text-white">
            <h3 className="text-lg font-bold">Escanear código QR</h3>
            <button onClick={()=>setShowQRScanner(false)} className="p-2 hover:bg-white/20 rounded-full"><X size={24}/></button>
          </div>
          <div className="flex-1 flex items-center justify-center p-8">
            {!scanResult ? (
              <div className="text-center">
                <div className="w-64 h-64 border-4 border-blue-500 rounded-3xl flex items-center justify-center mb-6 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-blue-500/20 to-transparent animate-pulse"/>
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                </div>
                <p className="text-white text-lg font-medium">Apunta al código QR del cliente</p>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-6 w-full max-w-sm">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"><Check size={32} className="text-green-600"/></div>
                  <h4 className="text-xl font-bold text-gray-900">¡Código válido!</h4>
                  <p className="text-gray-500">Orden #{scanResult.code}</p>
                </div>
                <div className="space-y-3 mb-6">
                  {[{label:'Cliente',value:scanResult.customerName},{label:'Bolsas',value:scanResult.bags},{label:'Monto',value:formatCurrency(scanResult.amount)}].map(row=>(
                    <div key={row.label} className="flex justify-between p-3 bg-gray-50 rounded-xl"><span className="text-gray-600">{row.label}</span><span className="font-semibold">{row.value}</span></div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button onClick={()=>confirmOrder(scanResult.orderId)} className="flex-1 bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-colors">Confirmar</button>
                  <button onClick={()=>{setScanResult(null);simulateScan();}} className="px-4 py-3 border-2 border-gray-200 rounded-xl font-semibold hover:bg-gray-50">Reescanear</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
