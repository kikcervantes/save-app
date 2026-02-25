import React from 'react';
import { Star, Clock, Heart, Package } from 'lucide-react';
import { formatCurrency, calculateDistance, getTimeRemaining } from '../../utils/helpers';

/* ─── Carrusel de Destacados ─── */
export const FeaturedCarousel = ({ merchants, favorites, onToggleFavorite, onClick, userLocation }) => {
  return (
    <div className="relative">
      <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
        {merchants.map(merchant => (
          <FeaturedCard
            key={merchant.id}
            merchant={merchant}
            isFavorite={favorites.includes(merchant.id)}
            onToggleFavorite={() => onToggleFavorite(merchant.id)}
            onClick={() => onClick(merchant)}
            userLocation={userLocation}
          />
        ))}
      </div>
      {/* Fade derecho */}
      <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-gray-50 to-transparent pointer-events-none" />
    </div>
  );
};

/* ─── Tarjeta Featured (carousel item) ─── */
const FeaturedCard = React.memo(({ merchant, isFavorite, onToggleFavorite, onClick, userLocation }) => {
  const discount = Math.round(((merchant.originalPrice - merchant.savePrice) / merchant.originalPrice) * 100);
  const distance = userLocation
    ? calculateDistance(userLocation.lat, userLocation.lng, merchant.location.lat, merchant.location.lng)
    : merchant.distance;
  const timeRemaining = getTimeRemaining(merchant.pickupWindow.end);
  const isUrgent = timeRemaining.hours < 2 && timeRemaining.total > 0;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
      className="shrink-0 w-64 snap-start bg-white rounded-2xl shadow-md hover:shadow-xl transition-all cursor-pointer overflow-hidden border border-gray-100 group"
      aria-label={`${merchant.name}, ${formatCurrency(merchant.savePrice)}`}
    >
      {/* Image */}
      <div className="relative h-36 bg-gradient-to-br from-gray-100 to-gray-50 overflow-hidden">
        {merchant.coverImage ? (
          <img src={merchant.coverImage} alt={merchant.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl group-hover:scale-110 transition-transform duration-500">
            {merchant.image}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Favorite */}
        <button onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
          className={`absolute top-2 right-2 p-2 rounded-full shadow transition-all ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400 hover:text-red-500'}`}>
          <Heart size={16} className={isFavorite ? 'fill-current' : ''} />
        </button>

        {/* Discount badge */}
        <div className="absolute top-2 left-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
          -{discount}%
        </div>

        {/* Name overlay */}
        <div className="absolute bottom-2 left-3 right-3 text-white">
          <h3 className="font-bold text-sm truncate">{merchant.name}</h3>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-0.5"><Star size={11} className="fill-yellow-400 text-yellow-400" />{merchant.rating}</span>
            <span>•</span>
            <span>{distance} km</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-3">
        <div className="flex items-center gap-1 mb-2 text-xs text-gray-500">
          <Clock size={12} className={isUrgent ? 'text-red-500' : 'text-green-600'} />
          <span className={isUrgent ? 'text-red-500 font-semibold' : ''}>
            {isUrgent ? `¡${timeRemaining.hours}h ${timeRemaining.minutes}m!` : `${merchant.pickupWindow.start} – ${merchant.pickupWindow.end}`}
          </span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <span className="text-lg font-bold text-green-600">{formatCurrency(merchant.savePrice)}</span>
            <span className="text-xs text-gray-400 line-through ml-1">{formatCurrency(merchant.originalPrice)}</span>
          </div>
          <div className={`px-2 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
            merchant.bagsAvailable > 3 ? 'bg-green-100 text-green-700' :
            merchant.bagsAvailable > 0 ? 'bg-amber-100 text-amber-700' :
            'bg-gray-100 text-gray-500'
          }`}>
            <Package size={11} />
            {merchant.bagsAvailable > 0 ? merchant.bagsAvailable : '×'}
          </div>
        </div>
      </div>
    </div>
  );
});

/* ─── Tarjeta completa (legacy, se sigue usando en el modal del mapa) ─── */
export const MerchantCard = React.memo(({ merchant, isFavorite, onToggleFavorite, onClick, userLocation }) => {
  const discount = Math.round(((merchant.originalPrice - merchant.savePrice) / merchant.originalPrice) * 100);
  const distance = userLocation ? calculateDistance(
    userLocation.lat, userLocation.lng, merchant.location.lat, merchant.location.lng
  ) : merchant.distance;
  const timeRemaining = getTimeRemaining(merchant.pickupWindow.end);
  const isUrgent = timeRemaining.hours < 2 && timeRemaining.total > 0;

  return (
    <div onClick={onClick} role="button" tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
      className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all cursor-pointer overflow-hidden border border-gray-100 group focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
      aria-label={`${merchant.name}, ${formatCurrency(merchant.savePrice)}`}
    >
      <div className="relative h-40 bg-gradient-to-br from-gray-100 to-gray-50 overflow-hidden">
        {merchant.coverImage ? (
          <img src={merchant.coverImage} alt={merchant.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl group-hover:scale-110 transition-transform duration-500">
            {merchant.image}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <button onClick={e => { e.stopPropagation(); onToggleFavorite(); }}
          className={`absolute top-3 right-3 p-2.5 rounded-full shadow-sm transition-transform ${isFavorite ? 'bg-red-500 text-white' : 'bg-white/90 text-gray-400 hover:text-red-500'}`}>
          <Heart size={18} className={isFavorite ? 'fill-current' : ''} />
        </button>
        <div className="absolute bottom-3 left-3 right-3 text-white">
          <h3 className="font-bold text-lg truncate">{merchant.name}</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="flex items-center gap-1"><Star size={14} className="fill-yellow-400 text-yellow-400" />{merchant.rating}</span>
            <span>•</span><span>{distance} km</span>
          </div>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2 text-sm text-gray-500">
          <Clock size={14} className={isUrgent ? 'text-red-500' : 'text-green-600'} />
          <span className={isUrgent ? 'text-red-500 font-semibold' : ''}>
            {isUrgent ? `¡${timeRemaining.hours}h ${timeRemaining.minutes}m!` : `${merchant.pickupWindow.start} - ${merchant.pickupWindow.end}`}
          </span>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-green-600">{formatCurrency(merchant.savePrice)}</span>
              <span className="text-sm text-gray-400 line-through">{formatCurrency(merchant.originalPrice)}</span>
            </div>
            <span className="text-xs text-green-600 font-semibold">Ahorras {discount}%</span>
          </div>
          <div className={`px-3 py-1.5 rounded-full text-sm font-bold ${
            merchant.bagsAvailable > 3 ? 'bg-green-600 text-white' :
            merchant.bagsAvailable > 0 ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-500'
          }`}>
            {merchant.bagsAvailable > 0 ? `${merchant.bagsAvailable} left` : 'Agotado'}
          </div>
        </div>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.merchant.id === next.merchant.id &&
  prev.isFavorite === next.isFavorite &&
  prev.merchant.bagsAvailable === next.merchant.bagsAvailable
);

export const CompactMerchantCard = ({ merchant, onClick }) => (
  <div onClick={onClick} role="button" tabIndex={0}
    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick()}
    className="bg-white rounded-xl shadow-sm p-3 cursor-pointer hover:shadow-md transition-all border border-gray-100 flex gap-3 focus:outline-none focus:ring-2 focus:ring-green-500"
    aria-label={`${merchant.name}, ${merchant.type}`}
  >
    <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-50 rounded-lg overflow-hidden shrink-0">
      {merchant.coverImage
        ? <img src={merchant.coverImage} alt={merchant.name} className="w-full h-full object-cover" />
        : <div className="w-full h-full flex items-center justify-center text-3xl">{merchant.image}</div>
      }
    </div>
    <div className="flex-1 min-w-0">
      <h4 className="font-bold text-gray-900 truncate">{merchant.name}</h4>
      <p className="text-xs text-gray-500 mb-1">{merchant.type} • {merchant.distance} km</p>
      <div className="flex items-center gap-1 mb-1">
        <Star size={12} className="fill-yellow-400 text-yellow-400" />
        <span className="text-xs font-semibold">{merchant.rating}</span>
        <span className="text-xs text-gray-400 ml-1">({merchant.reviews || 0})</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-green-600 font-bold">{formatCurrency(merchant.savePrice)}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${merchant.bagsAvailable > 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {merchant.bagsAvailable > 0 ? `${merchant.bagsAvailable} bolsas` : 'Agotado'}
        </span>
      </div>
    </div>
  </div>
);
