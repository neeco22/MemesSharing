import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Camera, CheckCircle2, FileImage, ImagePlus, LogOut, Save, Trash2, UploadCloud, UserRound, X, XCircle, Zap } from 'lucide-react';
import { PageShell, glassPanel, inputClass, primaryButton } from './shell.jsx';
import { takeSharedFiles } from './share-inbox.js';
import './styles.css';

function Notice({ notice }) {
  if (!notice) return null;
  const ok = notice.type === 'ok';
  return <div className={`mt-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${ok ? 'border-lime-300/15 bg-lime-300/[.06] text-lime-200' : 'border-rose-300/15 bg-rose-300/[.06] text-rose-200'}`}>{ok ? <CheckCircle2 size={17}/> : <XCircle size={17}/>}<span className="whitespace-pre-line">{notice.text}</span></div>;
}

function AuthCard({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username:'', password:'', displayName:'' });
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(null);
  const registering = mode === 'register';
  async function submit(event) {
    event.preventDefault();
    if (!form.username.trim() || !form.password) return setNotice({type:'error',text:'请输入用户名和密码'});
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/${mode}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...form, username:form.username.trim(), displayName:form.displayName.trim()}) });
      const data = await response.json().catch(()=>({}));
      if (!response.ok) throw new Error(data.error || (registering ? '注册失败' : '登录失败'));
      onAuthenticated(data.user);
      const next = new URLSearchParams(location.search).get('next');
      if (next?.startsWith('/') && !next.startsWith('//')) setTimeout(()=>{ location.href=next; }, 300);
    } catch (error) { setNotice({type:'error',text:error.message}); } finally { setBusy(false); }
  }
  return <div className="mx-auto grid min-h-[calc(100vh-72px)] max-w-6xl items-center gap-12 px-4 py-12 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:px-8">
    <section className="hidden lg:block"><p className="mb-4 text-sm font-medium uppercase tracking-[.22em] text-violet-300">Welcome to Meme.Share</p><h1 className="max-w-xl text-6xl font-bold leading-[1.05] tracking-[-.055em] text-white">收藏灵感，<br/><span className="text-zinc-500">分享每一个表情。</span></h1><p className="mt-7 max-w-md text-base leading-7 text-zinc-500">登录后即可上传、收藏表情包，并建立属于你的个人主页。</p></section>
    <section className={`${glassPanel} p-6 sm:p-8`}><div className="mb-7"><span className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-400/10 text-violet-300"><UserRound size={22}/></span><h2 className="text-2xl font-bold tracking-tight">{registering?'创建账号':'欢迎回来'}</h2><p className="mt-2 text-sm text-zinc-500">{registering?'注册后即可开始分享表情包':'登录以继续上传和收藏'}</p></div>
      <div className="mb-6 grid grid-cols-2 rounded-xl border border-white/10 bg-black/20 p-1">{[['login','登录'],['register','注册']].map(([value,label])=><button key={value} onClick={()=>{setMode(value);setNotice(null)}} className={`rounded-lg py-2.5 text-sm transition ${mode===value?'bg-white/10 text-white':'text-zinc-500 hover:text-zinc-300'}`}>{label}</button>)}</div>
      <form onSubmit={submit} className="space-y-4">{registering&&<label className="block text-sm text-zinc-400">昵称（可选）<input className={inputClass} maxLength={30} autoComplete="nickname" value={form.displayName} onChange={e=>setForm({...form,displayName:e.target.value})}/></label>}<label className="block text-sm text-zinc-400">用户名<input className={inputClass} autoComplete="username" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/></label><label className="block text-sm text-zinc-400">密码<input type="password" className={inputClass} autoComplete={registering?'new-password':'current-password'} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label><button disabled={busy} className={`${primaryButton} mt-2 w-full`}>{busy?(registering?'注册中…':'登录中…'):(registering?'创建账号':'登录')}</button></form><Notice notice={notice}/>
    </section>
  </div>;
}

function ManageItem({ item, onDelete, onUpdated, setNotice }) {
  const [draft, setDraft] = useState((item.tags || []).join(' '));
  const [saving, setSaving] = useState(false);

  function removeTag(tag) {
    const next = (item.tags || []).filter(value => value !== tag).join(' ');
    setDraft(next);
    saveTags(next);
  }

  async function saveTags(nextDraft = draft) {
    setSaving(true);
    try {
      const response = await fetch(`/api/images/${item.id}/tags`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: nextDraft }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '标签保存失败');
      onUpdated(data);
      setDraft((data.tags || []).join(' '));
      setNotice({ type: 'ok', text: '标签已更新' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  }

  return <div className="rounded-2xl px-3 py-3 transition hover:bg-white/[.04]">
    <div className="flex items-start gap-3">
      {/\.webm$/i.test(item.originalName) ? <video src={`/img/${item.id}`} className="size-12 shrink-0 rounded-lg object-cover"/> : <img src={`/img/${item.id}`} alt="" className="size-12 shrink-0 rounded-lg object-cover"/>}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-zinc-400">{item.originalName}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">{item.tags?.length ? item.tags.map(tag => <button key={tag} onClick={() => removeTag(tag)} title="移除这个标签" className="group flex items-center gap-1 rounded-full border border-white/10 bg-white/[.04] px-2 py-1 text-xs text-zinc-400 transition hover:border-rose-300/25 hover:text-rose-200">#{tag}<X size={11} className="opacity-50 group-hover:opacity-100"/></button>) : <span className="text-xs text-zinc-600">暂无标签</span>}</div>
      </div>
      <button onClick={() => onDelete(item)} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-rose-300 transition hover:bg-rose-400/10"><Trash2 size={14}/>删除</button>
    </div>
    <div className="mt-3 flex flex-col gap-2 pl-0 sm:flex-row sm:pl-[60px]"><input value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') saveTags(); }} maxLength={320} aria-label="编辑标签" placeholder="输入新标签，多个标签用空格或逗号分隔" className={`${inputClass} !mt-0 flex-1`}/><button disabled={saving} onClick={() => saveTags()} className={`${primaryButton} shrink-0 px-4`}><Save size={15}/>{saving ? '保存中…' : '保存标签'}</button></div>
  </div>;
}

function UploadPanel({ user, onLogout }) {
  const [files,setFiles]=useState([]); const [tags,setTags]=useState(''); const [drag,setDrag]=useState(false); const [busy,setBusy]=useState(false); const [quick,setQuick]=useState(false); const [notice,setNotice]=useState(null); const [manage,setManage]=useState(false); const [own,setOwn]=useState([]); const inputRef=useRef(null); const cameraRef=useRef(null); const quickRef=useRef(false); const busyRef=useRef(false);
  const previews=useMemo(()=>files.map(file=>({file,url:URL.createObjectURL(file)})),[files]);
  useEffect(()=>()=>previews.forEach(item=>URL.revokeObjectURL(item.url)),[previews]);
  useEffect(()=>{takeSharedFiles().then(shared=>{if(shared.length){addFiles(shared);setNotice({type:'ok',text:`已从其他应用接收 ${shared.length} 张图片`})}else if(new URLSearchParams(location.search).has('shareError'))setNotice({type:'error',text:'这次分享没有读取到图片，请返回微信后重新选择图片分享。'})}).catch(()=>setNotice({type:'error',text:'读取分享图片失败，请重试'}))},[]);
  useEffect(()=>{quickRef.current=quick},[quick]);
  useEffect(()=>{busyRef.current=busy},[busy]);

  function supportedFiles(source){
    const allowed=/\.(jpe?g|png|gif|webp|webm|avif)$/i;
    return Array.from(source||[]).filter(file=>file.type?.startsWith('image/')||file.type==='video/webm'||allowed.test(file.name));
  }
  function addFiles(source){
    const incoming=supportedFiles(source);
    if(!incoming.length){setNotice({type:'error',text:'没有读取到图片。若聊天窗口无法直接拖拽，请复制图片后按 Ctrl + V。'});return}
    setFiles(current=>{const keys=new Set(current.map(file=>`${file.name}-${file.size}-${file.lastModified}`));return [...current,...incoming.filter(file=>!keys.has(`${file.name}-${file.size}-${file.lastModified}`))]});
    setNotice({type:'ok',text:`已读取 ${incoming.length} 张图片`});
    if(quickRef.current&&!busyRef.current)uploadBatch(incoming,true);
  }
  useEffect(()=>{const pasted=event=>{const direct=Array.from(event.clipboardData?.files||[]);const itemFiles=Array.from(event.clipboardData?.items||[]).map(item=>item.kind==='file'?item.getAsFile():null).filter(Boolean);const images=supportedFiles(direct.length?direct:itemFiles);if(images.length){event.preventDefault();addFiles(images)}};document.addEventListener('paste',pasted);return()=>document.removeEventListener('paste',pasted)},[]);

  async function uploadBatch(batch=files,automatic=false){if(!batch.length||busyRef.current)return;busyRef.current=true;setBusy(true);let ok=0;const failed=[];for(const file of batch){const data=new FormData();data.append('image',file);data.append('tags',tags.trim());try{const response=await fetch('/api/upload',{method:'POST',body:data});if(response.ok)ok++;else failed.push(`${file.name}: ${(await response.json().catch(()=>({}))).error||'上传失败'}`)}catch{failed.push(`${file.name}: 网络错误`)}}busyRef.current=false;setBusy(false);if(automatic)setFiles(current=>current.filter(file=>!batch.includes(file)));else if(!failed.length){setFiles([]);setTags('')}if(failed.length)setNotice({type:'error',text:`成功 ${ok} 张，失败：\n${failed.join('\n')}`});else setNotice({type:'ok',text:`已上传 ${ok} 张图片`})}
  async function loadManage(){const response=await fetch('/api/me/images');const list=await response.json();if(response.ok)setOwn(list);else setNotice({type:'error',text:list.error||'加载上传记录失败'})}
  async function remove(item){if(!confirm(`确定删除「${item.originalName}」？`))return;const response=await fetch(`/api/images/${item.id}`,{method:'DELETE'});if(response.ok){setNotice({type:'ok',text:'已删除'});loadManage()}else setNotice({type:'error',text:(await response.json().catch(()=>({}))).error||'删除失败'})}
  return <PageShell action={<><span className="hidden text-sm text-zinc-500 sm:inline">{user.displayName||user.username}</span><button onClick={onLogout} title="退出登录" className="rounded-xl p-2 text-zinc-500 transition hover:bg-white/5 hover:text-white"><LogOut size={17}/></button></>}><div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8"><div className="mb-9"><p className="mb-2 text-xs font-medium uppercase tracking-[.2em] text-violet-300">Share your reaction</p><h1 className="text-4xl font-bold tracking-[-.045em]">上传表情包</h1><p className="mt-3 text-sm text-zinc-500">一次可以选择多张图片，并为它们添加相同标签。</p></div>
    <section className={`${glassPanel} p-5 sm:p-8`}><input ref={inputRef} type="file" hidden multiple accept="image/jpeg,image/png,image/gif,image/webp,image/avif,video/webm,.webm" onChange={e=>{addFiles(e.target.files);e.target.value=''}}/><input ref={cameraRef} type="file" hidden accept="image/*" capture="environment" onChange={e=>{addFiles(e.target.files);e.target.value=''}}/><div onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={e=>{e.preventDefault();setDrag(false)}} onDrop={e=>{e.preventDefault();setDrag(false);addFiles(e.dataTransfer.files)}} className={`flex w-full flex-col items-center rounded-2xl border border-dashed px-6 py-12 transition ${drag?'border-violet-300/60 bg-violet-400/10':'border-white/15 bg-black/15 hover:border-violet-300/35 hover:bg-violet-400/[.035]'}`}><span className="mb-4 flex size-14 items-center justify-center rounded-2xl border border-violet-300/20 bg-violet-400/10 text-violet-300"><UploadCloud size={25}/></span><b className="text-center text-base text-zinc-200">拖入聊天图片，或复制后按 Ctrl + V</b><span className="mt-2 text-center text-xs text-zinc-600">支持多张 JPG、PNG、GIF、WebP、WebM、AVIF · 单张最大 50MB</span><div className="mt-5 flex flex-wrap justify-center gap-2"><button type="button" onClick={()=>inputRef.current?.click()} className="rounded-xl border border-white/10 bg-white/[.06] px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-white/[.1]">选择图片或相册</button><button type="button" onClick={()=>cameraRef.current?.click()} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[.06] px-4 py-2.5 text-sm text-zinc-200 transition hover:bg-white/[.1]"><Camera size={16}/>拍照上传</button></div></div><button type="button" onClick={()=>setQuick(value=>!value)} className={`mt-4 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${quick?'border-lime-300/25 bg-lime-300/[.07] text-lime-200':'border-white/10 bg-white/[.025] text-zinc-400 hover:bg-white/[.05]'}`}><span className="flex items-center gap-2 text-sm"><Zap size={16}/>快速上传模式</span><span className="text-xs">{quick?'已开启：新图片自动上传':'关闭：确认后再上传'}</span></button>
    {!!previews.length&&<div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-5">{previews.map(({file,url},i)=><div key={`${file.name}-${i}`} className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/20">{/\.webm$/i.test(file.name)?<video src={url} className="aspect-square w-full object-cover"/>:<img src={url} alt="待上传预览" className="aspect-square w-full object-cover"/>}<button onClick={()=>setFiles(files.filter((_,index)=>index!==i))} className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-black/70 text-white opacity-0 backdrop-blur transition group-hover:opacity-100"><X size={14}/></button></div>)}</div>}
    {!quick&&<><label className="mt-6 block text-sm text-zinc-400">标签（可选）<input value={tags} onChange={e=>setTags(e.target.value)} maxLength={160} placeholder="多个标签用空格或逗号分隔" className={inputClass}/></label><button onClick={()=>uploadBatch()} disabled={!files.length||busy} className={`${primaryButton} mt-5 w-full`}><ImagePlus size={18}/>{busy?'上传中…':files.length?`上传 ${files.length} 张图片`:'选择图片后上传'}</button></>} {quick&&busy&&<div className="mt-5 text-center text-sm text-lime-200">正在自动上传…</div>}<Notice notice={notice}/></section>
    <section className="mt-6"><button onClick={()=>{const next=!manage;setManage(next);if(next)loadManage()}} className="flex items-center gap-2 text-sm text-zinc-500 transition hover:text-white"><FileImage size={16}/>{manage?'收起上传管理':'管理我上传的图片'}</button>{manage&&<div className={`${glassPanel} mt-4 overflow-hidden p-2`}>{own.length?own.map(item=><ManageItem key={item.id} item={item} onDelete={remove} onUpdated={updated=>setOwn(list=>list.map(value=>value.id===updated.id?updated:value))} setNotice={setNotice}/>):<p className="py-10 text-center text-sm text-zinc-600">还没有上传内容</p>}</div>}</section>
  </div></PageShell>;
}

function App(){const [user,setUser]=useState(undefined);useEffect(()=>{fetch('/api/auth').then(async r=>setUser(r.ok?(await r.json()).user:null)).catch(()=>setUser(null))},[]);async function logout(){await fetch('/api/logout',{method:'POST'});setUser(null)}if(user===undefined)return <PageShell><div className="py-40 text-center text-zinc-600">正在加载…</div></PageShell>;return user?<UploadPanel user={user} onLogout={logout}/>:<PageShell><AuthCard onAuthenticated={setUser}/></PageShell>}
createRoot(document.getElementById('root')).render(<React.StrictMode><App/></React.StrictMode>);
