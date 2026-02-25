import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { 
  Mail, Lock, Eye, EyeOff, User, Phone, Store, ArrowRight,
  MapPin, Navigation, Search, CheckCircle, Loader, AlertCircle
} from 'lucide-react';
import { useNotification } from './hooks/useNotification';
import { validateEmail, validatePhone } from './utils/helpers';
import { NotificationContainer } from './components/shared/NotificationContainer';
import { LoadingSpinner } from './components/shared/SkeletonLoader';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { authService, merchantService } from './lib/supabase';

const ClientApp  = lazy(() => import('./components/client/ClientApp').then(m => ({ default: m.ClientApp })));
const MerchantApp = lazy(() => import('./components/merchant/MerchantApp').then(m => ({ default: m.MerchantApp })));

/* ─── Address Picker ─── */
const AddressPicker = ({ value, onChange, error }) => {
  const [query, setQuery]             = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [gpsLoading, setGpsLoading]   = useState(false);
  const [confirmed, setConfirmed]     = useState(!!value);
  const debounceRef                   = useRef(null);

  const searchAddress = async (q) => {
    if (q.length < 4) { setSuggestions([]); return; }
    setLoading(true);
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`, { headers: { 'Accept-Language': 'es' } });
      const data = await res.json();
      setSuggestions(data);
    } catch { setSuggestions([]); }
    finally { setLoading(false); }
  };

  const handleInput = (val) => {
    setQuery(val); setConfirmed(false); onChange(val, null);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchAddress(val), 500);
  };

  const selectSuggestion = (s) => {
    setQuery(s.display_name); setSuggestions([]); setConfirmed(true);
    onChange(s.display_name, { lat: parseFloat(s.lat), lng: parseFloat(s.lon) });
  };

  const useGPS = () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng } = pos.coords;
      try {
        const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'es' } });
        const data = await res.json();
        const addr = data.display_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setQuery(addr); setConfirmed(true); setSuggestions([]);
        onChange(addr, { lat, lng });
      } catch {
        const addr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        setQuery(addr); setConfirmed(true); onChange(addr, { lat, lng });
      }
      setGpsLoading(false);
    }, () => setGpsLoading(false), { timeout: 8000 });
  };

  return (
    <div className="space-y-2">
      <button type="button" onClick={useGPS} disabled={gpsLoading}
        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-green-300 bg-green-50 text-green-700 rounded-xl font-semibold text-sm hover:bg-green-100 transition-colors disabled:opacity-60">
        {gpsLoading ? <><Loader size={16} className="animate-spin"/> Obteniendo...</> : <><Navigation size={16}/> Usar mi ubicación actual</>}
      </button>
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <div className="flex-1 h-px bg-gray-200"/><span>o busca tu dirección</span><div className="flex-1 h-px bg-gray-200"/>
      </div>
      <div className="relative">
        <MapPin className={`absolute left-4 top-3.5 ${confirmed ? 'text-green-500' : 'text-gray-400'}`} size={18}/>
        <input type="text" placeholder="Calle, número, colonia, ciudad..." value={query}
          onChange={e => handleInput(e.target.value)}
          className={`w-full pl-11 pr-10 py-3.5 bg-gray-50 border-2 rounded-xl focus:bg-white focus:border-green-500 outline-none transition-all text-sm ${error ? 'border-red-400' : confirmed ? 'border-green-400' : 'border-gray-200'}`}/>
        <div className="absolute right-4 top-3.5">
          {loading ? <Loader size={16} className="animate-spin text-gray-400"/> : confirmed ? <CheckCircle size={16} className="text-green-500"/> : null}
        </div>
      </div>
      {suggestions.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
          {suggestions.map((s, i) => (
            <button key={i} type="button" onClick={() => selectSuggestion(s)}
              className="w-full text-left px-4 py-3 text-sm hover:bg-green-50 transition-colors border-b border-gray-50 last:border-0 flex items-start gap-2">
              <MapPin size={14} className="text-green-500 mt-0.5 shrink-0"/>
              <span className="text-gray-700 line-clamp-2">{s.display_name}</span>
            </button>
          ))}
        </div>
      )}
      {confirmed && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle size={12}/> Ubicación confirmada</p>}
      {error   && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

/* ─── MAIN APP ─── */
const SaveApp = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser]       = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({
    email: '', password: '', name: '', phone: '',
    businessName: '', businessType: '', businessAddress: '', businessLocation: null,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [authLoading, setAuthLoading]   = useState(false);
  const [errors, setErrors]             = useState({});
  const [sessionLoading, setSessionLoading] = useState(true);

  const { notifications, showNotification, removeNotification } = useNotification();

  // ── Check for existing Supabase session on load ──
  useEffect(() => {
    authService.onAuthChange(async (session) => {
      if (session?.user) {
        const u = session.user;
        const profile = {
          id:           u.id,
          email:        u.email,
          name:         u.user_metadata?.name || u.email.split('@')[0],
          type:         u.user_metadata?.user_type || 'consumer',
          phone:        u.user_metadata?.phone || '',
          businessName: u.user_metadata?.businessName || '',
          businessType: u.user_metadata?.businessType || '',
          avatar:       `https://api.dicebear.com/7.x/avataaars/svg?seed=${u.email}`,
        };
        setUser(profile);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
      setSessionLoading(false);
    });
  }, []);

  useEffect(() => {
    setAuthForm({ email: '', password: '', name: '', phone: '', businessName: '', businessType: '', businessAddress: '', businessLocation: null });
    setErrors({});
  }, [authMode]);

  const validateForm = () => {
    const e = {};
    if (!validateEmail(authForm.email))    e.email    = 'Email inválido';
    if (authForm.password.length < 6)      e.password = 'Mínimo 6 caracteres';
    if (authMode !== 'login') {
      if (!authForm.name.trim())           e.name  = 'Nombre requerido';
      if (!validatePhone(authForm.phone))  e.phone = 'Teléfono inválido (mín. 10 dígitos)';
    }
    if (authMode === 'business') {
      if (!authForm.businessName.trim())   e.businessName = 'Nombre del negocio requerido';
      if (!authForm.businessType)          e.businessType = 'Tipo de negocio requerido';
      if (!authForm.businessAddress.trim()) e.businessAddress = 'La dirección es requerida';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    setAuthLoading(true);

    try {
      if (authMode === 'login') {
        // ── LOGIN con Supabase ──
        const { user: u } = await authService.signIn({
          email:    authForm.email,
          password: authForm.password,
        });
        // onAuthChange will update state automatically
        showNotification(`¡Bienvenido de nuevo! 🎉`);

      } else {
        // ── REGISTRO con Supabase ──
        const userType = authMode === 'business' ? 'merchant' : 'consumer';
        await authService.signUp({
          email:        authForm.email,
          password:     authForm.password,
          name:         authForm.name,
          phone:        authForm.phone,
          userType,
          businessName: authForm.businessName,
          businessType: authForm.businessType,
        });

        // If business, create merchant record in DB
        if (authMode === 'business') {
          // We create the merchant after sign-in since we need the user ID
          // Store form data temporarily to create merchant after auth
          localStorage.setItem('pending-merchant', JSON.stringify({
            name:          authForm.businessName,
            type:          authForm.businessType,
            category:      authForm.businessType,
            address:       authForm.businessAddress,
            location:      authForm.businessLocation || { lat: 19.4326, lng: -99.1332 },
            pickupWindow:  { start: '20:00', end: '22:00' },
            originalPrice: 300, savePrice: 99, bagsAvailable: 5,
            rating: 5.0, reviews: 0, totalSaved: 0, image: '🍽️',
            description:   '¡Edita la descripción de tu bolsa sorpresa desde Configuración!',
            phone:         authForm.phone,
            email:         authForm.email,
            isActive:      true,
            dietary:       [],
          }));
        }

        showNotification('¡Cuenta creada! Revisa tu email para confirmar 📧', 'success');
      }
    } catch (err) {
      console.error('Auth error:', err);
      // Translate common Supabase errors to Spanish
      const msg = err.message || '';
      if (msg.includes('Invalid login credentials'))   showNotification('Email o contraseña incorrectos', 'error');
      else if (msg.includes('Email not confirmed'))    showNotification('Confirma tu email antes de entrar', 'error');
      else if (msg.includes('User already registered')) showNotification('Ya existe una cuenta con ese email', 'error');
      else if (msg.includes('Password should be'))     showNotification('La contraseña debe tener al menos 6 caracteres', 'error');
      else showNotification('Error: ' + msg, 'error');
    } finally {
      setAuthLoading(false);
    }
  };

  // Create pending merchant after business registers and session loads
  useEffect(() => {
    const createPendingMerchant = async () => {
      if (!user || user.type !== 'merchant') return;
      const pending = localStorage.getItem('pending-merchant');
      if (!pending) return;
      try {
        const merchantData = JSON.parse(pending);
        await merchantService.create(merchantData);
        localStorage.removeItem('pending-merchant');
      } catch (err) {
        console.error('Error creating merchant:', err);
      }
    };
    createPendingMerchant();
  }, [user]);

  const handleLogout = async () => {
    try {
      await authService.signOut();
      showNotification('Sesión cerrada');
    } catch {}
  };

  const switchToMerchant = () => { if (user) setUser({ ...user, type: 'merchant' }); };
  const switchToClient   = () => { if (user) setUser({ ...user, type: 'consumer' }); };

  // Show spinner while checking session
  if (sessionLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-green-100 rounded-2xl mx-auto mb-4 flex items-center justify-center text-5xl">🌮</div>
          <LoadingSpinner size="md" />
          <p className="text-gray-500 mt-3 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 flex items-center justify-center p-4">
        <NotificationContainer notifications={notifications} onRemove={removeNotification} />
        
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-600 to-green-500 text-white p-8 text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-0 left-0 w-40 h-40 bg-white rounded-full -translate-x-20 -translate-y-20" />
              <div className="absolute bottom-0 right-0 w-60 h-60 bg-white rounded-full translate-x-30 translate-y-30" />
            </div>
            <div className="relative z-10">
              <div className="w-20 h-20 bg-white/20 rounded-2xl mx-auto mb-4 flex items-center justify-center text-5xl">🌮</div>
              <h1 className="text-4xl font-bold mb-2">Save</h1>
              <p className="text-green-100 text-lg">Salva comida, ahorra dinero</p>
            </div>
          </div>

          <div className="p-8">
            {/* Tabs */}
            <div className="flex mb-6 bg-gray-100 p-1 rounded-xl">
              {[{ id: 'login', label: 'Entrar' }, { id: 'register', label: 'Crear cuenta' }, { id: 'business', label: 'Soy negocio' }].map(m => (
                <button key={m.id} onClick={() => setAuthMode(m.id)}
                  className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-green-500 ${authMode === m.id ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {m.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Email */}
              <div className="relative">
                <Mail className="absolute left-4 top-3.5 text-gray-400" size={18}/>
                <input type="email" placeholder="tu@email.com" value={authForm.email}
                  onChange={e => setAuthForm({...authForm, email: e.target.value})}
                  className={`w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 rounded-xl focus:bg-white focus:border-green-500 outline-none transition-all ${errors.email ? 'border-red-500' : 'border-gray-200'}`}/>
                {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
              </div>

              {/* Password */}
              <div className="relative">
                <Lock className="absolute left-4 top-3.5 text-gray-400" size={18}/>
                <input type={showPassword ? 'text' : 'password'} placeholder="Contraseña (mín. 6 caracteres)" value={authForm.password}
                  onChange={e => setAuthForm({...authForm, password: e.target.value})}
                  className={`w-full pl-12 pr-12 py-3.5 bg-gray-50 border-2 rounded-xl focus:bg-white focus:border-green-500 outline-none transition-all ${errors.password ? 'border-red-500' : 'border-gray-200'}`}/>
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600 focus:outline-none">
                  {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                </button>
                {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
              </div>

              {/* Name + Phone (register & business) */}
              {authMode !== 'login' && (
                <>
                  <div className="relative">
                    <User className="absolute left-4 top-3.5 text-gray-400" size={18}/>
                    <input type="text" placeholder="Nombre completo" value={authForm.name}
                      onChange={e => setAuthForm({...authForm, name: e.target.value})}
                      className={`w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 rounded-xl focus:bg-white focus:border-green-500 outline-none transition-all ${errors.name ? 'border-red-500' : 'border-gray-200'}`}/>
                    {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                  </div>
                  <div className="relative">
                    <Phone className="absolute left-4 top-3.5 text-gray-400" size={18}/>
                    <input type="tel" placeholder="Teléfono (10 dígitos)" value={authForm.phone}
                      onChange={e => setAuthForm({...authForm, phone: e.target.value})}
                      className={`w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 rounded-xl focus:bg-white focus:border-green-500 outline-none transition-all ${errors.phone ? 'border-red-500' : 'border-gray-200'}`}/>
                    {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
                  </div>
                </>
              )}

              {/* Business fields */}
              {authMode === 'business' && (
                <>
                  <div className="relative">
                    <Store className="absolute left-4 top-3.5 text-gray-400" size={18}/>
                    <input type="text" placeholder="Nombre del negocio" value={authForm.businessName}
                      onChange={e => setAuthForm({...authForm, businessName: e.target.value})}
                      className={`w-full pl-12 pr-4 py-3.5 bg-gray-50 border-2 rounded-xl focus:bg-white focus:border-green-500 outline-none transition-all ${errors.businessName ? 'border-red-500' : 'border-gray-200'}`}/>
                    {errors.businessName && <p className="text-xs text-red-500 mt-1">{errors.businessName}</p>}
                  </div>
                  <select value={authForm.businessType} onChange={e => setAuthForm({...authForm, businessType: e.target.value})}
                    className={`w-full px-4 py-3.5 bg-gray-50 border-2 rounded-xl focus:bg-white focus:border-green-500 outline-none transition-all ${errors.businessType ? 'border-red-500' : 'border-gray-200'}`}>
                    <option value="">Tipo de negocio...</option>
                    <option value="restaurant">Restaurante</option>
                    <option value="bakery">Panadería</option>
                    <option value="cafe">Cafetería</option>
                    <option value="grocery">Supermercado</option>
                  </select>
                  {errors.businessType && <p className="text-xs text-red-500 mt-1">{errors.businessType}</p>}
                  <div>
                    <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                      <MapPin size={14} className="text-green-600"/> Ubicación del negocio
                    </p>
                    <AddressPicker value={authForm.businessAddress} error={errors.businessAddress}
                      onChange={(address, location) => setAuthForm(f => ({ ...f, businessAddress: address, businessLocation: location }))}/>
                  </div>
                </>
              )}

              <button type="submit" disabled={authLoading}
                className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg shadow-lg shadow-green-600/30 hover:scale-[1.02] transition-transform disabled:opacity-50 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2">
                {authLoading ? <LoadingSpinner size="sm" /> : <>{authMode === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}<ArrowRight size={20}/></>}
              </button>
            </form>

            {/* Info note */}
            <div className="mt-5 bg-blue-50 border border-blue-100 rounded-xl p-3 flex gap-2">
              <AlertCircle size={16} className="text-blue-500 shrink-0 mt-0.5"/>
              <p className="text-xs text-blue-700">
                {authMode === 'login'
                  ? 'Al crear tu cuenta recibirás un email de confirmación. Debes confirmarlo antes de entrar.'
                  : 'Tus datos se guardan de forma segura en la nube. Podrás acceder desde cualquier dispositivo.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSpinner fullScreen />}>
        {user?.type === 'merchant' ? (
          <MerchantApp user={user} onLogout={handleLogout} onSwitchToClient={switchToClient}/>
        ) : (
          <ClientApp user={user} onLogout={handleLogout} onSwitchToMerchant={switchToMerchant}/>
        )}
      </Suspense>
    </ErrorBoundary>
  );
};

export default SaveApp;
