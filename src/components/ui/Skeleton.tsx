import React from "react";

export function Skeleton({
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`animate-shimmer rounded bg-slate-100 ${className}`}
      {...props}
    />
  );
}

export function StatCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-7 w-7 rounded-lg" />
          </div>
          <Skeleton className="h-7 w-16" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  columns = 5,
  rows = 6,
}: {
  columns?: number;
  rows?: number;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden p-4 space-y-3">
      {/* Header mock */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-8 w-44 rounded-lg" />
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-12 gap-3 py-2 bg-slate-50/70 rounded-lg px-3">
        {Array.from({ length: columns }).map((_, idx) => (
          <Skeleton
            key={idx}
            className={`h-3.5 ${
              idx === 0
                ? "col-span-1"
                : idx === 1
                ? "col-span-4"
                : idx === columns - 1
                ? "col-span-2"
                : "col-span-2"
            }`}
          />
        ))}
      </div>

      {/* Row Mocks */}
      <div className="space-y-2.5 pt-1">
        {Array.from({ length: rows }).map((_, r) => (
          <div
            key={r}
            className="grid grid-cols-12 gap-3 items-center py-2.5 px-3 rounded-lg border border-slate-50"
          >
            {Array.from({ length: columns }).map((_, c) => (
              <Skeleton
                key={c}
                className={`h-4 ${
                  c === 0
                    ? "col-span-1 w-6"
                    : c === 1
                    ? "col-span-4 w-3/4"
                    : c === columns - 1
                    ? "col-span-2 w-16 ml-auto"
                    : "col-span-2 w-4/5"
                }`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex flex-col"
        >
          <Skeleton className="h-44 w-full rounded-none" />
          <div className="p-4 space-y-2.5 flex-1 flex flex-col justify-between">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16 rounded-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-14 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
