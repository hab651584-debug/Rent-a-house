import React from 'react';
import { ArrowRight, ShieldCheck, MapPin, MessageSquare } from 'lucide-react';
import { BrandLogo } from './BrandLogo.tsx';

interface SplashWelcomeProps {
  onGetStarted: () => void;
  onBrowsePublic: () => void;
  onOpenHelp: () => void;
}

export const SplashWelcome: React.FC<SplashWelcomeProps> = ({
  onGetStarted,
  onBrowsePublic,
  onOpenHelp,
}) => {
  return (
    <div className="min-h-screen relative overflow-hidden bg-slate-950 text-white flex flex-col justify-between">
      {/* Twilight Skyline Backdrop */}
      <img
        src="/src/assets/images/splash_skyline_1795510499924.jpg"
        alt="Twilight city skyline"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover object-center opacity-75"
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-indigo-950/90 via-slate-950/60 to-slate-950/95"
        aria-hidden="true"
      />

      {/* Minimal Top Bar */}
      <header className="relative z-10 max-w-6xl w-full mx-auto px-6 py-5 flex items-center justify-between gap-8">
        <BrandLogo variant="dark" />
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-200">
          <button
            type="button"
            onClick={onBrowsePublic}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Browse Homes
          </button>
          <button
            type="button"
            onClick={onOpenHelp}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Safety Guide
          </button>
        </nav>
        <button
          type="button"
          onClick={onGetStarted}
          className="px-4 py-2 text-sm font-semibold rounded-xl bg-white/15 hover:bg-white/25 text-white backdrop-blur-sm transition-colors whitespace-nowrap shrink-0"
        >
          Sign In
        </button>
      </header>

      {/* Main Focal Content */}
      <main className="relative z-10 max-w-6xl w-full mx-auto px-6 py-10 md:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left">
          <div className="mb-6 lg:hidden">
            <BrandLogo variant="dark" showWordmark={false} />
          </div>
          <h1
            className="font-display font-bold text-4xl sm:text-5xl lg:text-6xl tracking-tight text-white leading-tight"
            style={{ textWrap: 'balance' }}
          >
            Find Your Perfect Home
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-200 max-w-xl leading-relaxed">
            Discover houses, flats, portions, and rooms across Lahore, Islamabad, Karachi, and beyond. Transparent PKR rent, verified moderation, and direct owner chat.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={onBrowsePublic}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-[#5B3CF5] hover:bg-[#4F32DF] text-white font-semibold text-base shadow-lg shadow-indigo-950/40 active:scale-[0.98] transition-all whitespace-nowrap"
            >
              Get Started
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onGetStarted}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-white/12 hover:bg-white/20 text-white font-medium text-base backdrop-blur-sm border border-white/20 transition-all whitespace-nowrap"
            >
              Create Account / Login
            </button>
          </div>
        </div>

        <div className="lg:col-span-5 hidden lg:block">
          <div className="rounded-3xl overflow-hidden border border-white/15 bg-slate-900/70 backdrop-blur-md shadow-2xl">
            <img
              src="/src/assets/images/hero_modern_villa_1795510500677.jpg"
              alt="Modern residential rental property"
              referrerPolicy="no-referrer"
              className="w-full h-60 object-cover"
            />
            <div className="p-5">
              <p className="text-xs text-indigo-300 font-medium">Direct Landlord & Tenant Marketplace</p>
              <div className="mt-1 flex items-baseline justify-between gap-4">
                <h2 className="font-display font-semibold text-lg text-white">Houses, Flats, Portions & Rooms</h2>
              </div>
              <p className="mt-2 text-xs text-slate-300">
                Lahore · Islamabad · Karachi · Rawalpindi · Faisalabad · Multan
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Quiet Trust Row */}
      <footer className="relative z-10 max-w-6xl w-full mx-auto px-6 py-6 border-t border-white/10">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs sm:text-sm text-slate-300">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Admin-moderated listings & report resolution</span>
          </div>
          <div className="flex items-center gap-2.5">
            <MapPin className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>Approximate neighborhood pins protect residential privacy</span>
          </div>
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Real-time tenant & landlord messaging with visit requests</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
