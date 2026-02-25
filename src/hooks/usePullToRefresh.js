import { useState, useRef, useCallback } from 'react';

export const usePullToRefresh = (onRefresh, threshold = 100) => {
  const [refreshing, setRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const touchStart = useRef(0);
  const touchY = useRef(0);

  const handleTouchStart = useCallback((e) => {
    if (window.scrollY > 0) return;
    touchStart.current = e.touches[0].clientY;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (refreshing || window.scrollY > 0) return;
    
    const currentY = e.touches[0].clientY;
    const diff = currentY - touchStart.current;
    
    if (diff > 0) {
      setPullDistance(Math.min(diff, threshold));
      e.preventDefault();
    }
  }, [refreshing, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, threshold, refreshing, onRefresh]);

  return { 
    refreshing, 
    pullDistance, 
    handleTouchStart, 
    handleTouchMove, 
    handleTouchEnd 
  };
};
