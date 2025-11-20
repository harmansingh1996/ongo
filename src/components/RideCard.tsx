// Skeleton loading component for ride cards
export function RideCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-100 animate-pulse">
      {/* Status badge skeleton */}
      <div className="flex items-center justify-between mb-3">
        <div className="h-6 w-20 bg-gray-200 rounded-full"></div>
        <div className="h-4 w-16 bg-gray-200 rounded"></div>
      </div>

      {/* Route skeleton */}
      <div className="space-y-3 mb-4">
        {/* From location */}
        <div className="flex items-start gap-3">
          <div className="w-3 h-3 rounded-full bg-gray-300 mt-1 flex-shrink-0"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-3 bg-gray-100 rounded w-1/2"></div>
          </div>
        </div>

        {/* Line */}
        <div className="ml-1.5 w-0.5 h-6 bg-gray-200"></div>

        {/* To location */}
        <div className="flex items-start gap-3">
          <div className="w-3 h-3 rounded-full bg-gray-300 mt-1 flex-shrink-0"></div>
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
            <div className="h-3 bg-gray-100 rounded w-5/12"></div>
          </div>
        </div>
      </div>

      {/* Info row skeleton */}
      <div className="flex items-center justify-between text-sm pt-3 border-t border-gray-100">
        <div className="flex items-center gap-4">
          <div className="h-4 w-24 bg-gray-200 rounded"></div>
          <div className="h-4 w-20 bg-gray-200 rounded"></div>
        </div>
        <div className="h-4 w-4 bg-gray-200 rounded"></div>
      </div>
    </div>
  );
}

// Show multiple skeleton cards for better perceived performance
export function RideCardSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <RideCardSkeleton key={index} />
      ))}
    </>
  );
}
