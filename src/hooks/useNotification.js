import { useState, useCallback, useRef } from 'react';

export const useNotification = (defaultDuration = 4000) => {
  const [notifications, setNotifications] = useState([]);
  const [loadingStates, setLoadingStates] = useState({});
  const timeoutsRef = useRef({});

  const showNotification = useCallback((message, type = 'success', duration = defaultDuration) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 5);
    const newNotification = { 
      id, 
      message, 
      type, 
      createdAt: Date.now(),
      duration 
    };
    
    setNotifications(prev => [...prev, newNotification]);
    
    if (timeoutsRef.current[id]) {
      clearTimeout(timeoutsRef.current[id]);
    }
    
    timeoutsRef.current[id] = setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
      delete timeoutsRef.current[id];
    }, duration);
    
    return id;
  }, [defaultDuration]);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (timeoutsRef.current[id]) {
      clearTimeout(timeoutsRef.current[id]);
      delete timeoutsRef.current[id];
    }
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    Object.values(timeoutsRef.current).forEach(clearTimeout);
    timeoutsRef.current = {};
  }, []);

  const withLoading = useCallback(async (key, promise) => {
    setLoadingStates(prev => ({ ...prev, [key]: true }));
    try {
      const result = await promise;
      return result;
    } catch (error) {
      showNotification(error.message || 'Error inesperado', 'error');
      throw error;
    } finally {
      setLoadingStates(prev => ({ ...prev, [key]: false }));
    }
  }, [showNotification]);

  const isLoading = useCallback((key) => {
    return !!loadingStates[key];
  }, [loadingStates]);

  return { 
    notifications, 
    showNotification, 
    removeNotification, 
    clearAll,
    withLoading,
    isLoading
  };
};
