import React, { useRef } from 'react';
import { CATEGORIES } from '../../utils/constants';

export const CategoryFilter = ({ selected, onSelect }) => {
  const scrollRef = useRef(null);

  const handleKeyDown = (e, categoryId) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(categoryId);
    }
  };

  return (
    <div className="relative" role="group" aria-label="Categorías de alimentos">
      <div 
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
        role="tablist"
      >
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            onKeyDown={(e) => handleKeyDown(e, cat.id)}
            role="tab"
            aria-selected={selected === cat.id}
            aria-label={`Categoría ${cat.name}`}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full whitespace-nowrap transition-all duration-300 border focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
              selected === cat.id
                ? 'bg-green-600 text-white border-green-600 shadow-lg shadow-green-600/30 scale-105'
                : 'bg-white text-gray-700 border-gray-200 hover:border-green-300 hover:bg-green-50'
            }`}
          >
            <span className="text-lg" aria-hidden="true">{cat.icon}</span>
            <span className="font-semibold text-sm">{cat.name}</span>
          </button>
        ))}
      </div>
      <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-white to-transparent pointer-events-none" aria-hidden="true" />
    </div>
  );
};
