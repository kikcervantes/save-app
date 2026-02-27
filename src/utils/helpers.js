export const calculateDistance = (lat1, lng1, lat2, lng2) => {
  if (!lat1 || !lng1 || !lat2 || !lng2) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return parseFloat((R * c).toFixed(1));
};

export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 0
  }).format(amount);
};

export const formatDate = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  });
};

export const formatTime = (dateString) => {
  if (!dateString) return '';
  return new Date(dateString).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const getTimeRemaining = (endTime) => {
  const now = new Date();
  const [hours, minutes] = endTime.split(':');
  const end = new Date();
  end.setHours(parseInt(hours), parseInt(minutes), 0);
  
  if (end < now) {
    end.setDate(end.getDate() + 1);
  }
  
  const diff = end - now;
  const hoursLeft = Math.floor(diff / (1000 * 60 * 60));
  const minutesLeft = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  return { hours: hoursLeft, minutes: minutesLeft, total: diff };
};

export const getGoogleMapsUrl = (destLat, destLng, originLat, originLng) => {
  if (originLat && originLng) {
    return `https://www.google.com/maps/dir/?api=1&origin=${originLat},${originLng}&destination=${destLat},${destLng}&travelmode=driving`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${destLat},${destLng}`;
};

export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validatePhone = (phone) => {
  // Remove spaces, dashes, parentheses
  const clean = phone.replace(/[\s\-\(\)\+]/g, '');
  // Must be exactly 10 digits (Mexico), or 12 digits with country code 52
  return /^\d{10}$/.test(clean) || /^52\d{10}$/.test(clean);
};

export const generateOrderCode = () => {
  return Math.random().toString(36).substr(2, 8).toUpperCase();
};

export const generatePickupCode = () => {
  return Math.random().toString(36).substr(2, 4).toUpperCase();
};

export const generateQRData = (orderId, merchantId) => {
  return JSON.stringify({
    orderId,
    merchantId,
    timestamp: new Date().toISOString(),
    code: generateOrderCode()
  });
};

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};
