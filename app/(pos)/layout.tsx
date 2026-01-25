'use client';

export default function POSLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-black">
      {/* POS-specific layout - fullscreen, touch-optimized */}
      {children}
    </div>
  );
}
