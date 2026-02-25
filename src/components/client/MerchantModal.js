import React from 'react';
import { X, Star, Clock, MapPin, Phone, Navigation, Heart } from 'lucide-react';
import { formatCurrency, getTimeRemaining, getGoogleMapsUrl } from '../../utils/helpers';

const MerchantModal = ({ merchant, onClose, onPurchase, userLocation, isFavorite, onToggleFavorite }) => {
  const discount = Math.round(((merchant.originalPrice - merchant.savePrice) / merchant.originalPrice) * 100);
  const timeRemaining = getTimeRemaining(merchant.pickupWindow.end);
  const isUrgent = timeRemaining.hours < 3 && timeRemaining.total > 0;

  const handleGetDirections = () => {
    const url = getGoogleMapsUrl(
      merchant.location.lat,
      merchant.location.lng,
      userLocation?.lat,
      userLocation?.lng
    );
    window.open(url, '_blank');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  React.useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn overflow-hidden"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="merchant-modal-title"
    >
      <div 
        className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative h-64 bg-gradient-to-br from-gray-100 to-gray-50">
          {merchant.coverImage ? (
            <img src={merchant.coverImage} alt={merchant.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-8xl">{merchant.image}</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 bg-white/20 backdrop-blur rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Cerrar"
          >
            <X size={24} />
          </button>

          <div className="absolute bottom-4 left-4 right-4 text-white">
            <div className="flex flex-wrap gap-2 mb-2">
              {merchant.badges.map((badge, idx) => (
                <span key={idx} className="bg-white/20 backdrop-blur px-2 py-1 rounded-lg text-xs font-bold">
                  {badge}
                </span>
              ))}
            </div>
            <h2 id="merchant-modal-title" className="text-3xl font-bold mb-1">{merchant.name}</h2>
            <div className="flex items-center gap-3 text-sm">
              <span className="flex items-center gap-1">
                <Star size={14} className="fill-yellow-400 text-yellow-400" />
                {merchant.rating}
              </span>
              <span>•</span>
              <span>{merchant.type}</span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {isUrgent && merchant.bagsAvailable > 0 && (
            <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white p-4 rounded-2xl flex items-center gap-3">
              <Clock className="shrink-0" size={24} />
              <div>
                <p className="font-bold">¡Quedan pocas bolsas!</p>
                <p className="text-sm opacity-90">{timeRemaining.hours}h {timeRemaining.minutes}m para ordenar</p>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
            <div className="flex items-start gap-3 mb-3">
              <MapPin size={20} className="text-blue-600 mt-1 shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-gray-900">{merchant.address}</p>
                <p className="text-sm text-gray-600">{merchant.distance} km de distancia</p>
              </div>
            </div>
            <button
              onClick={handleGetDirections}
              className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <Navigation size={18} />
              Cómo llegar con Google Maps
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 p-4 rounded-2xl">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <Clock size={16} className="text-green-600" />
                <span className="text-xs font-bold uppercase">Pickup</span>
              </div>
              <p className="font-semibold text-gray-900">{merchant.pickupWindow.start} - {merchant.pickupWindow.end}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-2xl">
              <div className="flex items-center gap-2 text-gray-600 mb-1">
                <Phone size={16} className="text-green-600" />
                <span className="text-xs font-bold uppercase">Contacto</span>
              </div>
              <p className="font-semibold text-gray-900 text-sm">{merchant.phone}</p>
            </div>
          </div>

          <div>
            <h3 className="font-bold text-gray-900 mb-2">¿Qué incluye?</h3>
            <p className="text-gray-600 leading-relaxed">{merchant.description}</p>
          </div>

          {merchant.dietary.length > 0 && (
            <div>
              <h3 className="font-bold text-gray-900 mb-3">Preferencias dietéticas</h3>
              <div className="flex flex-wrap gap-2">
                {merchant.dietary.map(diet => (
                  <span key={diet} className="bg-green-50 text-green-700 px-4 py-2 rounded-full text-sm font-semibold border border-green-200 capitalize">
                    {diet}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-gray-900 text-white rounded-3xl p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-gray-400 line-through text-lg">${merchant.originalPrice}</p>
                <p className="text-5xl font-bold text-green-400">${merchant.savePrice}</p>
              </div>
              <div className="bg-green-500 text-white px-4 py-2 rounded-2xl font-bold text-lg">
                -{discount}%
              </div>
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={onToggleFavorite}
                className={`p-4 rounded-xl flex items-center justify-center transition-colors ${
                  isFavorite ? 'bg-red-500 text-white' : 'bg-white/10 hover:bg-white/20'
                }`}
                aria-label={isFavorite ? "Quitar de favoritos" : "Agregar a favoritos"}
              >
                <Heart size={24} className={isFavorite ? "fill-current" : ""} />
              </button>
              
              {merchant.bagsAvailable > 0 ? (
                <button
                  onClick={() => onPurchase(merchant)}
                  className="flex-1 bg-green-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-green-500/30 hover:scale-[1.02] transition-transform focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                >
                  Reservar ahora • {merchant.bagsAvailable} disponibles
                </button>
              ) : (
                <button 
                  disabled 
                  className="flex-1 bg-gray-700 text-gray-500 py-4 rounded-2xl font-bold cursor-not-allowed"
                >
                  Agotado
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MerchantModal;
