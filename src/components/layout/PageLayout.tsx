import Header from "./Header";

interface PageLayoutProps {
  children: React.ReactNode;
  userEmail?: string;
  /** When true, header is still visible but the main area fills the viewport
   *  without content-width constraints (used by the analysis workspace). */
  fullHeight?: boolean;
}

export default function PageLayout({
  children,
  userEmail,
  fullHeight,
}: PageLayoutProps) {
  if (fullHeight) {
    return (
      <div className="flex h-screen flex-col bg-background overflow-hidden">
        <Header userEmail={userEmail} />
        <main className="flex min-h-0 flex-1">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header userEmail={userEmail} />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}