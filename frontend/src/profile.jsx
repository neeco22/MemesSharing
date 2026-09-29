import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Camera, ChevronLeft, ChevronRight, Edit3, Heart, Image, LogOut, Sparkles, UserCheck, UserPlus, Users, X } from 'lucide-react';
import { PageShell, glassPanel, inputClass, primaryButton } from './shell.jsx';
import './styles.css';

const PAGE_SIZE = 30;

function MemeTile({ item }) {
  const media = item.ext === 'webm'
    ? <video src={`/img/${item.id}`} muted loop playsInline preload="none" onMouseEnter={e=>e.currentTarget.play().catch(()=>{})} onMouseLeave={e=>e.currentTarget.pause()} className="block h-auto w-full object-cover transition duration-500 group-hover:scale-[1.025]"/>
    : <img src={`/img/${item.id}`} loading="lazy" alt="表情包" className="block h-auto w-full object-cover transition duration-500 group-hover:scale-[1.025]"/>;
  return <a href={`/detail.html?id=${encodeURIComponent(item.id)}`} aria-label="查看表情包详情" className="group relative mb-4 block break-inside-avoid overflow-hidden rounded-2xl border border-white/10 bg-white/[.035] shadow-[0_14px_42px_rgba(0,0,0,.25)] transition duration-300 hover:-translate-y-1 hover:border-violet-300/30">{media}</a>;
}

function EditDialog({ profile, onClose, onSaved }) {
  const [name,setName]=useState(profile.displayName||profile.username);
  const [avatar,setAvatar]=useState(null); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const preview=useMemo(()=>avatar?URL.createObjectURL(avatar):profile.avatarUrl,[avatar,profile.avatarUrl]);
  useEffect(()=>()=>{if(avatar&&preview)URL.revokeObjectURL(preview)},[avatar,preview]);
  async function save(event){
    event.preventDefault(); if(!name.trim())return; setBusy(true); setError('');
    try {
      let response=await fetch('/api/me',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({displayName:name.trim()})});
      let data=await response.json().catch(()=>({})); if(!response.ok)throw new Error(data.error||'昵称保存失败'); let saved=data.user;
      if(avatar){const form=new FormData();form.append('avatar',avatar);response=await fetch('/api/me/avatar',{method:'POST',body:form});data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'头像上传失败');saved=data.user}
      onSaved(saved);
    } catch(err){setError(err.message)} finally {setBusy(false)}
  }
  const fallback=(name||profile.username).slice(0,1).toUpperCase();
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <form onSubmit={save} className={`${glassPanel} w-full max-w-md p-6`}>
      <h2 className="text-xl font-bold">编辑个人资料</h2>
      <label className="group relative mx-auto mt-6 flex size-24 cursor-pointer items-center justify-center overflow-hidden rounded-3xl border border-violet-300/20 bg-violet-400/10 text-violet-200">
        {preview?<img src={preview} alt="头像预览" className="size-full object-cover"/>:<span className="text-3xl font-bold">{fallback}</span>}
        <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100"><Camera size={22}/></span>
        <input type="file" hidden accept="image/jpeg,image/png,image/gif,image/webp,image/avif" onChange={e=>setAvatar(e.target.files?.[0]||null)}/>
      </label>
      <p className="mt-2 text-center text-xs text-zinc-600">点击更换头像，最大 5MB</p>
      <label className="mt-5 block text-sm text-zinc-400">昵称<input autoFocus maxLength={30} value={name} onChange={e=>setName(e.target.value)} className={inputClass}/></label>
      {error&&<p className="mt-3 text-sm text-rose-300">{error}</p>}
      <div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={onClose} className="rounded-xl border border-white/10 py-3 text-sm text-zinc-400 transition hover:bg-white/5">取消</button><button disabled={busy} className={primaryButton}>{busy?'保存中…':'保存'}</button></div>
    </form>
  </div>;
}

function ConnectionsDialog({ title, users, loading, error, onClose }) {
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section role="dialog" aria-modal="true" aria-label={title} className={`${glassPanel} w-full max-w-md overflow-hidden`}>
      <header className="flex items-center justify-between border-b border-white/[.08] px-5 py-4"><div className="flex items-center gap-2"><Users size={18} className="text-violet-300"/><h2 className="font-semibold">{title}</h2></div><button onClick={onClose} aria-label="关闭" className="flex size-9 items-center justify-center rounded-xl text-zinc-500 transition hover:bg-white/[.06] hover:text-white"><X size={18}/></button></header>
      <div className="max-h-[65vh] overflow-y-auto p-2">
        {loading?<p className="py-12 text-center text-sm text-zinc-500">正在加载…</p>:error?<p className="py-12 text-center text-sm text-rose-300">{error}</p>:users.length?users.map(user=><a key={user.id} href={`/profile.html?user=${encodeURIComponent(user.username)}`} className="flex items-center gap-3 rounded-2xl p-3 transition hover:bg-white/[.055]"><span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[.05] font-semibold text-violet-200">{user.avatarUrl?<img src={user.avatarUrl} alt="用户头像" className="size-full object-cover"/>:(user.displayName||user.username).slice(0,1).toUpperCase()}</span><span className="min-w-0"><b className="block truncate text-sm text-zinc-200">{user.displayName||user.username}</b><small className="block truncate text-zinc-600">@{user.username}</small></span></a>):<p className="py-12 text-center text-sm text-zinc-600">这里还没有用户</p>}
      </div>
    </section>
  </div>;
}

function App(){
  const [username,setUsername]=useState(new URLSearchParams(location.search).get('user'));
  const [profile,setProfile]=useState(null); const [items,setItems]=useState([]); const [tab,setTab]=useState('images'); const [page,setPage]=useState(1); const [total,setTotal]=useState(0); const [loading,setLoading]=useState(true); const [message,setMessage]=useState('正在加载…'); const [editing,setEditing]=useState(false); const [connections,setConnections]=useState(null);
  const loadProfile=useCallback(async name=>{const response=await fetch(`/api/users/${encodeURIComponent(name)}`);if(!response.ok)throw new Error('用户不存在');const data=await response.json();setProfile(data);document.title=`${data.displayName||data.username} · Meme.Share`;return data},[]);
  const loadItems=useCallback(async(name,active,nextPage=1)=>{setLoading(true);const endpoint=active==='favorites'?'favorites':'images';const params=new URLSearchParams({limit:String(PAGE_SIZE),offset:String((nextPage-1)*PAGE_SIZE)});const response=await fetch(`/api/users/${encodeURIComponent(name)}/${endpoint}?${params}`);if(response.status===401){location.href=`/upload.html?next=${encodeURIComponent(location.pathname+location.search)}`;return}if(!response.ok)throw new Error('内容加载失败');setItems(await response.json());setTotal(Number(response.headers.get('X-Total-Count'))||0);setLoading(false)},[]);
  useEffect(()=>{(async()=>{try{let name=username;if(!name){const auth=await fetch('/api/auth');if(!auth.ok){location.href='/upload.html?next=/profile.html';return}name=(await auth.json()).user.username;setUsername(name);history.replaceState(null,'',`?user=${encodeURIComponent(name)}`)}await loadProfile(name);await loadItems(name,'images',1)}catch(error){setMessage(error.message);setLoading(false)}})()},[]);
  async function switchTab(next){setTab(next);setPage(1);await loadItems(username,next,1)}
  async function changePage(next){setPage(next);await loadItems(username,tab,next);window.scrollTo({top:document.body.scrollHeight>600?420:0,behavior:'smooth'})}
  async function toggleFollow(){const response=await fetch(`/api/users/${encodeURIComponent(username)}/follow`,{method:profile.isFollowing?'DELETE':'POST'});if(response.status===401){location.href=`/upload.html?next=${encodeURIComponent(location.pathname+location.search)}`;return}if(response.ok)setProfile(await response.json())}
  async function openConnections(type){setConnections({type,title:type==='followers'?'关注者':'正在关注',users:[],loading:true,error:''});try{const response=await fetch(`/api/users/${encodeURIComponent(username)}/${type}`);const data=await response.json().catch(()=>[]);if(!response.ok)throw new Error(data.error||'列表加载失败');setConnections({type,title:type==='followers'?'关注者':'正在关注',users:data,loading:false,error:''})}catch(error){setConnections(current=>({...current,loading:false,error:error.message}))}}
  async function logout(){await fetch('/api/logout',{method:'POST'});location.href='/'}
  if(!profile)return <PageShell><div className="py-40 text-center text-zinc-500">{message}</div></PageShell>;
  const initial=(profile.displayName||profile.username).slice(0,1).toUpperCase();
  return <PageShell action={profile.isSelf?<button onClick={logout} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white"><LogOut size={16}/><span className="hidden sm:inline">退出账号</span></button>:null}><div className="mx-auto max-w-[1320px] px-4 py-10 sm:px-6 lg:px-8">
    <section className={`${glassPanel} relative overflow-hidden p-6 sm:p-9`}>
      <div className="pointer-events-none absolute -right-24 -top-32 size-80 rounded-full bg-violet-400/[.08] blur-3xl"/>
      <div className="relative flex flex-col gap-7 sm:flex-row sm:items-center">
        <div className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-violet-300/20 bg-gradient-to-br from-violet-400/20 to-white/[.03] text-4xl font-bold text-violet-200 shadow-[0_0_45px_rgba(167,139,250,.12)]">{profile.avatarUrl?<img src={profile.avatarUrl} alt="用户头像" className="size-full object-cover"/>:initial}</div>
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h1 className="truncate text-3xl font-bold tracking-[-.04em] sm:text-4xl">{profile.displayName||profile.username}</h1>{profile.role==='admin'&&<Sparkles size={18} className="text-violet-300"/>}</div><p className="mt-2 text-sm text-zinc-500">@{profile.username}</p><div className="mt-6 flex gap-7"><div><b className="block text-xl">{profile.uploadCount}</b><span className="text-xs text-zinc-600">上传</span></div><button onClick={()=>openConnections('followers')} className="text-left transition hover:text-violet-200"><b className="block text-xl">{profile.followerCount}</b><span className="text-xs text-zinc-600">关注者</span></button><button onClick={()=>openConnections('following')} className="text-left transition hover:text-violet-200"><b className="block text-xl">{profile.followingCount}</b><span className="text-xs text-zinc-600">正在关注</span></button></div></div>
        {profile.isSelf?<button onClick={()=>setEditing(true)} className="flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-5 py-3 text-sm text-zinc-300 transition hover:bg-white/[.08]"><Edit3 size={16}/>编辑资料</button>:<button onClick={toggleFollow} className={profile.isFollowing?'flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-5 py-3 text-sm text-zinc-300':primaryButton}>{profile.isFollowing?<><UserCheck size={17}/>已关注</>:<><UserPlus size={17}/>关注</>}</button>}
      </div>
    </section>
    <section className="mt-10"><div className="mb-6 flex gap-2 border-b border-white/[.07]"><button onClick={()=>switchTab('images')} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm ${tab==='images'?'border-violet-400 text-white':'border-transparent text-zinc-500'}`}><Image size={16}/>上传的表情包</button>{profile.isSelf&&<button onClick={()=>switchTab('favorites')} className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm ${tab==='favorites'?'border-violet-400 text-white':'border-transparent text-zinc-500'}`}><Heart size={16}/>我的收藏</button>}</div>{loading?<div className="columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4 xl:columns-5">{Array.from({length:15},(_,i)=><div key={i} className="mb-4 h-48 break-inside-avoid animate-pulse rounded-2xl border border-white/[.06] bg-white/[.035]"/>)}</div>:items.length?<><div className="columns-2 gap-3 sm:columns-3 sm:gap-4 lg:columns-4 xl:columns-5">{items.map(item=><MemeTile key={item.id} item={item}/>)}</div>{total>PAGE_SIZE&&<nav className="mt-10 flex items-center justify-center gap-3"><button disabled={page===1} onClick={()=>changePage(page-1)} className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[.04] text-zinc-300 transition hover:bg-white/[.08] disabled:opacity-30"><ChevronLeft size={17}/></button><span className="min-w-24 text-center text-sm text-zinc-500">第 {page} / {Math.ceil(total/PAGE_SIZE)} 页</span><button disabled={page>=Math.ceil(total/PAGE_SIZE)} onClick={()=>changePage(page+1)} className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[.04] text-zinc-300 transition hover:bg-white/[.08] disabled:opacity-30"><ChevronRight size={17}/></button></nav>}</>:<div className="rounded-2xl border border-dashed border-white/10 bg-white/[.025] py-24 text-center text-zinc-600">这里还没有内容</div>}</section>
    {editing&&<EditDialog profile={profile} onClose={()=>setEditing(false)} onSaved={user=>{setProfile({...profile,displayName:user.displayName,avatarUrl:user.avatarUrl});setEditing(false)}}/>}
    {connections&&<ConnectionsDialog {...connections} onClose={()=>setConnections(null)}/>}
  </div></PageShell>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
