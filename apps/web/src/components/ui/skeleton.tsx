"use client";

import React from "react";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
}

export function Skeleton({
  className = "",
  width = "100%",
  height = "1rem",
  rounded = true,
}: SkeletonProps) {
  return (
    <div
      className={`bg-gray-200 animate-pulse ${rounded ? "rounded" : ""} ${className}`}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
      }}
    />
  );
}

export function SkeletonMetricCard() {
  return (
    <div className="bg-white rounded-lg p-6 shadow-sm border">
      <div className="space-y-3">
        <Skeleton height="1rem" width="60%" />
        <Skeleton height="2rem" width="40%" />
        <div className="flex items-center space-x-2">
          <Skeleton height="1rem" width="1rem" rounded />
          <Skeleton height="0.875rem" width="30%" />
        </div>
      </div>
    </div>
  );
}

export function SkeletonCard({ className = "" }: { className?: string }) {
  return (
    <div className={`bg-white rounded-lg p-6 shadow-sm border ${className}`}>
      <div className="space-y-4">
        <Skeleton height="1.5rem" width="80%" />
        <Skeleton height="1rem" width="60%" />
        <Skeleton height="1rem" width="40%" />
      </div>
    </div>
  );
}

export function SkeletonTable() {
  return (
    <div className="space-y-3">
      <div className="flex space-x-4">
        <Skeleton height="1rem" width="20%" />
        <Skeleton height="1rem" width="15%" />
        <Skeleton height="1rem" width="15%" />
        <Skeleton height="1rem" width="15%" />
        <Skeleton height="1rem" width="15%" />
        <Skeleton height="1rem" width="10%" />
      </div>
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex space-x-4">
          <Skeleton height="1rem" width="20%" />
          <Skeleton height="1rem" width="15%" />
          <Skeleton height="1rem" width="15%" />
          <Skeleton height="1rem" width="15%" />
          <Skeleton height="1rem" width="15%" />
          <Skeleton height="1rem" width="10%" />
        </div>
      ))}
    </div>
  );
}

