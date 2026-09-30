import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './pwa.js';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Download, Search, Upload, UserRound, X } from 'lucide-react';
import './styles.css';

const PAGE_SIZE = 40;
const validSorts = ['default', 'latest', 'downloads', 'favorites'];

function GlassButton({ children, active, disabled, onClick, label }) {
  return (
    <button aria-label={label} disabled={disabled} onClick={onClick}
      className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl border px-3 text-sm transition duration-200 ${active
        ? 'border-violet-400/50 bg-violet-400 text-[#0b0c12] shadow-[0_0_28px_rgba(167,139,250,.24)]'
        : 'border-white/10 bg-white/[.035] text-zinc-400 hover:border-white/20 hover:bg-white/[.07] hover:text-white'} disabled:pointer-events-none disabled:opacity-30`}>
      {children}
    </button>
  );
}

function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;
  const candidates = [...new Set([1, totalPages, page - 1, page, page + 1])]
    .filter((value) => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  const nodes = [];
  let previous = 0;
  candidates.forEach((value) => {
    if (previous && value - previous > 1) nodes.push(<span key={`gap-${value}`} className="px-1 text-zinc-600">…</span>);
    nodes.push(<GlassButton key={value} active={value === page} onClick={() => onChange(value)}>{value}</GlassButton>);
    previous = value;
  });
  return (
    <nav aria-label="表情包分页" className="mt-12 flex flex-wrap items-center justify-center gap-2">
      <GlassButton label="上一页" disabled={page === 1} onClick={() => onChange(page - 1)}><ArrowLeft size={16} /></GlassButton>
      {nodes}
      <GlassButton label="下一页" disabled={page === totalPages} onClick={() => onChange(page + 1)}><ArrowRight size={16} /></GlassButton>
    </nav>
  );
}

function MemeCard({ meme, active, selected, selectionMode, onActivate, onToggleSelected }) {
  const [ready, setReady] = useState(false);
  const pressTimer = useRef(null);
  const longPressed = useRef(false);
  const href = `/detail.html?id=${encodeURIComponent(meme.id)}`;
  const ratio = meme.width && meme.height ? `${meme.width}/${meme.height}` : undefined;
  function cancelLongPress() { if (pressTimer.current) clearTimeout(pressTimer.current); pressTimer.current = null; }
  function startLongPress(event) {
    if (event.button !== undefined && event.button !== 0) return;
    longPressed.current = false;
    cancelLongPress();
    pressTimer.current = setTimeout(() => { longPressed.current = true; onToggleSelected(meme.id); }, 520);
  }
  function activate(event) {
    event.preventDefault();
    if (longPressed.current) { longPressed.current = false; return; }
    if (selectionMode) { onToggleSelected(meme.id); return; }
    if (active) location.href = href;
    else onActivate(meme.id);
  }
  return (
    <div role="button" tabIndex={0} aria-label={selectionMode ? `${selected?'取消选择':'选择'}表情包` : active ? '再次点击进入表情包详情' : '显示表情包操作'}
      onClick={activate} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate(event)}}}
      onPointerDown={startLongPress} onPointerUp={cancelLongPress} onPointerCancel={cancelLongPress} onPointerLeave={cancelLongPress}
      onContextMenu={event=>event.preventDefault()}
      className={`group relative mb-4 block break-inside-avoid cursor-pointer select-none overflow-hidden rounded-2xl border bg-white/[.035] shadow-[0_14px_42px_rgba(0,0,0,.25)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_55px_rgba(0,0,0,.42),0_0_32px_rgba(167,139,250,.08)] ${selected?'border-violet-300/80 ring-2 ring-violet-400/35':'border-white/10 hover:border-violet-300/30'}`}>
      {!ready && <div className="absolute inset-0 animate-pulse bg-white/[.04]" />}
      {meme.ext === 'webm' ? (
        <video src={`/img/${meme.id}`} style={{ aspectRatio: ratio }} muted loop playsInline preload="metadata"
          onLoadedData={() => setReady(true)} onMouseEnter={(event) => event.currentTarget.play().catch(() => {})}
          onMouseLeave={(event) => event.currentTarget.pause()} className="block h-auto w-full object-cover transition duration-500 group-hover:scale-[1.025]" />
      ) : (
        <img src={`/img/${meme.id}`} style={{ aspectRatio: ratio }} loading="lazy" alt="表情包" onLoad={() => setReady(true)}
          className="block h-auto w-full object-cover transition duration-500 group-hover:scale-[1.025]" />
      )}
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent transition duration-200 ${active||selectionMode?'opacity-100':'opacity-0'}`} />
      {selected&&<span className="pointer-events-none absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-violet-400 text-[#0b0c12] shadow-lg"><Check size={17}/></span>}
      {active&&!selectionMode&&<div className="absolute inset-x-3 bottom-3 z-10 flex gap-2" onClick={event=>event.stopPropagation()} onPointerDown={event=>event.stopPropagation()}>
        <a href={`/img/${encodeURIComponent(meme.id)}?download=1`} download className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-violet-400 px-3 py-2.5 text-sm font-semibold text-[#0b0c12] shadow-lg transition hover:bg-violet-300"><Download size={16}/>下载</a>
        <a href={href} className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-black/55 px-3 py-2.5 text-sm text-white backdrop-blur-xl transition hover:bg-black/70"><ArrowUpRight size={16}/>详情</a>
      </div>}
    </div>
  );
}

function App() {
  const initial = useMemo(() => new URLSearchParams(location.search), []);
  const randomSeed = useMemo(() => {
    if (window.crypto?.getRandomValues) return window.crypto.getRandomValues(new Uint32Array(1))[0] % 2147483646 + 1;
    return Math.floor(Math.random() * 2147483646) + 1;
  }, []);
  const [query, setQuery] = useState(initial.get('tag') || '');
  const [tag, setTag] = useState(initial.get('tag') || '');
  const [sort, setSort] = useState(validSorts.includes(initial.get('sort')) ? initial.get('sort') : 'default');
  const [page, setPage] = useState(Math.max(Number(initial.get('page')) || 1, 1));
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [tags, setTags] = useState([]);
  const [user, setUser] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [standalone, setStandalone] = useState(() => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const galleryRef = useRef(null);

  const loadImages = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sort, seed: String(randomSeed), limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) });
    if (tag) params.set('tag', tag);
    try {
      const response = await fetch(`/api/images?${params}`);
      const data = await response.json();
      const count = Number(response.headers.get('X-Total-Count')) || data.length;
      setItems(data); setTotal(count);
    } finally { setLoading(false); }
  }, [page, randomSeed, sort, tag]);

  useEffect(() => { loadImages(); }, [loadImages]);
  useEffect(() => { setActiveId(null); }, [page, sort, tag]);
  useEffect(() => {
    Promise.allSettled([fetch('/api/auth'), fetch('/api/tags/popular')]).then(async ([auth, popular]) => {
      if (auth.status === 'fulfilled' && auth.value.ok) setUser((await auth.value.json()).user);
      if (popular.status === 'fulfilled' && popular.value.ok) setTags(await popular.value.json());
    });
  }, []);
  useEffect(() => { const ready = event => { event.preventDefault(); setInstallPrompt(event); }; window.addEventListener('beforeinstallprompt', ready); return () => window.removeEventListener('beforeinstallprompt', ready); }, []);
  useEffect(() => { const installed = () => setStandalone(true); window.addEventListener('appinstalled', installed); return () => window.removeEventListener('appinstalled', installed); }, []);
  useEffect(() => {
    const params = new URLSearchParams();
    if (tag) params.set('tag', tag);
    if (sort !== 'default') params.set('sort', sort);
    if (page > 1) params.set('page', page);
    history.replaceState(null, '', params.size ? `?${params}` : '/');
  }, [page, sort, tag]);

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  function search(event) { event?.preventDefault(); setTag(query.trim()); setPage(1); }
  function changePage(value) { setPage(value); galleryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function toggleSelected(id) { setActiveId(null); setSelectedIds(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else if(next.size<60)next.add(id);else alert('一次最多选择 60 张表情包');return next}) }
  const selectionMode = selectedIds.size > 0;
  const batchDownloadUrl = `/api/batch-download?ids=${encodeURIComponent([...selectedIds].join(','))}`;

  return (
    <div className="app-surface relative min-h-screen overflow-x-hidden text-zinc-100">
      <div className="app-atmosphere pointer-events-none fixed inset-0" />
      <div className="app-grid pointer-events-none fixed inset-0" />

      <header className="app-header sticky top-0 z-50 border-b border-white/[.08] backdrop-blur-2xl">
        <div className="mx-auto flex h-18 max-w-[1440px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3 font-semibold tracking-tight text-white">
            <span className="size-9 overflow-hidden rounded-xl border border-white/15 shadow-[0_0_24px_rgba(167,139,250,.12)]"><img src="/favicon.jpg" alt="Meme.Share 图标" className="size-full object-cover" /></span>
            <span className="text-lg">Meme<span className="text-violet-300">.</span>Share</span>
          </a>
          <nav className="flex items-center gap-2 sm:gap-3">
            {!standalone && <button onClick={async()=>{if(installPrompt){await installPrompt.prompt();setInstallPrompt(null)}else alert('请打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。建议在安卓 Chrome 中打开本网站后操作。')}} className="rounded-xl border border-lime-300/20 bg-lime-300/[.07] px-3 py-2 text-xs text-lime-200 transition hover:bg-lime-300/[.12] sm:text-sm">安装应用</button>}
            <a href="/upload.html" aria-label="上传表情包" className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white sm:px-3"><Upload size={17} /><span className="hidden sm:inline">上传</span></a>
            {user ? <a href={`/profile.html?user=${encodeURIComponent(user.username)}`} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.045] py-1.5 pl-1.5 pr-2 text-sm text-zinc-200 transition hover:border-white/20 hover:bg-white/[.08] sm:pr-3"><span className="flex size-7 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[.06]">{user.avatarUrl?<img src={user.avatarUrl} alt="我的头像" className="size-full object-cover"/>:<UserRound size={15}/>}</span><span className="hidden sm:inline">{user.displayName || user.username}</span></a>
              : <a href="/upload.html" className="rounded-xl border border-violet-300/25 bg-violet-400/10 px-4 py-2 text-sm text-violet-200 transition hover:bg-violet-400/15">登录</a>}
          </nav>
        </div>
      </header>

      <main className="relative mx-auto max-w-[1440px] px-4 pb-20 pt-12 sm:px-6 lg:px-8 lg:pt-16">
        <section className="mx-auto max-w-3xl">
          <form onSubmit={search} className="flex rounded-2xl border border-white/10 bg-white/[.055] p-1.5 shadow-[0_18px_70px_rgba(0,0,0,.3),0_0_45px_rgba(167,139,250,.04)] backdrop-blur-2xl focus-within:border-violet-300/30">
            <Search className="ml-3 self-center text-zinc-500" size={19} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索表情包标签" className="min-w-0 flex-1 bg-transparent px-3 py-3 text-sm text-white outline-none placeholder:text-zinc-600 sm:text-base" />
            <button className="rounded-xl bg-violet-400 px-5 font-semibold text-[#0b0c12] transition hover:bg-violet-300 sm:px-7">搜索</button>
          </form>
          {!!tags.length && <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-zinc-600">
            {tags.slice(0, 8).map((item) => <button key={item.name} onClick={() => { setQuery(item.name); setTag(item.name); setPage(1); }} className="transition hover:text-violet-300">#{item.name}</button>)}
          </div>}
        </section>

        <section ref={galleryRef} className="scroll-mt-24 pt-14">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-zinc-600">点击图片显示操作，长按图片可多选下载</p>
            <div className="flex w-fit rounded-xl border border-white/10 bg-white/[.035] p-1 backdrop-blur-xl">
              {[['default','默认排序'],['latest','最新上传'],['downloads','下载最多'],['favorites','收藏最多']].map(([value,label]) => <button key={value} onClick={() => { setSort(value); setPage(1); }} className={`rounded-lg px-3 py-2 text-xs transition sm:px-4 sm:text-sm ${sort === value ? 'bg-white/10 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-200'}`}>{label}</button>)}
            </div>
          </div>

          {loading ? <div className="columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4 xl:columns-5">{Array.from({length:15},(_,i)=><div key={i} className="mb-4 h-56 break-inside-avoid animate-pulse rounded-2xl border border-white/[.06] bg-white/[.035]" />)}</div>
            : items.length ? <div className="columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4 xl:columns-5">{items.map((meme) => <MemeCard key={meme.id} meme={meme} active={activeId===meme.id} selected={selectedIds.has(meme.id)} selectionMode={selectionMode} onActivate={setActiveId} onToggleSelected={toggleSelected} />)}</div>
            : <div className="rounded-2xl border border-dashed border-white/10 bg-white/[.025] py-24 text-center text-zinc-500">没有找到相关表情包</div>}
          <Pagination page={page} totalPages={totalPages} onChange={changePage} />
        </section>
      </main>
      {selectionMode&&<div className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-[calc(100%-2rem)] max-w-lg items-center gap-3 rounded-2xl border border-white/15 bg-[#11141e]/90 p-3 shadow-[0_20px_80px_rgba(0,0,0,.55)] backdrop-blur-2xl"><button onClick={()=>setSelectedIds(new Set())} aria-label="取消多选" className="flex size-10 shrink-0 items-center justify-center rounded-xl text-zinc-400 transition hover:bg-white/[.07] hover:text-white"><X size={18}/></button><span className="min-w-0 flex-1 text-sm text-zinc-300">已选择 <b className="text-white">{selectedIds.size}</b> 张</span><a href={batchDownloadUrl} download onClick={()=>setTimeout(()=>setSelectedIds(new Set()),500)} className="flex items-center gap-2 rounded-xl bg-violet-400 px-4 py-2.5 text-sm font-semibold text-[#0b0c12] transition hover:bg-violet-300"><Download size={17}/>打包下载</a></div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
