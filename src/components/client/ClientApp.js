import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { 
  Home, User, ShoppingBag, Search, Map as MapIcon, SlidersHorizontal,
  X, ChevronRight, Clock, Navigation, Star, QrCode, Settings, LogOut,
  Leaf, Check, Clock as ClockIcon, Phone, MapPin, Info, AlertCircle, Store
} from 'lucide-react';
import { useLocalStorage, writeLocalStorage, readLocalStorage } from '../../hooks/useLocalStorage';
import { merchantService, orderService, favoriteService } from '../../lib/supabase';
import { useGeolocation } from '../../hooks/useGeolocation';
import { useNotification } from '../../hooks/useNotification';
import { useDebounce } from '../../hooks/useDebounce';
import { usePullToRefresh } from '../../hooks/usePullToRefresh';
import { useAnalytics } from '../../hooks/useAnalytics';
import { MOCK_MERCHANTS } from '../../utils/mockData';
import { 
  formatCurrency, formatDate, getTimeRemaining, 
  getGoogleMapsUrl, calculateDistance, generateQRData,
  generatePickupCode
} from '../../utils/helpers';
import { CATEGORIES, APP_CONFIG } from '../../utils/constants';
import { NotificationContainer } from '../shared/NotificationContainer';
import { CategoryFilter } from '../shared/CategoryFilter';
import { QRCodeDisplay } from '../shared/QRCodeDisplay';
import { LoadingSpinner, ListSkeleton } from '../shared/SkeletonLoader';
import { MapView } from './MapView';
import { MerchantCard, CompactMerchantCard, FeaturedCarousel } from './MerchantCard';

const MerchantModal = lazy(() => import('./MerchantModal'));

export const ClientApp = ({ user, onLogout, onSwitchToMerchant }) => {
  // ── Use user-scoped storage keys so each account is isolated ──
  const uid = user?.id || 'guest';
  const [savedBags, setSavedBags] = useLocalStorage(`save-bags-${uid}`, []);
  const [favorites, setFavorites] = useLocalStorage(`save-favorites-${uid}`, []);
  const [activeTab, setActiveTab] = useState('home');
  const [feedbackBag, setFeedbackBag] = useState(null); // bag awaiting star rating
  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedBagForQR, setSelectedBagForQR] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAllFeatured, setShowAllFeatured] = useState(false);

  // Merge MOCK_MERCHANTS with any merchant registered via the business mode
  const buildMerchantList = () => {
    const saved = localStorage.getItem('save-merchant');
    if (!saved) return MOCK_MERCHANTS;
    try {
      const biz = JSON.parse(saved);
      // Give it a stable string id so it doesn't collide with numeric mock ids
      const bizEntry = {
        ...biz,
        id: biz.id || 'biz_registered',
        dietary: biz.dietary || [],
        distance: biz.distance || 0.5,
        rating: biz.rating || 5.0,
        reviews: biz.reviews || 0,
        totalSaved: biz.totalSaved || 0,
        isPopular: false,
        isNew: true,
        badges: biz.verified ? ['Verificado ✓'] : ['Pendiente'],
        coverImage: biz.coverImage || null,  // ← preserve photo uploaded by merchant
      };
      // Replace if already in list, otherwise prepend
      const already = MOCK_MERCHANTS.find(m => String(m.id) === String(biz.id));
      if (already) return MOCK_MERCHANTS.map(m => String(m.id) === String(biz.id) ? bizEntry : m);
      return [bizEntry, ...MOCK_MERCHANTS];
    } catch { return MOCK_MERCHANTS; }
  };

  const [merchants, setMerchants] = useState(buildMerchantList);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [priceRange, setPriceRange] = useState([0, 1000]);
  const [dietaryFilters, setDietaryFilters] = useState([]);
  const [sortBy, setSortBy] = useState('distance');
  const [pickupDay, setPickupDay] = useState('any');
  const [pickupTimeStart, setPickupTimeStart] = useState('');
  const [pickupTimeEnd, setPickupTimeEnd] = useState('');
  
  const { location: userLocation, refreshLocation, error: locationError } = useGeolocation();
  const { notifications, showNotification, removeNotification, withLoading } = useNotification();
  const debouncedSearch = useDebounce(searchTerm, APP_CONFIG.DEBOUNCE_DELAY);
  const { trackEvent, trackPurchase } = useAnalytics();

  const { refreshing, handleTouchStart, handleTouchMove, handleTouchEnd } = usePullToRefresh(async () => {
    await refreshMerchants();
  });

  const refreshMerchants = useCallback(async () => {
    setIsLoading(true);
    try {
      // Try Supabase first
      const cloudMerchants = await merchantService.getAll();
      if (cloudMerchants && cloudMerchants.length > 0) {
        // Merge with mock data so demo merchants still show
        const cloudIds = new Set(cloudMerchants.map(m => String(m.id)));
        const filtered = MOCK_MERCHANTS.filter(m => !cloudIds.has(String(m.id)));
        setMerchants([...cloudMerchants, ...filtered]);
      } else {
        setMerchants(buildMerchantList());
      }
    } catch {
      // Supabase unavailable — use localStorage fallback
      setMerchants(buildMerchantList());
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load merchants from Supabase on first render
  useEffect(() => { refreshMerchants(); }, []); // eslint-disable-line

  useEffect(() => {
    if (userLocation) {
      setMerchants(prev => prev.map(m => ({
        ...m,
        distance: calculateDistance(
          userLocation.lat, userLocation.lng,
          m.location.lat, m.location.lng
        ) || m.distance
      })));
    }
  }, [userLocation]);

  useEffect(() => {
    trackEvent('page_view', { page: activeTab });
  }, [activeTab, trackEvent]);

  const toggleFavorite = useCallback(async (merchantId) => {
    const isFav = favorites.includes(merchantId);
    const newFavorites = isFav
      ? favorites.filter(id => id !== merchantId)
      : [...favorites, merchantId];
    
    setFavorites(newFavorites);
    showNotification(isFav ? 'Eliminado de favoritos' : 'Agregado a favoritos');
    trackEvent('toggle_favorite', { merchantId, action: isFav ? 'remove' : 'add' });
  }, [favorites, setFavorites, showNotification, trackEvent]);

  // ── Shared order helpers — use writeLocalStorage so MerchantApp React state updates instantly ──
  const readOrders  = () => readLocalStorage('save-orders', []);
  const writeOrders = (orders) => writeLocalStorage('save-orders', orders);

  const handlePurchase = useCallback(async (merchant) => {
    if (merchant.bagsAvailable <= 0) {
      showNotification('No hay bolsas disponibles', 'error');
      return;
    }

    try {
      const orderId    = `bag_${Date.now()}`;
      const pickupCode = generatePickupCode();
      const qrData     = generateQRData(Date.now(), merchant.id);

      // Always build the client-side bag object with the correct shape
      const newBag = {
        id:           orderId,
        merchant:     { ...merchant },
        purchaseDate: new Date().toISOString(),
        createdAt:    new Date().toISOString(),
        status:       'reserved',
        code:         pickupCode,
        pickupCode,
        qrData,
        amount:       merchant.savePrice,
      };

      // Always write to localStorage orders so MerchantApp sees it
      const order = {
        id:           orderId,
        merchantId:   merchant.id,
        customerName: user?.name || 'Cliente',
        code:         pickupCode,
        bags:         1,
        amount:       merchant.savePrice,
        status:       'pending',
        createdAt:    new Date().toISOString(),
      };
      writeOrders([order, ...readOrders()]);

      // Update merchant stock in localStorage
      const bizData = readLocalStorage('save-merchant');
      if (bizData && String(bizData.id) === String(merchant.id)) {
        bizData.bagsAvailable = Math.max(0, (bizData.bagsAvailable || 1) - 1);
        bizData.totalSaved    = (bizData.totalSaved || 0) + 1;
        writeLocalStorage('save-merchant', bizData);
      }

      // Also try to save to Supabase in the background (non-blocking)
      orderService.create({ merchantId: merchant.id, merchant, amount: merchant.savePrice, code: pickupCode, qrData })
        .catch(() => {}); // ignore errors — localStorage already has it

      // Update UI state
      setSavedBags(prev => [newBag, ...prev]);
      setMerchants(prev => prev.map(m =>
        m.id === merchant.id
          ? { ...m, bagsAvailable: m.bagsAvailable - 1, totalSaved: (m.totalSaved || 0) + 1 }
          : m
      ));

      trackPurchase(merchant, merchant.savePrice);
      setSelectedMerchant(null);
      setActiveTab('bags');
      showNotification('¡Bolsa reservada! Revisa tu código QR 🎉', 'success');
    } catch (error) {
      showNotification('Error al reservar. Intenta de nuevo.', 'error');
    }
  }, [setSavedBags, showNotification, trackPurchase, user]);

  const markAsCollected = useCallback((bagId) => {
    const collectedAt = new Date().toISOString();
    setSavedBags(prev => prev.map(bag =>
      bag.id === bagId ? { ...bag, status: 'collected', collectedDate: collectedAt } : bag
    ));
    // Update in Supabase (try) and localStorage (always)
    orderService.complete(bagId).catch(() => {});
    const orders = readOrders();
    writeOrders(orders.map(o =>
      o.id === bagId ? { ...o, status: 'completed', completedAt: collectedAt } : o
    ));
    // Open feedback modal
    const bag = savedBags.find(b => b.id === bagId);
    if (bag) setTimeout(() => setFeedbackBag({ ...bag, status: 'collected', collectedDate: collectedAt }), 400);
    trackEvent('bag_collected', { bagId });
  }, [setSavedBags, savedBags, trackEvent]);

  const cancelReservation = useCallback((bagId) => {
    const bag = savedBags.find(b => b.id === bagId);
    if (!bag) return;

    if (window.confirm('¿Estás seguro de cancelar esta reserva?')) {
      // Remove from client bags
      setSavedBags(prev => prev.filter(b => b.id !== bagId));

      // Remove from save-orders so merchant doesn't see a ghost order
      writeOrders(readOrders().filter(o => o.id !== bagId));

      // Restore stock on client display
      setMerchants(prev => prev.map(m =>
        m.id === bag.merchant.id
          ? { ...m, bagsAvailable: m.bagsAvailable + 1 }
          : m
      ));

      // Restore stock in localStorage so MerchantApp reflects it
      const bizData = readLocalStorage('save-merchant');
      if (bizData && String(bizData.id) === String(bag.merchant.id)) {
        bizData.bagsAvailable = (bizData.bagsAvailable || 0) + 1;
        writeLocalStorage('save-merchant', bizData);
      }

      showNotification('Reserva cancelada');
      trackEvent('reservation_cancelled', { bagId });
    }
  }, [savedBags, setSavedBags, showNotification, trackEvent]);

  const filteredMerchants = useMemo(() => {
    let filtered = merchants.filter(m => {
      const matchesSearch = 
        m.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        m.type.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchesCategory = 
        selectedCategory === 'all' || 
        m.category === selectedCategory ||
        (selectedCategory === 'vegan' && m.dietary.includes('vegan')) ||
        (selectedCategory === 'organic' && m.dietary.includes('organic')) ||
        (selectedCategory === 'premium' && m.originalPrice > 500);
      const matchesPrice = m.savePrice >= priceRange[0] && m.savePrice <= priceRange[1];
      const matchesDietary = dietaryFilters.length === 0 || dietaryFilters.every(d => m.dietary.includes(d));
      const matchesFavorites = !showOnlyFavorites || favorites.includes(m.id);

      // Pickup time filter: check if the merchant's window overlaps with the desired range
      let matchesTime = true;
      if (pickupTimeStart || pickupTimeEnd) {
        const mStart = m.pickupWindow?.start || '00:00';
        const mEnd   = m.pickupWindow?.end   || '23:59';
        if (pickupTimeStart && mEnd < pickupTimeStart) matchesTime = false;
        if (pickupTimeEnd   && mStart > pickupTimeEnd) matchesTime = false;
      }

      return matchesSearch && matchesCategory && matchesPrice && matchesDietary && matchesFavorites && matchesTime;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'distance': return (a.distance || 0) - (b.distance || 0);
        case 'price': return a.savePrice - b.savePrice;
        case 'rating': return b.rating - a.rating;
        case 'savings': return (b.originalPrice - b.savePrice) - (a.originalPrice - a.savePrice);
        default: return 0;
      }
    });

    return filtered;
  }, [merchants, debouncedSearch, selectedCategory, priceRange, dietaryFilters, sortBy, showOnlyFavorites, favorites, pickupTimeStart, pickupTimeEnd]);

  // ── Feedback / Rating ──
  const submitFeedback = useCallback((bagId, rating, comment) => {
    setSavedBags(prev => prev.map(b =>
      b.id === bagId ? { ...b, rating, feedbackComment: comment, feedbackDate: new Date().toISOString() } : b
    ));
    // Update merchant rating
    try {
      const biz = readLocalStorage('save-merchant');
      if (biz) {
        const allBags = readLocalStorage(`save-bags-${uid}`, []);
        const ratings = allBags.filter(b => b.rating && String(b.merchant.id) === String(biz.id)).map(b => b.rating);
        if (rating && String(feedbackBag?.merchant?.id) === String(biz.id)) ratings.push(rating);
        if (ratings.length) {
          biz.rating  = parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1));
          biz.reviews = ratings.length;
          writeLocalStorage('save-merchant', biz);
        }
      }
    } catch {}
    setFeedbackBag(null);
    showNotification('¡Gracias por tu opinión! 🌟', 'success');
  }, [setSavedBags, feedbackBag, uid, showNotification]);

  /* ─── Feedback Modal ─── */
  const FeedbackModal = () => {
    const [hoveredStar, setHoveredStar] = useState(0);
    const [chosenStar,  setChosenStar]  = useState(0);
    const [comment, setComment]         = useState('');
    if (!feedbackBag) return null;
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[70] flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-sm rounded-3xl p-6 animate-scaleIn">
          <div className="text-center mb-5">
            <div className="w-16 h-16 bg-green-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3">
              {feedbackBag.merchant.image}
            </div>
            <h3 className="text-xl font-bold text-gray-900">¡Bolsa recogida! 🎉</h3>
            <p className="text-gray-500 text-sm mt-1">¿Cómo fue tu experiencia en <span className="font-semibold text-gray-700">{feedbackBag.merchant.name}</span>?</p>
          </div>

          {/* Stars */}
          <div className="flex justify-center gap-3 mb-5">
            {[1,2,3,4,5].map(s => (
              <button key={s}
                onMouseEnter={() => setHoveredStar(s)}
                onMouseLeave={() => setHoveredStar(0)}
                onClick={() => setChosenStar(s)}
                className="transition-transform hover:scale-125 active:scale-110">
                <Star size={36}
                  className={`transition-colors ${s <= (hoveredStar || chosenStar) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-200'}`}/>
              </button>
            ))}
          </div>
          {chosenStar > 0 && (
            <p className="text-center text-sm font-semibold text-gray-600 -mt-2 mb-4">
              {['','😞 Muy malo','😕 Malo','😐 Regular','😊 Bueno','🤩 ¡Excelente!'][chosenStar]}
            </p>
          )}

          {/* Comment */}
          <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
            placeholder="¿Algo que quieras compartir? (opcional)"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:border-green-500 focus:outline-none resize-none mb-4"/>

          <div className="flex gap-3">
            <button onClick={() => { setFeedbackBag(null); showNotification('¡Comida recogida! Gracias por salvar el planeta 🌱', 'success'); }}
              className="flex-1 py-3 border-2 border-gray-200 text-gray-500 rounded-xl font-semibold text-sm hover:bg-gray-50">
              Omitir
            </button>
            <button onClick={() => submitFeedback(feedbackBag.id, chosenStar || null, comment)}
              disabled={chosenStar === 0}
              className="flex-1 py-3 bg-green-600 text-white rounded-xl font-bold shadow-lg shadow-green-600/30 hover:bg-green-700 disabled:opacity-40 transition-colors">
              Enviar ⭐
            </button>
          </div>
        </div>
      </div>
    );
  };

  const HomeView = () => (
    <div 
      className="pb-24 min-h-screen bg-gray-50"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {refreshing && (
        <div className="flex justify-center py-2">
          <LoadingSpinner size="sm" />
        </div>
      )}

      <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-600 text-white p-6 pb-8 rounded-b-[2.5rem] shadow-xl relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full translate-x-1/3 -translate-y-1/2 blur-3xl" />
        </div>
        
        <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-green-100 text-sm font-medium mb-1">¡Hola de nuevo! 👋</p>
              <h1 className="text-2xl font-bold">{user?.name?.split(' ')[0] || 'Héroe'}</h1>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowMap(true)}
                className="w-10 h-10 bg-white/20 backdrop-blur rounded-full flex items-center justify-center hover:bg-white/30 transition-colors focus:outline-none focus:ring-2 focus:ring-white"
                aria-label="Ver mapa"
              >
                <MapIcon size={20} />
              </button>
              <button 
                onClick={() => setActiveTab('profile')}
                className="w-10 h-10 bg-white/20 backdrop-blur rounded-full flex items-center justify-center hover:bg-white/30 transition-colors focus:outline-none focus:ring-2 focus:ring-white overflow-hidden"
                aria-label="Perfil"
              >
                {user?.avatar ? (
                  <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                ) : (
                  <User size={20} />
                )}
              </button>
            </div>
          </div>
          
          <div className="relative">
            <Search className="absolute left-4 top-3.5 text-gray-400" size={20} aria-hidden="true" />
            <input
              type="text"
              placeholder="¿Qué te antoja hoy?"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-12 py-3.5 rounded-2xl text-gray-800 placeholder-gray-400 bg-white shadow-lg focus:outline-none focus:ring-4 focus:ring-white/30 transition-all"
              aria-label="Buscar negocios"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600 focus:outline-none"
                aria-label="Limpiar búsqueda"
              >
                <X size={20} />
              </button>
            )}
          </div>

          {/* Kilos de comida salvados — global counter */}
          {(() => {
            const totalBags = merchants.reduce((acc, m) => acc + (m.totalSaved || 0), 0);
            const kilos = (totalBags * 1.8).toFixed(0); // ~1.8 kg por bolsa promedio
            return totalBags > 0 ? (
              <div className="mt-4 bg-white/20 backdrop-blur rounded-2xl px-4 py-2.5 flex items-center gap-3">
                <span className="text-2xl">🌍</span>
                <div>
                  <p className="text-white font-bold text-sm">{parseFloat(kilos).toLocaleString()} kg de comida salvados</p>
                  <p className="text-green-100 text-xs">entre toda la comunidad Save · ¡sé parte!</p>
                </div>
              </div>
            ) : null;
          })()}
        </div>
      </div>

      <div className="px-4 -mt-6 relative z-20">
        <div className="bg-white rounded-2xl shadow-lg p-3 mb-4">
          {/* Scrollable categories with arrow indicators */}
          <div className="relative">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide scroll-smooth snap-x">
              {/* Favorites toggle as first pill */}
              <button
                onClick={() => setShowOnlyFavorites(f => !f)}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full whitespace-nowrap shrink-0 transition-all border font-semibold text-sm snap-start ${
                  showOnlyFavorites
                    ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/30'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-red-300 hover:bg-red-50'
                }`}
              >
                <span className="text-base">❤️</span>
                Favoritos
              </button>

              {/* Category pills */}
              {[
                { id: 'all',        name: 'Todo',        icon: '🍽️' },
                { id: 'bakery',     name: 'Panadería',   icon: '🥐' },
                { id: 'restaurant', name: 'Restaurante', icon: '🍽️' },
                { id: 'cafe',       name: 'Café',        icon: '☕' },
                { id: 'grocery',    name: 'Super',       icon: '🥬' },
                { id: 'vegan',      name: 'Vegano',      icon: '🌱' },
                { id: 'organic',    name: 'Orgánico',    icon: '🌿' },
                { id: 'premium',    name: 'Premium',     icon: '💎' },
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full whitespace-nowrap shrink-0 transition-all border font-semibold text-sm snap-start ${
                    selectedCategory === cat.id
                      ? 'bg-green-600 text-white border-green-600 shadow-lg shadow-green-600/30'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-green-300 hover:bg-green-50'
                  }`}
                >
                  <span className="text-base">{cat.icon}</span>
                  {cat.name}
                </button>
              ))}
            </div>
            {/* Fade indicator on right */}
            <div className="absolute right-0 top-0 bottom-1 w-10 bg-gradient-to-l from-white to-transparent pointer-events-none rounded-r-xl" />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mb-4">
          <button 
            onClick={() => setShowMap(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-full text-sm font-bold whitespace-nowrap shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-colors"
          >
            <MapIcon size={16} />
            Ver mapa
          </button>
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all ${
              showFilters || pickupDay !== 'any' || pickupTimeStart || pickupTimeEnd
                ? 'bg-green-600 text-white shadow-lg shadow-green-600/30'
                : 'bg-white text-gray-700 shadow-sm border border-gray-200 hover:border-green-300'
            }`}
          >
            <SlidersHorizontal size={16} />
            Filtros
            {(pickupDay !== 'any' || pickupTimeStart || pickupTimeEnd || dietaryFilters.length > 0) && (
              <span className="w-5 h-5 bg-white text-green-600 rounded-full text-xs font-bold flex items-center justify-center">
                {[pickupDay !== 'any', !!pickupTimeStart, !!pickupTimeEnd, ...dietaryFilters.map(() => true)].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>

        {/* ── Filters panel ── */}
        {showFilters && (
          <div className="bg-white rounded-2xl shadow-lg p-5 mb-5 animate-slideDown">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold text-gray-900 text-base">Filtros</h3>
              <button
                onClick={() => {
                  setPriceRange([0, 1000]);
                  setDietaryFilters([]);
                  setSortBy('distance');
                  setPickupDay('any');
                  setPickupTimeStart('');
                  setPickupTimeEnd('');
                }}
                className="text-sm text-green-600 font-semibold hover:text-green-700"
              >
                Limpiar todo
              </button>
            </div>

            {/* Día de recogida */}
            <div className="mb-5">
              <p className="text-sm font-semibold text-gray-700 mb-2">📅 Día de recogida</p>
              <div className="flex gap-2">
                {[
                  { id: 'any',      label: 'Cualquier día' },
                  { id: 'today',    label: 'Hoy' },
                  { id: 'tomorrow', label: 'Mañana' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setPickupDay(opt.id)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                      pickupDay === opt.id
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-green-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Horario */}
            <div className="mb-5">
              <p className="text-sm font-semibold text-gray-700 mb-2">🕐 Horario de recogida</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Desde</label>
                  <input
                    type="time"
                    value={pickupTimeStart}
                    onChange={e => setPickupTimeStart(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-50 focus:border-green-500 focus:outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Hasta</label>
                  <input
                    type="time"
                    value={pickupTimeEnd}
                    onChange={e => setPickupTimeEnd(e.target.value)}
                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-xl bg-gray-50 focus:border-green-500 focus:outline-none text-sm"
                  />
                </div>
              </div>
              {(pickupTimeStart || pickupTimeEnd) && (
                <button onClick={() => { setPickupTimeStart(''); setPickupTimeEnd(''); }}
                  className="text-xs text-gray-400 mt-1 hover:text-red-500">
                  Limpiar horario ✕
                </button>
              )}
            </div>

            {/* Tipo de comida (categoría) */}
            <div className="mb-5">
              <p className="text-sm font-semibold text-gray-700 mb-2">🍽️ Tipo de comida</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'restaurant', label: '🍽️ Restaurante' },
                  { id: 'bakery',     label: '🥐 Panadería'   },
                  { id: 'cafe',       label: '☕ Café'         },
                  { id: 'grocery',    label: '🥬 Supermercado' },
                  { id: 'premium',    label: '💎 Premium'      },
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(prev => prev === cat.id ? 'all' : cat.id)}
                    className={`px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                      selectedCategory === cat.id
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-green-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dieta */}
            <div className="mb-5">
              <p className="text-sm font-semibold text-gray-700 mb-2">🌱 Preferencias dietéticas</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: 'vegetarian', label: '🥬 Vegetariano' },
                  { id: 'vegan',      label: '🌱 Vegano'      },
                  { id: 'organic',    label: '🌿 Orgánico'    },
                  { id: 'gluten-free',label: '🌾 Sin gluten'  },
                  { id: 'pescatarian',label: '🐟 Pescetariano'},
                ].map(diet => (
                  <button
                    key={diet.id}
                    onClick={() => setDietaryFilters(prev =>
                      prev.includes(diet.id) ? prev.filter(d => d !== diet.id) : [...prev, diet.id]
                    )}
                    className={`px-3 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
                      dietaryFilters.includes(diet.id)
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-green-300'
                    }`}
                  >
                    {diet.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Precio */}
            <div className="mb-5">
              <p className="text-sm font-semibold text-gray-700 mb-2">
                💰 Precio máximo: <span className="text-green-600">{formatCurrency(priceRange[1])}</span>
              </p>
              <input
                type="range" min="0" max="1000" value={priceRange[1]}
                onChange={e => setPriceRange([0, parseInt(e.target.value)])}
                className="w-full accent-green-600"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>$0</span><span>$1,000</span>
              </div>
            </div>

            {/* Ordenar */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-2">📊 Ordenar por</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'distance', label: '📍 Más cercano'    },
                  { id: 'price',    label: '💰 Menor precio'   },
                  { id: 'rating',   label: '⭐ Mejor rating'   },
                  { id: 'savings',  label: '🏷️ Mayor ahorro'   },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setSortBy(opt.id)}
                    className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-all ${
                      sortBy === opt.id
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:border-green-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {locationError && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
            <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-amber-800 font-medium">No pudimos obtener tu ubicación</p>
              <p className="text-amber-600 text-sm mb-2">{locationError}</p>
              <button 
                onClick={refreshLocation}
                className="text-amber-800 font-semibold text-sm underline"
              >
                Intentar de nuevo
              </button>
            </div>
          </div>
        )}

        {filteredMerchants.filter(m => m.isPopular).length > 0 && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-xl font-bold text-gray-900">Destacados 🔥</h2>
              <span className="text-xs text-gray-400 font-medium">desliza →</span>
            </div>
            <FeaturedCarousel
              merchants={filteredMerchants.filter(m => m.isPopular)}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
              onClick={setSelectedMerchant}
              userLocation={userLocation}
            />
          </div>
        )}

        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            {showOnlyFavorites ? 'Mis favoritos ❤️' : 'Todos los negocios 📍'}
            <span className="text-sm font-normal text-gray-400 ml-2">({filteredMerchants.length})</span>
          </h2>
          
          {isLoading ? (
            <ListSkeleton count={4} />
          ) : showOnlyFavorites && filteredMerchants.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl shadow-sm">
              <span className="text-5xl mb-4 block">❤️</span>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Sin favoritos aún</h3>
              <p className="text-gray-500 mb-4">Toca el corazón en cualquier negocio para guardarlo aquí</p>
              <button onClick={() => setShowOnlyFavorites(false)} className="text-green-600 font-semibold hover:text-green-700">
                Ver todos los negocios
              </button>
            </div>
          ) : filteredMerchants.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filteredMerchants.map(merchant => (
                <CompactMerchantCard
                  key={merchant.id}
                  merchant={merchant}
                  onClick={() => setSelectedMerchant(merchant)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-2xl shadow-sm">
              <Search size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">No encontramos resultados</h3>
              <p className="text-gray-500 mb-4">Intenta con otros filtros o búsqueda</p>
              <button 
                onClick={() => {
                  setSearchTerm('');
                  setSelectedCategory('all');
                  setDietaryFilters([]);
                  setPriceRange([0, 1000]);
                  setSortBy('distance');
                  setShowOnlyFavorites(false);
                  setPickupDay('any');
                  setPickupTimeStart('');
                  setPickupTimeEnd('');
                }}
                className="text-green-600 font-semibold hover:text-green-700 focus:outline-none focus:underline"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const BagsView = () => {
    const activeBags = savedBags.filter(b => b.status === 'reserved');
    const collectedBags = savedBags.filter(b => b.status === 'collected');
    const [activeTabBags, setActiveTabBags] = useState('active');

    return (
      <div className="p-4 pb-24 min-h-screen bg-gray-50">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Mis Bolsas</h1>
          <div className="flex gap-2" role="tablist">
            <button 
              onClick={() => setActiveTabBags('active')}
              role="tab"
              aria-selected={activeTabBags === 'active'}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-green-500 ${
                activeTabBags === 'active' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              Activas ({activeBags.length})
            </button>
            <button 
              onClick={() => setActiveTabBags('history')}
              role="tab"
              aria-selected={activeTabBags === 'history'}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-all focus:outline-none focus:ring-2 focus:ring-green-500 ${
                activeTabBags === 'history' ? 'bg-green-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              Historial ({collectedBags.length})
            </button>
          </div>
        </div>
        
        {activeBags.length === 0 && collectedBags.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-24 h-24 bg-gradient-to-br from-green-100 to-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShoppingBag size={48} className="text-green-600" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-3">No tienes bolsas aún</h3>
            <p className="text-gray-500 mb-6">Explora negocios y rescata comida del desperdicio</p>
            <button 
              onClick={() => setActiveTab('home')}
              className="bg-green-600 text-white px-8 py-4 rounded-full font-bold text-lg shadow-lg shadow-green-600/30 hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              Explorar negocios
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {activeTabBags === 'active' ? (
              activeBags.length > 0 ? (
                activeBags.map(bag => {
                  const timeRemaining = getTimeRemaining(bag.merchant.pickupWindow.end);
                  const isUrgent = timeRemaining.hours < 2;

                  return (
                    <div key={bag.id} className="bg-white rounded-3xl shadow-lg overflow-hidden border-2 border-green-100">
                      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white p-6 relative overflow-hidden">
                        <div className="relative z-10 flex justify-between items-start">
                          <div>
                            <p className="text-green-100 text-sm font-medium mb-1">Código de recogida</p>
                            <p className="text-4xl font-bold tracking-widest font-mono">{bag.pickupCode}</p>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedBagForQR(bag);
                              setShowQRModal(true);
                            }}
                            className="bg-white/20 backdrop-blur p-3 rounded-2xl hover:bg-white/30 transition-colors focus:outline-none focus:ring-2 focus:ring-white"
                            aria-label="Ver código QR"
                          >
                            <QrCode size={32} />
                          </button>
                        </div>
                      </div>

                      <div className="p-5">
                        <div className="flex items-start gap-4 mb-5">
                          <div className="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-50 rounded-2xl flex items-center justify-center text-3xl">
                            {bag.merchant.image}
                          </div>
                          <div className="flex-1">
                            <h3 className="font-bold text-lg text-gray-900">{bag.merchant.name}</h3>
                            <p className="text-sm text-gray-500 mb-1">{bag.merchant.type}</p>
                            <button
                              onClick={() => {
                                const url = getGoogleMapsUrl(
                                  bag.merchant.location.lat,
                                  bag.merchant.location.lng,
                                  userLocation?.lat,
                                  userLocation?.lng
                                );
                                window.open(url, '_blank');
                              }}
                              className="flex items-center gap-1 text-sm text-blue-600 font-semibold hover:text-blue-700 focus:outline-none focus:underline"
                            >
                              <Navigation size={14} />
                              Cómo llegar
                            </button>
                          </div>
                        </div>
                        
                        <div className={`rounded-2xl p-4 mb-5 ${isUrgent ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-gray-700">Horario de recogida</span>
                            <span className={`text-sm font-bold ${isUrgent ? 'text-red-600' : 'text-green-600'}`}>
                              {isUrgent ? `¡${timeRemaining.hours}h ${timeRemaining.minutes}m!` : 'Hoy'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-900">
                            <ClockIcon size={18} className={isUrgent ? 'text-red-500' : 'text-green-600'} />
                            <span className="font-bold text-lg">
                              {bag.merchant.pickupWindow.start} - {bag.merchant.pickupWindow.end}
                            </span>
                          </div>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() => markAsCollected(bag.id)}
                            className="flex-1 bg-green-600 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-green-600/30 hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                          >
                            Marcar recogida
                          </button>
                          <button
                            onClick={() => cancelReservation(bag.id)}
                            className="px-4 py-3.5 border-2 border-gray-200 text-gray-600 rounded-xl font-semibold hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 bg-white rounded-2xl shadow-sm">
                  <Clock size={48} className="mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500 font-medium">No tienes bolsas activas</p>
                </div>
              )
            ) : (
              collectedBags.length > 0 ? (
                <div className="space-y-4">
                  {/* Summary card */}
                  <div className="bg-gradient-to-br from-green-600 to-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-green-600/20">
                    <p className="text-green-100 text-sm font-medium mb-1">Tu resumen total</p>
                    <p className="text-3xl font-bold mb-3">
                      {formatCurrency(collectedBags.reduce((acc, b) => acc + (b.merchant.originalPrice - b.merchant.savePrice), 0))}
                      <span className="text-lg font-normal text-green-200 ml-1">ahorrados</span>
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: collectedBags.length, label: 'Bolsas' },
                        { value: `${(collectedBags.length * 2.5).toFixed(1)} kg`, label: 'CO₂ evitado' },
                        { value: `${collectedBags.length * 150}L`, label: 'Agua' },
                      ].map(s => (
                        <div key={s.label} className="bg-white/15 rounded-xl p-2 text-center">
                          <p className="font-bold text-sm">{s.value}</p>
                          <p className="text-xs text-green-200">{s.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Order list */}
                  {collectedBags.map(bag => {
                    const saved = bag.merchant.originalPrice - bag.merchant.savePrice;
                    const discount = Math.round((saved / bag.merchant.originalPrice) * 100);
                    return (
                      <div key={bag.id} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-100">
                        {/* Header */}
                        <div className="flex items-center gap-3 p-4 border-b border-gray-50">
                          <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center text-2xl shrink-0">
                            {bag.merchant.image}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-gray-900 truncate">{bag.merchant.name}</h4>
                            <p className="text-xs text-gray-500">{bag.merchant.type}</p>
                          </div>
                          <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                            ✓ Recogida
                          </span>
                        </div>

                        {/* Details grid */}
                        <div className="grid grid-cols-2 gap-px bg-gray-100">
                          {[
                            { label: 'Pagaste',    value: formatCurrency(bag.merchant.savePrice), color: 'text-gray-900' },
                            { label: 'Ahorraste',  value: formatCurrency(saved),                  color: 'text-green-600' },
                            { label: 'Código',     value: bag.pickupCode || bag.code,             color: 'text-gray-700 font-mono tracking-widest' },
                            { label: 'Descuento',  value: `-${discount}%`,                        color: 'text-green-600' },
                          ].map(row => (
                            <div key={row.label} className="bg-white px-4 py-3">
                              <p className="text-xs text-gray-400 mb-0.5">{row.label}</p>
                              <p className={`font-bold text-sm ${row.color}`}>{row.value}</p>
                            </div>
                          ))}
                        </div>

                        {/* Footer dates */}
                        <div className="flex justify-between px-4 py-3 bg-gray-50 text-xs text-gray-400">
                          <span>📅 Reservado: {formatDate(bag.purchaseDate)}</span>
                          <span>✅ Recogido: {formatDate(bag.collectedDate)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
                  <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Clock size={36} className="text-gray-300" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">Sin historial aún</h3>
                  <p className="text-gray-500 text-sm mb-4">Tus bolsas recogidas aparecerán aquí</p>
                  <button onClick={() => setActiveTab('home')}
                    className="bg-green-600 text-white px-6 py-3 rounded-full font-bold text-sm hover:bg-green-700 transition-colors">
                    Explorar negocios
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>
    );
  };

  const ProfileView = () => {
    const stats = useMemo(() => {
      const collected = savedBags.filter(b => b.status === 'collected');
      const ratings   = collected.filter(b => b.rating).map(b => b.rating);
      return {
        meals:     collected.length,
        co2:       (collected.length * 2.5).toFixed(1),
        money:     collected.reduce((acc, b) => acc + (b.merchant.originalPrice - b.merchant.savePrice), 0),
        water:     (collected.length * 150).toFixed(0),
        kilos:     (collected.length * 1.8).toFixed(1),
        avgRating: ratings.length ? (ratings.reduce((a,b) => a+b,0)/ratings.length).toFixed(1) : null,
      };
    }, [savedBags]);

    return (
      <div className="pb-24 min-h-screen bg-gray-50">
        <div className="bg-gradient-to-br from-green-600 via-green-500 to-emerald-600 text-white p-6 pb-8 rounded-b-[2.5rem] shadow-xl">
          <div className="flex justify-between items-start mb-6">
            <h1 className="text-2xl font-bold">Mi Perfil</h1>
            <button 
              className="w-10 h-10 bg-white/20 backdrop-blur rounded-full flex items-center justify-center hover:bg-white/30 transition-colors focus:outline-none focus:ring-2 focus:ring-white"
              aria-label="Configuración"
            >
              <Settings size={20} />
            </button>
          </div>
          
          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center text-4xl backdrop-blur-sm border-2 border-white/30">
              {user?.avatar ? (
                <img src={user.avatar} alt={user.name} className="w-full h-full rounded-2xl object-cover" />
              ) : (
                '👤'
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold mb-1">{user?.name}</h2>
              <p className="text-green-100">{user?.email}</p>
              <span className="inline-block mt-2 bg-white/20 backdrop-blur px-3 py-1 rounded-full text-xs font-bold">
                🌟 Salvador de comida
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/10 backdrop-blur rounded-2xl p-3 text-center border border-white/20">
              <p className="text-2xl font-bold">{stats.meals}</p>
              <p className="text-xs text-green-100">Rescates</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-2xl p-3 text-center border border-white/20">
              <p className="text-2xl font-bold">{favorites.length}</p>
              <p className="text-xs text-green-100">Favoritos</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-2xl p-3 text-center border border-white/20">
              <p className="text-2xl font-bold">${stats.money}</p>
              <p className="text-xs text-green-100">Ahorrado</p>
            </div>
          </div>
        </div>

        <div className="px-4 py-6 space-y-6">
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
            <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Leaf className="text-green-600" size={20} />
              Tu impacto ambiental
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-xl">
                <p className="text-2xl font-bold text-blue-600">{stats.co2}</p>
                <p className="text-sm text-blue-700 font-medium">kg CO₂ evitado</p>
              </div>
              <div className="text-center p-4 bg-amber-50 rounded-xl">
                <p className="text-2xl font-bold text-amber-600">{stats.water}</p>
                <p className="text-sm text-amber-700 font-medium">Litros de agua</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-xl">
                <p className="text-2xl font-bold text-green-600">{stats.kilos} kg</p>
                <p className="text-sm text-green-700 font-medium">Comida salvada</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-xl">
                <p className="text-2xl font-bold text-yellow-600">
                  {stats.avgRating ? `⭐ ${stats.avgRating}` : '—'}
                </p>
                <p className="text-sm text-yellow-700 font-medium">Tu rating promedio</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={onSwitchToMerchant}
              className="w-full bg-white border-2 border-green-600 text-green-600 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-green-50 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              <Store size={20} />
              Tengo un negocio
              <ChevronRight size={20} />
            </button>
            
            <button
              onClick={onLogout}
              className="w-full bg-red-50 border-2 border-red-200 text-red-600 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-red-100 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              <LogOut size={20} />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  };

  const QRModal = () => {
    if (!showQRModal || !selectedBagForQR) return null;

    return (
      <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-fadeIn">
        <div className="bg-white w-full max-w-sm rounded-3xl p-6 animate-scaleIn">
          <div className="text-center mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-1">Tu código QR</h3>
            <p className="text-gray-500 text-sm">Muestra esto al recoger tu pedido</p>
          </div>

          <div className="bg-gray-50 p-6 rounded-2xl mb-6">
            <QRCodeDisplay value={selectedBagForQR.qrData} size={250} />
          </div>

          <div className="text-center mb-6">
            <p className="text-3xl font-bold text-gray-900 tracking-widest font-mono mb-1">
              {selectedBagForQR.pickupCode}
            </p>
            <p className="text-sm text-gray-500">Código de confirmación</p>
          </div>

          <button
            onClick={() => setShowQRModal(false)}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-bold hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-lg mx-auto bg-white min-h-screen relative shadow-2xl">
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
      
      {showMap ? (
        <MapView 
          merchants={merchants}
          userLocation={userLocation}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onSelectMerchant={(m) => { setSelectedMerchant(m); setShowMap(false); }}
          onBack={() => setShowMap(false)}
        />
      ) : (
        <>
          {activeTab === 'home' && <HomeView />}
          {activeTab === 'bags' && <BagsView />}
          {activeTab === 'profile' && <ProfileView />}

          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 max-w-lg mx-auto px-6 py-2 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] z-40">
            <div className="flex justify-around items-center">
              <button 
                onClick={() => setActiveTab('home')} 
                className={`flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  activeTab === 'home' ? 'text-green-600 bg-green-50' : 'text-gray-400'
                }`}
                aria-label="Inicio"
                aria-current={activeTab === 'home' ? 'page' : undefined}
              >
                <Home size={24} strokeWidth={activeTab === 'home' ? 2.5 : 2} />
                <span className="text-[10px] font-bold">Inicio</span>
              </button>
              <button 
                onClick={() => setActiveTab('bags')} 
                className={`flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all relative focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  activeTab === 'bags' ? 'text-green-600 bg-green-50' : 'text-gray-400'
                }`}
                aria-label="Mis bolsas"
                aria-current={activeTab === 'bags' ? 'page' : undefined}
              >
                <ShoppingBag size={24} strokeWidth={activeTab === 'bags' ? 2.5 : 2} />
                {savedBags.filter(b => b.status === 'reserved').length > 0 && (
                  <span className="absolute -top-0.5 right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
                    {savedBags.filter(b => b.status === 'reserved').length}
                  </span>
                )}
                <span className="text-[10px] font-bold">Mis bolsas</span>
              </button>
              <button 
                onClick={() => setActiveTab('profile')} 
                className={`flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  activeTab === 'profile' ? 'text-green-600 bg-green-50' : 'text-gray-400'
                }`}
                aria-label="Perfil"
                aria-current={activeTab === 'profile' ? 'page' : undefined}
              >
                <User size={24} strokeWidth={activeTab === 'profile' ? 2.5 : 2} />
                <span className="text-[10px] font-bold">Perfil</span>
              </button>
            </div>
          </div>
        </>
      )}

      {selectedMerchant && (
        <Suspense fallback={<LoadingSpinner fullScreen />}>
          <MerchantModal
            merchant={selectedMerchant}
            onClose={() => setSelectedMerchant(null)}
            onPurchase={handlePurchase}
            userLocation={userLocation}
            isFavorite={favorites.includes(selectedMerchant.id)}
            onToggleFavorite={() => toggleFavorite(selectedMerchant.id)}
          />
        </Suspense>
      )}
      {showQRModal && <QRModal />}
      {feedbackBag && <FeedbackModal />}
    </div>
  );
};
