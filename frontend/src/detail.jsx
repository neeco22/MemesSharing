import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CalendarDays, Download, Heart, Maximize2, Share2, UserRound } from 'lucide-react';
import { PageShell, glassPanel, primaryButton } from './shell.jsx';
import './styles.css';

const formatSize = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

function Media({ item, related = false }) {
  if (item.ext === 'webm') return <video src={`/img/${item.id}`} controls={!related} muted={related} loop playsInline className={related ? 'aspect-[1.25] w-full object-cover' : 'max-h-[78vh] max-w-full object-contain'}/>;
  return <img src={`/img/${item.id}`} alt="表情包" loading={related ? 'lazy' : 'eager'} className={related ? 'aspect-[1.25] w-full object-cover transition duration-500 group-hover:scale-[1.03]' : 'max-h-[78vh] max-w-full object-contain'}/>;
}

function App() {
  const id = new URLSearchParams(location.search).get('id');
  const [meme, setMeme] = useState(null);
  const [related, setRelated] = useState([]);
  const [state, setState] = useState('正在加载…');
  const [sharing, setSharing] = useState(false);
  useEffect(() => {
    if (!id) { setState('缺少表情包编号'); return; }
    Promise.all([fetch(`/api/images/${encodeURIComponent(id)}`), fetch(`/api/images/${encodeURIComponent(id)}/related`)])
      .then(async ([main, rec]) => { if (!main.ok) throw new Error('这个表情包不存在或已被删除'); setMeme(await main.json()); if (rec.ok) setRelated(await rec.json()); })
      .catch(error => setState(error.message || '加载失败，请稍后重试'));
  }, [id]);
  async function favorite() {
    const response = await fetch(`/api/images/${meme.id}/favorite`, { method: meme.favorited ? 'DELETE' : 'POST' });
    if (response.status === 401) { if (confirm('收藏需要先登录，是否前往登录页面？')) location.href = `/upload.html?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
    if (response.ok) setMeme({ ...meme, ...await response.json() });
  }
  async function shareMeme() {
    if (!navigator.share || sharing) {
      alert('当前浏览器不支持系统分享，请先下载原图，再从微信或 QQ 中发送。');
      return;
    }
    setSharing(true);
    try {
      const response = await fetch(`/img/${meme.id}`);
      if (!response.ok) throw new Error('原图读取失败');
      const blob = await response.blob();
      const filename = meme.originalName || `meme.${meme.ext || 'png'}`;
      const file = new File([blob], filename, { type: blob.type || `image/${meme.ext || 'png'}` });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Meme.Share 表情包', files: [file] });
      } else {
        await navigator.share({ title: 'Meme.Share 表情包', text: '分享一个表情包', url: location.href });
        alert('当前浏览器不能直接分享这个图片格式，已改为分享详情页链接。');
      }
    } catch (error) {
      if (error.name !== 'AbortError') alert(error.message || '分享失败，请稍后重试');
    } finally {
      setSharing(false);
    }
  }
  return <PageShell><div className="mx-auto max-w-[1320px] px-4 py-10 sm:px-6 lg:px-8">{!meme ? <div className="py-32 text-center text-zinc-500">{state}</div> : <>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_380px]">
      <section className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-3xl border border-white/10 bg-black/30 shadow-[0_24px_80px_rgba(0,0,0,.35)]"><Media item={meme}/></section>
      <aside className={`${glassPanel} p-6 lg:sticky lg:top-24 lg:p-7`}>
        <a href={`/profile.html?user=${encodeURIComponent(meme.uploaderUsername)}`} className="flex items-center gap-3 rounded-2xl border border-white/[.07] bg-black/15 p-3 text-sm text-zinc-400 transition hover:border-white/15 hover:text-white"><span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[.07] bg-white/[.06]">{meme.uploaderAvatarUrl ? <img src={meme.uploaderAvatarUrl} alt="上传者头像" className="size-full object-cover"/> : <UserRound size={18}/>}</span><span><small className="block text-[11px] text-zinc-600">上传者</small>{meme.uploaderDisplayName || meme.uploaderUsername}</span></a>
        {!!meme.tags?.length && <div className="mt-5 flex flex-wrap gap-2">{meme.tags.map(tag => <a key={tag} href={`/?tag=${encodeURIComponent(tag)}`} className="rounded-full border border-violet-300/15 bg-violet-400/[.07] px-3 py-1.5 text-xs text-violet-200 transition hover:bg-violet-400/15">#{tag}</a>)}</div>}
        <div className="mt-6 grid grid-cols-2 gap-3 border-y border-white/[.07] py-5 text-sm text-zinc-500"><span className="flex items-center gap-2"><Maximize2 size={15}/>{meme.width && meme.height ? `${meme.width} × ${meme.height}` : '未知尺寸'}</span><span>{formatSize(meme.size)}</span><span className="flex items-center gap-2"><Download size={15}/>{meme.downloads} 次下载</span><span className="flex items-center gap-2"><CalendarDays size={15}/>{new Date(meme.uploadedAt).toLocaleDateString('zh-CN')}</span></div>
        <div className="mt-6 grid grid-cols-2 gap-3"><button disabled={sharing} onClick={shareMeme} className="col-span-2 flex items-center justify-center gap-2 rounded-xl border border-lime-300/20 bg-lime-300/[.07] py-3 text-sm font-semibold text-lime-200 transition hover:bg-lime-300/[.12] disabled:opacity-50"><Share2 size={17}/>{sharing ? '正在准备原图…' : '分享到微信 / QQ'}</button><button onClick={favorite} className={`flex items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition ${meme.favorited ? 'border-rose-300/25 bg-rose-400/10 text-rose-200' : 'border-white/10 bg-white/[.035] text-zinc-300 hover:bg-white/[.07]'}`}><Heart size={17} fill={meme.favorited ? 'currentColor' : 'none'}/>{meme.favorited ? '已收藏' : '收藏'}{meme.favoriteCount ? ` ${meme.favoriteCount}` : ''}</button><a onClick={() => setMeme({ ...meme, downloads: meme.downloads + 1 })} href={`/img/${meme.id}?download=1`} className={primaryButton}><Download size={17}/>下载原图</a></div>
      </aside>
    </div>
    {!!related.length && <section className="mt-16"><p className="mb-2 text-xs font-medium uppercase tracking-[.2em] text-violet-300">More like this</p><h2 className="mb-6 text-2xl font-bold tracking-tight">相关推荐</h2><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{related.map(item => <a key={item.id} href={`/detail.html?id=${encodeURIComponent(item.id)}`} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[.035] shadow-[0_12px_36px_rgba(0,0,0,.2)] transition hover:-translate-y-1 hover:border-violet-300/25"><Media item={item} related/></a>)}</div></section>}
  </>}</div></PageShell>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
