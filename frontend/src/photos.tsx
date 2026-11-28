import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, BadgeCheck, ChevronLeft, ChevronRight, CloudUpload, Eye, ImageIcon,
  ImagePlus, MoreVertical, RefreshCw, Star, Trash2, X,
} from "lucide-react";
import {
  apiDelete, apiGet, apiPost, apiPut, apiUploadWithProgress,
  type Business, type BusinessPhoto, type PhotoLibrary as Library,
} from "./services/api";
import { useT } from "./i18n";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
const MAX_BYTES = 8 * 1024 * 1024;
const BATCH = 10;

type Staged = { id: string; file: File; url: string; problem?: string };

export function formatBytes(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function PhotoLibrary({ owned }: { owned: Business[] }) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [businessId, setBusinessId] = useState(owned[0]?.id ?? "");
  useEffect(() => { if (!owned.some((b) => b.id === businessId)) setBusinessId(owned[0]?.id ?? ""); }, [owned, businessId]);
  const business = owned.find((b) => b.id === businessId);
  const base = `/owner/businesses/${businessId}/photos/`;
  const key = ["owner-photos", businessId];
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: key, queryFn: () => apiGet<Library>(base), enabled: Boolean(businessId) });
  const photos = data?.photos ?? [];
  const limit = data?.limit ?? 3;

  const [staged, setStaged] = useState<Staged[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string; extra?: string[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<BusinessPhoto | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const dragDepth = useRef(0);

  // Free object URLs when staged previews go away.
  useEffect(() => () => staged.forEach((item) => URL.revokeObjectURL(item.url)), [staged]);

  const apply = useCallback((library: Library) => {
    queryClient.setQueryData(key, library);
    void queryClient.invalidateQueries({ queryKey: ["owner-businesses"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, businessId]);

  function check(file: File) {
    if (!ACCEPT.includes(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) return t("ph.errType");
    if (file.size > MAX_BYTES) return t("ph.errSize");
    return undefined;
  }

  function stage(files: FileList | File[]) {
    setMessage(null);
    const next = Array.from(files).map((file) => ({ id: crypto.randomUUID(), file, url: URL.createObjectURL(file), problem: check(file) }));
    setStaged((current) => [...current, ...next]);
  }

  const good = staged.filter((item) => !item.problem);
  const room = Math.max(limit - photos.length, 0);

  async function uploadStaged() {
    if (!good.length || !businessId) return;
    setBusy(true);
    setMessage(null);
    const toSend = good.slice(0, room);
    const notes: string[] = [];
    if (good.length > room) notes.push(t("ph.overLimit", { n: good.length - room, limit }));
    let latest: Library | null = null;
    try {
      for (let i = 0; i < toSend.length; i += BATCH) {
        const chunk = toSend.slice(i, i + BATCH);
        const form = new FormData();
        chunk.forEach((item) => form.append("files", item.file, item.file.name));
        latest = await apiUploadWithProgress<Library>(base, form, (fraction) => {
          setProgress((i + fraction * chunk.length) / toSend.length);
        });
        if (latest.errors?.length) notes.push(...latest.errors);
        apply(latest);
      }
      setStaged([]);
      setMessage({ kind: "ok", text: t("ph.uploaded", { n: toSend.length }), extra: notes });
    } catch (cause) {
      setMessage({ kind: "error", text: cause instanceof Error ? cause.message : t("err.request"), extra: notes });
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  async function run(action: () => Promise<Library>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      apply(await action());
      setMessage({ kind: "ok", text: success });
    } catch (cause) {
      setMessage({ kind: "error", text: cause instanceof Error ? cause.message : t("err.request") });
      void refetch();
    } finally {
      setBusy(false);
      setMenuFor(null);
    }
  }

  const setRole = (photo: BusinessPhoto, role: "cover" | "logo") =>
    run(() => apiPost<Library>(`${base}${photo.id}/role/`, { as: role }), t(role === "cover" ? "ph.coverSet" : "ph.logoSet"));
  const remove = (photo: BusinessPhoto) => run(() => apiDelete<Library>(`${base}${photo.id}/`), t("ph.deleted"));
  const reorder = (ids: string[]) => {
    // Show the new order straight away, then save it.
    const byId = new Map(photos.map((p) => [p.id, p]));
    queryClient.setQueryData<Library>(key, (old) => old && { ...old, photos: ids.map((id) => byId.get(id)!).filter(Boolean) });
    return run(() => apiPut<Library>(`${base}order/`, { ids }), t("ph.reordered"));
  };
  const move = (photo: BusinessPhoto, step: number) => {
    const ids = photos.map((p) => p.id);
    const from = ids.indexOf(photo.id);
    const to = from + step;
    if (to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    void reorder(ids);
  };

  async function replace(file: File) {
    const id = replaceTarget.current;
    replaceTarget.current = null;
    if (!id) return;
    const problem = check(file);
    if (problem) { setMessage({ kind: "error", text: problem }); return; }
    const form = new FormData();
    form.append("file", file, file.name);
    setBusy(true);
    try {
      const library = await apiUploadWithProgress<Library>(`${base}${id}/`, form, setProgress, "PUT");
      apply(library);
      setMessage({ kind: "ok", text: t("ph.replaced") });
    } catch (cause) {
      setMessage({ kind: "error", text: cause instanceof Error ? cause.message : t("err.request") });
    } finally {
      setProgress(null);
      setBusy(false);
      setMenuFor(null);
    }
  }

  // Whole-page drop target, like Drive.
  const dropHandlers = {
    onDragEnter: (event: DragEvent) => { if (event.dataTransfer.types.includes("Files")) { dragDepth.current += 1; setDragging(true); } },
    onDragLeave: (event: DragEvent) => { if (event.dataTransfer.types.includes("Files")) { dragDepth.current -= 1; if (dragDepth.current <= 0) setDragging(false); } },
    onDragOver: (event: DragEvent) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); },
    onDrop: (event: DragEvent) => {
      if (!event.dataTransfer.files.length) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      stage(event.dataTransfer.files);
    },
  };

  if (!owned.length) {
    return <div className="phEmptyAll"><span className="phEmptyIcon"><ImageIcon size={30} strokeWidth={1.6} /></span><h2>{t("ph.noBusiness")}</h2><p>{t("ph.noBusinessText")}</p></div>;
  }

  return (
    <div className="phPage" {...dropHandlers}>
      <header className="phHead">
        <div>
          <h1>{t("ph.title")}</h1>
          <p>{t("ph.sub")}</p>
        </div>
        <div className="phHeadActions">
          {owned.length > 1 && (
            <label className="phPicker">
              <span className="srOnly">{t("ph.business")}</span>
              <select value={businessId} onChange={(event) => { setBusinessId(event.target.value); setStaged([]); setMessage(null); }}>
                {owned.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          )}
          <button type="button" className="phPrimary" onClick={() => pickRef.current?.click()} disabled={busy || room === 0}>
            <ImagePlus size={18} />{t("ph.upload")}
          </button>
        </div>
      </header>

      <input ref={pickRef} type="file" accept={ACCEPT_ATTR} multiple hidden onChange={(event) => { if (event.target.files) stage(event.target.files); event.target.value = ""; }} />
      <input ref={replaceRef} type="file" accept={ACCEPT_ATTR} hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void replace(file); event.target.value = ""; }} />

      <div className="phMeter">
        <span>{t("ph.count", { n: photos.length, limit })}{business ? ` · ${business.name}` : ""}</span>
        <span className="phMeterBar"><span style={{ width: `${Math.min(100, (photos.length / Math.max(limit, 1)) * 100)}%` }} /></span>
        {room === 0 && <a className="phMeterLink" href="/sobo/business-owner/plans">{t("ph.morePhotos")}</a>}
      </div>

      {message && (
        <div className={`phToast ${message.kind}`} role={message.kind === "error" ? "alert" : "status"}>
          <p>{message.text}</p>
          {message.extra?.map((line) => <p key={line} className="phToastExtra">{line}</p>)}
          <button type="button" aria-label={t("ph.dismiss")} onClick={() => setMessage(null)}><X size={16} /></button>
        </div>
      )}

      {staged.length > 0 ? (
        <section className="phTray" aria-label={t("ph.ready")}>
          <div className="phTrayHead">
            <h2>{t("ph.ready")} <span>{good.length}</span></h2>
            <div>
              <button type="button" className="phGhost" onClick={() => setStaged([])} disabled={busy}>{t("ph.cancel")}</button>
              <button type="button" className="phGhost" onClick={() => pickRef.current?.click()} disabled={busy}>{t("ph.addMore")}</button>
              <button type="button" className="phPrimary" onClick={() => void uploadStaged()} disabled={busy || !good.length || room === 0}>
                <CloudUpload size={18} />{t("ph.uploadN", { n: Math.min(good.length, room) })}
              </button>
            </div>
          </div>
          {progress !== null && (
            <div className="phProgress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
              <span style={{ width: `${Math.round(progress * 100)}%` }} /><em>{t("ph.uploading", { n: Math.round(progress * 100) })}</em>
            </div>
          )}
          <ul className="phTrayGrid">
            {staged.map((item) => (
              <li key={item.id} className={item.problem ? "bad" : ""}>
                <img src={item.url} alt="" />
                <span className="phTrayName"><b>{item.file.name}</b><small>{item.problem ?? formatBytes(item.file.size)}</small></span>
                <button type="button" aria-label={t("ph.removeFile", { name: item.file.name })} onClick={() => setStaged((list) => list.filter((x) => x.id !== item.id))} disabled={busy}><X size={14} /></button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <button type="button" className={`phDrop ${photos.length ? "slim" : ""}`} onClick={() => pickRef.current?.click()} disabled={busy || room === 0}>
          <span className="phDropIcon"><CloudUpload size={photos.length ? 22 : 34} strokeWidth={1.6} /></span>
          <span className="phDropText">
            <b>{t("ph.dropTitle")}</b>
            <small>{t("ph.dropHint")}</small>
          </span>
        </button>
      )}

      {progress !== null && staged.length === 0 && (
        <div className="phProgress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <span style={{ width: `${Math.round(progress * 100)}%` }} /><em>{t("ph.uploading", { n: Math.round(progress * 100) })}</em>
        </div>
      )}

      <section aria-label={t("ph.library")}>
        <div className="phSectionHead">
          <h2>{t("ph.library")}</h2>
          {photos.length > 1 && <p>{t("ph.dragHint")}</p>}
        </div>
        {isLoading ? (
          <ul className="phGrid">{[0, 1, 2, 3].map((n) => <li key={n} className="phTile skeleton" />)}</ul>
        ) : isError ? (
          <div className="phToast error" role="alert"><p>{t("ph.loadError")}</p><button type="button" onClick={() => void refetch()}><RefreshCw size={16} /></button></div>
        ) : !photos.length ? (
          <p className="phNone">{t("ph.none")}</p>
        ) : (
          <ul className="phGrid">
            {photos.map((photo, index) => (
              <li
                key={photo.id}
                className={`phTile ${dragId === photo.id ? "dragging" : ""}`}
                draggable={!busy}
                onDragStart={(event) => { setDragId(photo.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", photo.id); }}
                onDragEnd={() => setDragId(null)}
                onDragOver={(event) => { if (dragId) event.preventDefault(); }}
                onDrop={(event) => {
                  if (!dragId || dragId === photo.id) return;
                  event.preventDefault();
                  event.stopPropagation();
                  const ids = photos.map((p) => p.id).filter((id) => id !== dragId);
                  ids.splice(ids.indexOf(photo.id) + (photos.findIndex((p) => p.id === dragId) < index ? 1 : 0), 0, dragId);
                  setDragId(null);
                  void reorder(ids);
                }}
              >
                <button type="button" className="phThumb" onClick={() => setPreview(index)} aria-label={t("ph.previewN", { n: index + 1 })}>
                  <img src={photo.url} alt="" loading="lazy" />
                  <span className="phBadges">
                    {photo.is_cover && <span className="phBadge cover"><Star size={12} />{t("ph.cover")}</span>}
                    {photo.is_logo && <span className="phBadge logo"><BadgeCheck size={12} />{t("ph.logo")}</span>}
                  </span>
                </button>
                <div className="phTileFoot">
                  <ImageIcon size={16} className="phFileIcon" />
                  <span className="phTileName"><b>{t("ph.photoN", { n: index + 1 })}</b><small>{formatBytes(photo.size)}</small></span>
                  <button type="button" className="phKebab" aria-haspopup="menu" aria-expanded={menuFor === photo.id} aria-label={t("ph.actions", { n: index + 1 })} onClick={() => setMenuFor(menuFor === photo.id ? null : photo.id)}>
                    <MoreVertical size={18} />
                  </button>
                </div>
                <AnimatePresence>
                  {menuFor === photo.id && (
                    <motion.div className="phMenu" role="menu" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}>
                      <button role="menuitem" type="button" onClick={() => { setPreview(index); setMenuFor(null); }}><Eye size={16} />{t("ph.preview")}</button>
                      <button role="menuitem" type="button" disabled={photo.is_cover || busy} onClick={() => void setRole(photo, "cover")}><Star size={16} />{t("ph.makeCover")}</button>
                      <button role="menuitem" type="button" disabled={photo.is_logo || busy} onClick={() => void setRole(photo, "logo")}><BadgeCheck size={16} />{t("ph.makeLogo")}</button>
                      <button role="menuitem" type="button" disabled={busy} onClick={() => { replaceTarget.current = photo.id; replaceRef.current?.click(); }}><RefreshCw size={16} />{t("ph.replace")}</button>
                      <button role="menuitem" type="button" disabled={index === 0 || busy} onClick={() => { move(photo, -1); }}><ArrowLeft size={16} />{t("ph.moveEarlier")}</button>
                      <button role="menuitem" type="button" disabled={index === photos.length - 1 || busy} onClick={() => { move(photo, 1); }}><ArrowRight size={16} />{t("ph.moveLater")}</button>
                      <hr />
                      <button role="menuitem" type="button" className="danger" disabled={busy} onClick={() => { setConfirmDelete(photo); setMenuFor(null); }}><Trash2 size={16} />{t("ph.delete")}</button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AnimatePresence>
        {dragging && (
          <motion.div className="phDropOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div><CloudUpload size={40} strokeWidth={1.6} /><p>{t("ph.dropNow")}</p></div>
          </motion.div>
        )}
      </AnimatePresence>

      {preview !== null && photos[preview] && (
        <Lightbox
          urls={photos.map((p) => p.url)}
          index={preview}
          onIndex={setPreview}
          onClose={() => setPreview(null)}
          caption={(i) => [t("ph.photoN", { n: i + 1 }), photos[i].is_cover ? t("ph.cover") : "", photos[i].is_logo ? t("ph.logo") : ""].filter(Boolean).join(" · ")}
          actions={(i) => (
            <>
              <button type="button" disabled={photos[i].is_cover || busy} onClick={() => void setRole(photos[i], "cover")}><Star size={16} />{t("ph.makeCover")}</button>
              <button type="button" disabled={photos[i].is_logo || busy} onClick={() => void setRole(photos[i], "logo")}><BadgeCheck size={16} />{t("ph.makeLogo")}</button>
              <button type="button" className="danger" disabled={busy} onClick={() => { setConfirmDelete(photos[i]); setPreview(null); }}><Trash2 size={16} />{t("ph.delete")}</button>
            </>
          )}
        />
      )}

      {confirmDelete && (
        <div className="phModalBack" role="presentation" onClick={() => setConfirmDelete(null)}>
          <div className="phModal" role="alertdialog" aria-modal="true" aria-labelledby="ph-del-title" onClick={(event) => event.stopPropagation()}>
            <img src={confirmDelete.url} alt="" />
            <h2 id="ph-del-title">{t("ph.deleteTitle")}</h2>
            <p>{confirmDelete.is_cover ? t("ph.deleteCover") : t("ph.deleteText")}</p>
            <div>
              <button type="button" className="phGhost" onClick={() => setConfirmDelete(null)} autoFocus>{t("ph.cancel")}</button>
              <button type="button" className="phDanger" onClick={() => { const photo = confirmDelete; setConfirmDelete(null); void remove(photo); }}><Trash2 size={16} />{t("ph.delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Full-screen image viewer with arrow-key navigation. Also used on the public listing page. */
export function Lightbox({ urls, index, onIndex, onClose, caption, actions }: {
  urls: string[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  caption?: (index: number) => string;
  actions?: (index: number) => ReactNode;
}) {
  const { t } = useT();
  const count = urls.length;
  const go = useMemo(() => (step: number) => onIndex((index + step + count) % count), [index, count, onIndex]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [go, onClose]);
  return (
    <div className="phLightbox" role="dialog" aria-modal="true" aria-label={t("ph.viewer")} onClick={onClose}>
      <div className="phLbBar" onClick={(event) => event.stopPropagation()}>
        <span>{caption ? caption(index) : ""} <em>{index + 1} / {count}</em></span>
        <div>{actions?.(index)}<button type="button" className="phLbClose" aria-label={t("ph.close")} onClick={onClose}><X size={20} /></button></div>
      </div>
      {count > 1 && <button type="button" className="phLbNav prev" aria-label={t("ph.prev")} onClick={(event) => { event.stopPropagation(); go(-1); }}><ChevronLeft size={28} /></button>}
      <AnimatePresence mode="wait">
        <motion.img key={urls[index]} src={urls[index]} alt="" onClick={(event) => event.stopPropagation()} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
      </AnimatePresence>
      {count > 1 && <button type="button" className="phLbNav next" aria-label={t("ph.next")} onClick={(event) => { event.stopPropagation(); go(1); }}><ChevronRight size={28} /></button>}
    </div>
  );
}
