import { useRef, useCallback } from 'react';

export const useRateLimit = (limit = 5, windowMs = 60000) => {
  const attempts = useRef([]);

  const checkLimit = useCallback(() => {
    const now = Date.now();
    attempts.current = attempts.current.filter(t => now - t < windowMs);
    
    if (attempts.current.length >= limit) {
      throw new Error('Demasiados intentos. Por favor espera un momento.');
    }
    
    attempts.current.push(now);
    return true;
  }, [limit, windowMs]);

  const resetLimit = useCallback(() => {
    attempts.current = [];
  }, []);

  return { checkLimit, resetLimit };
};
