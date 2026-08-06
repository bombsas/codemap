import Header from "./Header";

interface PageLayoutProps {
  children: React.ReactNode;
  userEmail?: string;
}

export default function PageLayout({ children, userEmail }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header userEmail={userEmail} />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}