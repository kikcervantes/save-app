import { useCallback } from 'react';

export const useAnalytics = () => {
  const trackEvent = useCallback((eventName, properties = {}) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[Analytics]', eventName, properties);
    }
    
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', eventName, properties);
    }
    
    if (typeof window !== 'undefined' && window.mixpanel) {
      window.mixpanel.track(eventName, properties);
    }
  }, []);

  const trackPageView = useCallback((page) => {
    trackEvent('page_view', { page });
  }, [trackEvent]);

  const trackPurchase = useCallback((merchant, amount) => {
    trackEvent('purchase', {
      merchant_id: merchant.id,
      merchant_name: merchant.name,
      amount: amount,
      category: merchant.category
    });
  }, [trackEvent]);

  return { trackEvent, trackPageView, trackPurchase };
};
