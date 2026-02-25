export const CATEGORIES = [
  { id: 'all', name: 'Todo', icon: '🍽️', color: 'bg-gray-100' },
  { id: 'bakery', name: 'Panadería', icon: '🥐', color: 'bg-orange-100' },
  { id: 'restaurant', name: 'Restaurante', icon: '🍽️', color: 'bg-red-100' },
  { id: 'cafe', name: 'Café', icon: '☕', color: 'bg-amber-100' },
  { id: 'grocery', name: 'Super', icon: '🥬', color: 'bg-green-100' },
  { id: 'vegan', name: 'Vegano', icon: '🌱', color: 'bg-emerald-100' },
  { id: 'organic', name: 'Orgánico', icon: '🌿', color: 'bg-lime-100' },
  { id: 'premium', name: 'Premium', icon: '💎', color: 'bg-purple-100' }
];

export const DIETARY_OPTIONS = [
  { id: 'vegetarian', label: '🥬 Vegetariano', icon: '🥬' },
  { id: 'vegan', label: '🌱 Vegano', icon: '🌱' },
  { id: 'organic', label: '🌿 Orgánico', icon: '🌿' },
  { id: 'gluten-free', label: '🌾 Sin gluten', icon: '🌾' },
  { id: 'pescatarian', label: '🐟 Pescetariano', icon: '🐟' }
];

export const PAYMENT_METHODS = [
  { id: 'card', label: 'Tarjeta', icon: '💳' },
  { id: 'cash', label: 'Efectivo', icon: '💵' },
  { id: 'transfer', label: 'Transferencia', icon: '🏦' },
  { id: 'crypto', label: 'Cripto', icon: '₿' }
];

export const SORT_OPTIONS = [
  { id: 'distance', label: 'Más cerca', icon: '📍' },
  { id: 'price', label: 'Menor precio', icon: '💰' },
  { id: 'rating', label: 'Mejor calificación', icon: '⭐' },
  { id: 'savings', label: 'Mayor ahorro', icon: '🏷️' }
];

export const APP_CONFIG = {
  MAX_DISTANCE: 10,
  DEFAULT_RADIUS: 5,
  REFRESH_INTERVAL: 30000,
  NOTIFICATION_DURATION: 4000,
  DEBOUNCE_DELAY: 300,
  MAX_FAVORITES: 50,
  MAX_BAGS_PER_USER: 10
};
