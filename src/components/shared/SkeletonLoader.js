import React from 'react';

export const LoadingSpinner = ({ size = 'md', fullScreen = false }) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16'
  };

  const spinner = (
    <div className={`${sizes[size]} border-4 border-green-600 border-t-transparent rounded-full animate-spin`} />
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
        {spinner}
      </div>
    );
  }

  return spinner;
};

export const MerchantCardSkeleton = () => (
  <div className="bg-white rounded-2xl shadow-sm overflow-hidden animate-pulse" role="status" aria-label="Cargando comercio">
    <div className="h-40 bg-gray-200" />
    <div className="p-4">
      <div className="h-5 bg-gray-200 rounded w-3/4 mb-2" />
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-3" />
      <div className="flex justify-between">
        <div className="h-6 bg-gray-200 rounded w-20" />
        <div className="h-6 bg-gray-200 rounded w-16" />
      </div>
    </div>
    <span className="sr-only">Cargando...</span>
  </div>
);

export const MerchantDetailSkeleton = () => (
  <div className="bg-white rounded-3xl overflow-hidden animate-pulse">
    <div className="h-64 bg-gray-200" />
    <div className="p-6 space-y-4">
      <div className="h-8 bg-gray-200 rounded w-3/4" />
      <div className="h-4 bg-gray-200 rounded w-1/2" />
      <div className="h-24 bg-gray-200 rounded" />
      <div className="h-12 bg-gray-200 rounded" />
    </div>
  </div>
);

export const ListSkeleton = ({ count = 5 }) => (
  <div className="space-y-4">
    {[...Array(count)].map((_, i) => (
      <MerchantCardSkeleton key={i} />
    ))}
  </div>
);
