import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, List, Navigation, X, SlidersHorizontal, Locate } from 'lucide-react';
import { formatCurrency, calculateDistance, getGoogleMapsUrl } from '../../utils/helpers';

// Leaflet loaded via CDN links in index.html (no import needed for CSS)
// We load it dynamically so the app doesn't break if offline

const RADIUS_OPTIONS = [0.5, 1, 2, 5, 10];

/* ── Lightweight Leaflet wrapper ── */
const LeafletMap = ({ userLocation, merchants, selected, onSelect, radius }) => {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = useRef([]);
  const circleRef    = useRef(null);
  const userMarkerRef = useRef(null);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!window.L) return; // Leaflet not loaded yet

    const L = window.L;
    const center = userLocation
      ? [userLocation.lat, userLocation.lng]
      : [19.4326, -99.1332]; // CDMX default

    const map = L.map(containerRef.current, {
      center,
      zoom: 14,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);  // eslint-disable-line

  // Update user location marker + radius circle
  useEffect(() => {
    if (!mapRef.current || !window.L || !userLocation) return;
    const L = window.L;
    const map = mapRef.current;

    if (userMarkerRef.current) userMarkerRef.current.remove();
    if (circleRef.current)    circleRef.current.remove();

    // Blue pulsing dot for user
    const userIcon = L.divIcon({
      className: '',
      html: `<div style="width:16px;height:16px;background:#2563eb;border:3px solid white;border-radius:50%;box-shadow:0 0 0 6px rgba(37,99,235,0.25)"></div>`,
      iconAnchor: [8, 8],
    });
    userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
      .addTo(map)
      .bindPopup('<b>📍 Tú estás aquí</b>');

    // Radius circle
    circleRef.current = L.circle([userLocation.lat, userLocation.lng], {
      radius: radius * 1000,
      color: '#16a34a', fillColor: '#16a34a', fillOpacity: 0.06, weight: 2, dashArray: '6 4',
    }).addTo(map);

    map.setView([userLocation.lat, userLocation.lng], map.getZoom());
  }, [userLocation, radius]);

  // Update merchant markers
  useEffect(() => {
    if (!mapRef.current || !window.L) return;
    const L   = window.L;
    const map = mapRef.current;

    // Remove old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    merchants.forEach(merchant => {
      if (!merchant.location?.lat) return;
      const isSelected = selected?.id === merchant.id;
      const hasStock   = merchant.bagsAvailable > 0;

      const color   = isSelected ? '#16a34a' : hasStock ? '#ffffff' : '#d1d5db';
      const border  = isSelected ? '#ffffff' : hasStock ? '#16a34a' : '#9ca3af';
      const emoji   = merchant.image || '🍽️';
      const ringCss = isSelected ? 'box-shadow:0 0 0 4px rgba(22,163,74,0.4);' : '';

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:40px;height:40px;background:${color};border:3px solid ${border};border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;${ringCss}box-shadow:0 2px 8px rgba(0,0,0,0.25);cursor:pointer;">${emoji}</div>`,
        iconAnchor: [20, 40],
        iconSize: [40, 40],
      });

      const marker = L.marker([merchant.location.lat, merchant.location.lng], { icon })
        .addTo(map)
        .on('click', () => onSelect(merchant));

      markersRef.current.push(marker);
    });
  }, [merchants, selected]); // eslint-disable-line

  // Pan to selected merchant
  useEffect(() => {
    if (!mapRef.current || !selected?.location) return;
    mapRef.current.panTo([selected.location.lat, selected.location.lng], { animate: true });
  }, [selected]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};

/* ── Leaflet CSS loader (injects into <head> once) ── */
const useLeafletAssets = () => {
  const [ready, setReady] = useState(!!window.L);

  useEffect(() => {
    if (window.L) { setReady(true); return; }

    // CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link');
      link.id   = 'leaflet-css';
      link.rel  = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
    }

    // JS
    if (!document.getElementById('leaflet-js')) {
      const script = document.createElement('script');
      script.id  = 'leaflet-js';
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => setReady(true);
      document.head.appendChild(script);
    }
  }, []);

  return ready;
};

/* ── Main MapView component ── */
export const MapView = ({ merchants, userLocation, favorites, onToggleFavorite, onSelectMerchant, onBack }) => {
  const leafletReady = useLeafletAssets();
  const [selected,    setSelected]    = useState(null);
  const [viewMode,    setViewMode]    = useState('map');
  const [radius,      setRadius]      = useState(5);
  const [showRadius,  setShowRadius]  = useState(false);

  const visibleMerchants = merchants.filter(m => {
    if (!userLocation) return true;
    const d = calculateDistance(userLocation.lat, userLocation.lng, m.location.lat, m.location.lng);
    return d === null || d <= radius;
  });

  const handleNavigate = (m) => {
    window.open(getGoogleMapsUrl(m.location.lat, m.location.lng, userLocation?.lat, userLocation?.lng), '_blank');
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm px-4 py-3 flex items-center gap-3 z-10 shrink-0">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-gray-900">Mapa</h1>
          <p className="text-xs text-gray-500">{visibleMerchants.length} negocios · radio {radius} km</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Radius picker */}
          <div className="relative">
            <button onClick={() => setShowRadius(r => !r)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold border-2 transition-all ${showRadius ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200'}`}>
              <SlidersHorizontal size={14} /> {radius} km
            </button>
            {showRadius && (
              <div className="absolute right-0 top-11 bg-white border border-gray-200 rounded-2xl shadow-xl p-3 z-50 flex flex-col gap-1 min-w-[100px]">
                <p className="text-xs text-gray-400 font-semibold mb-1 text-center">Radio</p>
                {RADIUS_OPTIONS.map(r => (
                  <button key={r} onClick={() => { setRadius(r); setShowRadius(false); }}
                    className={`py-2 rounded-xl text-sm font-bold transition-all ${radius === r ? 'bg-green-600 text-white' : 'hover:bg-gray-100 text-gray-700'}`}>
                    {r} km
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Map / List toggle */}
          <div className="flex bg-gray-100 p-1 rounded-xl">
            {[{ id: 'map', label: '🗺️' }, { id: 'list', label: '☰' }].map(t => (
              <button key={t.id} onClick={() => setViewMode(t.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${viewMode === t.id ? 'bg-white shadow-sm text-green-600' : 'text-gray-500'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {viewMode === 'map' ? (
        <div className="flex-1 relative overflow-hidden">
          {/* Real Leaflet map */}
          {leafletReady ? (
            <LeafletMap
              userLocation={userLocation}
              merchants={visibleMerchants}
              selected={selected}
              onSelect={m => setSelected(prev => prev?.id === m.id ? null : m)}
              radius={radius}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100">
              <div className="text-center">
                <div className="w-10 h-10 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
                <p className="text-gray-500 text-sm">Cargando mapa...</p>
              </div>
            </div>
          )}

          {/* Selected merchant card (bottom sheet) */}
          {selected && (
            <div className="absolute bottom-4 left-4 right-4 bg-white rounded-2xl shadow-2xl p-4 z-[500]">
              <button onClick={() => setSelected(null)}
                className="absolute top-3 right-3 p-1.5 hover:bg-gray-100 rounded-full">
                <X size={18} />
              </button>
              <div className="flex gap-3">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                  {selected.coverImage
                    ? <img src={selected.coverImage} alt={selected.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-3xl">{selected.image}</div>
                  }
                </div>
                <div className="flex-1 min-w-0 pr-6">
                  <h3 className="font-bold text-gray-900 truncate">{selected.name}</h3>
                  <p className="text-xs text-gray-500">{selected.type}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-green-600 font-bold">{formatCurrency(selected.savePrice)}</span>
                    <span className="text-gray-400 line-through text-xs">{formatCurrency(selected.originalPrice)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${selected.bagsAvailable > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {selected.bagsAvailable > 0 ? `${selected.bagsAvailable} bolsas` : 'Agotado'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => handleNavigate(selected)}
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-1.5 hover:bg-blue-700 transition-colors">
                  <Navigation size={15} /> Cómo llegar
                </button>
                <button onClick={() => onSelectMerchant(selected)}
                  className="flex-1 bg-green-600 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-green-700 transition-colors">
                  Ver detalles
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* List view */
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {visibleMerchants.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-gray-600 font-medium">No hay negocios en {radius} km</p>
              <button onClick={() => setRadius(10)} className="text-green-600 font-semibold mt-2 text-sm">
                Ampliar a 10 km →
              </button>
            </div>
          ) : visibleMerchants.map(m => {
            const distance = userLocation
              ? calculateDistance(userLocation.lat, userLocation.lng, m.location.lat, m.location.lng)
              : m.distance;
            return (
              <div key={m.id} className="bg-white rounded-2xl p-4 shadow-sm flex gap-3 border border-gray-100">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                  {m.coverImage
                    ? <img src={m.coverImage} alt={m.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-2xl">{m.image}</div>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 truncate">{m.name}</h3>
                  <p className="text-xs text-gray-500">{m.type} · {distance} km</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-green-600 font-bold text-sm">{formatCurrency(m.savePrice)}</span>
                    <span className="text-gray-400 line-through text-xs">{formatCurrency(m.originalPrice)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${m.bagsAvailable > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {m.bagsAvailable > 0 ? `${m.bagsAvailable} bolsas` : 'Agotado'}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => window.open(getGoogleMapsUrl(m.location.lat, m.location.lng, userLocation?.lat, userLocation?.lng), '_blank')}
                      className="flex-1 bg-blue-50 text-blue-600 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1">
                      <Navigation size={12} /> Ruta
                    </button>
                    <button onClick={() => onSelectMerchant(m)}
                      className="flex-1 bg-green-50 text-green-600 py-1.5 rounded-lg text-xs font-semibold">
                      Ver más
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
