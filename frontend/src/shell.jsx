import React from 'react';
import './pwa.js';
import { ArrowLeft } from 'lucide-react';

export function PageShell({ children, action }) {
  return <div className="app-surface relative min-h-screen overflow-x-hidden text-zinc-100">
    <div className="app-atmosphere pointer-events-none fixed inset-0" />
    <div className="app-grid pointer-events-none fixed inset-0" />
    <header className="app-header sticky top-0 z-50 border-b border-white/[.08] backdrop-blur-2xl">
      <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="/" className="flex items-center gap-3 font-semibold tracking-tight text-white"><span className="size-9 overflow-hidden rounded-xl border border-white/15 shadow-[0_0_24px_rgba(167,139,250,.12)]"><img src="/favicon.jpg" alt="Meme.Share 图标" className="size-full object-cover"/></span><span className="text-lg">Meme<span className="text-violet-300">.</span>Share</span></a>
        <div className="flex items-center gap-3">{action}<a href="/" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"><ArrowLeft size={16}/>返回画廊</a></div>
      </div>
    </header>
    <main className="relative">{children}</main>
  </div>;
}

export const inputClass = 'mt-2 w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-violet-300/40 focus:ring-4 focus:ring-violet-400/10';
export const primaryButton = 'inline-flex items-center justify-center gap-2 rounded-xl bg-violet-400 px-5 py-3 font-semibold text-[#0b0c12] shadow-[0_0_30px_rgba(167,139,250,.16)] transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-40';
export const glassPanel = 'rounded-3xl border border-white/10 bg-white/[.045] shadow-[0_24px_80px_rgba(0,0,0,.32)] backdrop-blur-2xl';
