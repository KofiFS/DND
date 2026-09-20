import { useState, useEffect, useRef, useCallback } from "react";
import { addMap, getMaps, deleteMap, patchMap, prepareMapImage } from "./mapdb.js";
import { PALETTE } from "./theme.js";

// ── Maps ──
// Upload region/battle maps and drop pins on them: where the party is, where
// each character is, what is waiting in the next room. Pins are stored as
// fractions of the image (0..1), so they stay put through any zoom, any screen
// size, and any re-upload of the same map at a different resolution.

const KINDS = {
  party: { icon: "★", color: "#c9882a", label: "Party" },
  char: { icon: "◉", color: "#3d6a1c", label: "Character" },
  enemy: { icon: "✖", color: "#7a1c1c", label: "Enemy" },
  place: { icon: "⚑", color: "#1c4a7a", label: "Place" },
};
const KIND_ORDER = ["party", "char", "enemy", "place"];
const kindOf = (m) => KINDS[m.kind] || KINDS.place;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const newId = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

// ── The pan/zoom surface ────────────────────────────────────────────────
// Owns its own view (scale + translate) so that mounting it in the fullscreen
// overlay re-fits the map to the larger box instead of inheriting a view that
// was framed for the small one.
function MapCanvas({ map, markers, selectedId, placing, focus, height, fullscreen, onPlace, onMoveMarker, onSelect, onToggleFullscreen }) {
  const boxRef = useRef(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [fitScale, setFitScale] = useState(1);

  // Live gesture bookkeeping. Refs, not state: these change many times per
  // frame and must never queue a render of their own.
  const pointers = useRef(new Map());
  const pan = useRef(null);
  const pinch = useRef(null);
  const pinDrag = useRef(null);
  const moved = useRef(false);

  const measure = useCallback(() => {
    const el = boxRef.current;
    if (!el || !map) return null;
    return { cw: el.clientWidth, ch: el.clientHeight };
  }, [map]);

  const fit = useCallback(() => {
    const m = measure();
    if (!m) return;
    const sc = Math.min(m.cw / map.w, m.ch / map.h) || 1;
    setFitScale(sc);
    setView({ scale: sc, tx: (m.cw - map.w * sc) / 2, ty: (m.ch - map.h * sc) / 2 });
  }, [map, measure]);

  // Re-frame when the map itself changes, not on every container resize: a
  // phone collapsing its URL bar mid-inspection should not throw away the zoom.
  useEffect(() => { fit(); }, [map?.id, fullscreen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const m = measure();
      if (m && map) setFitScale(Math.min(m.cw / map.w, m.ch / map.h) || 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, measure]);

  const minScale = fitScale * 0.5;
  const maxScale = Math.max(fitScale * 10, 4);
  const clampScale = (s) => clamp(s, minScale, maxScale);

  // Zoom about a fixed point in container space, so the pixel under the
  // fingers (or the cursor) does not slide out from under them.
  const zoomAbout = (nextScale, cx, cy) =>
    setView((v) => {
      const s = clampScale(nextScale);
      return { scale: s, tx: cx - ((cx - v.tx) / v.scale) * s, ty: cy - ((cy - v.ty) / v.scale) * s };
    });

  const zoomByStep = (factor) => {
    const m = measure();
    if (!m) return;
    zoomAbout(view.scale * factor, m.cw / 2, m.ch / 2);
  };

  // Center the view on a pin without changing the zoom level.
  useEffect(() => {
    if (!focus || !map) return;
    const mk = (markers || []).find((x) => x.id === focus.id);
    const m = measure();
    if (!mk || !m) return;
    setView((v) => ({ ...v, tx: m.cw / 2 - mk.x * map.w * v.scale, ty: m.ch / 2 - mk.y * map.h * v.scale }));
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const local = (e) => {
    const r = boxRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // Container point -> image fraction, using the view as it is right now.
  const toFrac = (pt, v) => ({
    x: clamp((pt.x - v.tx) / v.scale / map.w, 0, 1),
    y: clamp((pt.y - v.ty) / v.scale / map.h, 0, 1),
  });

  const onPointerDown = (e) => {
    if (!map) return;
    boxRef.current.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    moved.current = false;
    if (pointers.current.size === 1) {
      pan.current = { ...local(e), tx: view.tx, ty: view.ty };
      pinch.current = null;
    } else if (pointers.current.size === 2) {
      // A second finger cancels an in-progress pan or pin drag and starts a
      // pinch; without this the pin would jump to the midpoint.
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: dist(a, b) || 1, mid: mid(a, b), ...view };
      pan.current = null;
      pinDrag.current = null;
    }
  };

  const onPointerMove = (e) => {
    if (!map || !pointers.current.has(e.pointerId)) return;
    const pt = local(e);
    pointers.current.set(e.pointerId, pt);

    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const g = pinch.current;
      const s = clampScale((g.scale * (dist(a, b) || 1)) / g.dist);
      const m2 = mid(a, b);
      setView({
        scale: s,
        tx: m2.x - ((g.mid.x - g.tx) / g.scale) * s,
        ty: m2.y - ((g.mid.y - g.ty) / g.scale) * s,
      });
      moved.current = true;
      return;
    }

    if (pinDrag.current) {
      const f = toFrac(pt, view);
      if (Math.hypot(pt.x - pinDrag.current.x0, pt.y - pinDrag.current.y0) > 3) moved.current = true;
      onMoveMarker(pinDrag.current.id, f.x, f.y, false);
      return;
    }

    if (pan.current) {
      const p = pan.current;
      if (Math.hypot(pt.x - p.x, pt.y - p.y) > 4) moved.current = true;
      setView((v) => ({ ...v, tx: p.tx + (pt.x - p.x), ty: p.ty + (pt.y - p.y) }));
    }
  };

  const endPointer = (e) => {
    if (!map) return;
    const pt = pointers.current.get(e.pointerId) || local(e);
    pointers.current.delete(e.pointerId);

    if (pinDrag.current) {
      const id = pinDrag.current.id;
      pinDrag.current = null;
      if (moved.current) {
        const f = toFrac(pt, view);
        onMoveMarker(id, f.x, f.y, true); // commit the drag to storage
      } else {
        onSelect(id); // a tap on a pin selects it
      }
    } else if (!moved.current && placing && pointers.current.size === 0 && !pinch.current) {
      const f = toFrac(pt, view);
      onPlace(f.x, f.y);
    }

    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) pan.current = null;
  };

  const onWheel = (e) => {
    if (!map) return;
    e.preventDefault();
    const pt = local(e);
    zoomAbout(view.scale * (1 - e.deltaY * 0.0015), pt.x, pt.y);
  };

  const ctrlBtn = {
    width: 34, height: 34, borderRadius: 8, border: `1px solid ${PALETTE.gold}`,
    background: "rgba(26,10,2,0.82)", color: PALETTE.goldLt, fontSize: "1rem",
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "Cinzel,serif", lineHeight: 1, padding: 0,
  };

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onWheel={onWheel}
      style={{
        position: "relative", height, width: "100%", overflow: "hidden",
        borderRadius: fullscreen ? 0 : 12, border: fullscreen ? "none" : `1px solid ${PALETTE.gold}`,
        background: "#1a0a02", touchAction: "none", cursor: placing ? "crosshair" : "grab",
        userSelect: "none", WebkitUserSelect: "none",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, width: map.w, height: map.h, transform: `translate(${view.tx}px,${view.ty}px) scale(${view.scale})`, transformOrigin: "0 0" }}>
        <img src={map.dataUrl} alt={map.name} draggable={false} style={{ width: map.w, height: map.h, display: "block", pointerEvents: "none" }} />

        {markers.map((mk) => {
          const k = kindOf(mk);
          const sel = mk.id === selectedId;
          const size = mk.kind === "party" ? 34 : 28;
          return (
            <div
              key={mk.id}
              onPointerDown={(e) => { pinDrag.current = { id: mk.id, x0: local(e).x, y0: local(e).y }; }}
              style={{
                position: "absolute", left: mk.x * map.w, top: mk.y * map.h,
                transform: `translate(-50%,-100%) scale(${1 / view.scale})`,
                transformOrigin: "50% 100%", zIndex: sel ? 3 : mk.kind === "party" ? 2 : 1,
                cursor: "grab", touchAction: "none",
              }}
            >
              <div style={{
                width: size, height: size, borderRadius: "50%", background: mk.color || k.color,
                border: `2px solid ${sel ? "#fff" : "rgba(255,255,255,0.85)"}`,
                boxShadow: sel ? "0 0 0 3px rgba(255,255,255,0.55), 0 2px 6px rgba(0,0,0,0.5)" : "0 2px 6px rgba(0,0,0,0.5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontSize: mk.kind === "party" ? "1.05rem" : "0.9rem", lineHeight: 1,
              }}>{k.icon}</div>
              <div style={{
                width: 0, height: 0, margin: "-1px auto 0",
                borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
                borderTop: `7px solid ${mk.color || k.color}`,
              }} />
              {mk.label ? (
                <div style={{
                  position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
                  marginTop: 3, whiteSpace: "nowrap", fontFamily: "Cinzel,serif", fontSize: "0.55rem",
                  letterSpacing: 0.5, color: "#fff", background: "rgba(26,10,2,0.82)",
                  border: `1px solid ${mk.color || k.color}`, borderRadius: 5, padding: "2px 5px",
                }}>{mk.label}</div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div onPointerDown={(e) => e.stopPropagation()}
        style={{ position: "absolute", right: 8, bottom: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        <button style={ctrlBtn} onClick={() => zoomByStep(1.4)} title="Zoom in">+</button>
        <button style={ctrlBtn} onClick={() => zoomByStep(1 / 1.4)} title="Zoom out">−</button>
        <button style={{ ...ctrlBtn, fontSize: "0.5rem", letterSpacing: 1 }} onClick={fit} title="Fit to screen">FIT</button>
        <button style={ctrlBtn} onClick={onToggleFullscreen} title={fullscreen ? "Exit fullscreen" : "Fullscreen"}>{fullscreen ? "⤡" : "⤢"}</button>
      </div>

      {placing ? (
        <div onPointerDown={(e) => e.stopPropagation()} style={{
          position: "absolute", left: 8, top: 8, right: 52, fontFamily: "Cinzel,serif",
          fontSize: "0.55rem", letterSpacing: 1, color: PALETTE.goldLt,
          background: "rgba(26,10,2,0.85)", border: `1px solid ${PALETTE.gold}`,
          borderRadius: 6, padding: "5px 8px", textTransform: "uppercase",
        }}>Tap the map to drop the {KINDS[placing].label.toLowerCase()} pin</div>
      ) : null}
    </div>
  );
}

// ── The tab ─────────────────────────────────────────────────────────────
export default function MapsTab({ styles, SectionTitle }) {
  const [maps, setMaps] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [placing, setPlacing] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [focus, setFocus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const uploadRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const all = await getMaps();
        setMaps(all);
        setActiveId((id) => id ?? all[0]?.id ?? null);
      } catch { setMaps([]); }
    })();
  }, []);

  const map = (maps || []).find((m) => m.id === activeId) || null;
  const markers = map?.markers || [];

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError("");
    const added = [];
    for (const f of files) {
      try {
        const { dataUrl, w, h } = await prepareMapImage(f);
        const rec = {
          id: newId(),
          name: f.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Map",
          dataUrl, w, h, markers: [], created: Date.now(),
        };
        await addMap(rec);
        added.push(rec);
      } catch {
        setError(`Could not add "${f.name}". Very large images can exceed the browser's storage quota.`);
      }
    }
    if (added.length) {
      setMaps((ms) => [...(ms || []), ...added]);
      setActiveId(added[0].id);
    }
    setBusy(false);
  };

  // Persist on every structural change; skip the write mid-drag so a pin being
  // dragged does not fire a transaction per pointer event.
  const commitMarkers = (next, persist = true) => {
    setMaps((ms) => ms.map((m) => (m.id === activeId ? { ...m, markers: next } : m)));
    if (persist) patchMap(activeId, { markers: next });
  };

  const placePin = (x, y) => {
    const kind = placing || "place";
    const mk = { id: newId(), x, y, kind, label: "", color: KINDS[kind].color };
    commitMarkers([...markers, mk]);
    setSelectedId(mk.id);
    setPlacing(null);
  };

  const moveMarker = (id, x, y, done) =>
    commitMarkers(markers.map((m) => (m.id === id ? { ...m, x, y } : m)), done);

  const patchMarker = (id, fields) =>
    commitMarkers(markers.map((m) => (m.id === id ? { ...m, ...fields } : m)));

  const removeMarker = (id) => {
    commitMarkers(markers.filter((m) => m.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const renameMap = (name) => {
    setMaps((ms) => ms.map((m) => (m.id === activeId ? { ...m, name } : m)));
  };

  const removeMap = async () => {
    if (!map) return;
    if (!confirm(`Delete "${map.name}" and its ${markers.length} pin${markers.length === 1 ? "" : "s"}?`)) return;
    await deleteMap(map.id);
    const rest = maps.filter((m) => m.id !== map.id);
    setMaps(rest);
    setActiveId(rest[0]?.id ?? null);
    setSelectedId(null);
  };

  const selected = markers.find((m) => m.id === selectedId) || null;

  const canvas = (h, fs) => (
    <MapCanvas
      map={map} markers={markers} selectedId={selectedId} placing={placing} focus={focus}
      height={h} fullscreen={fs}
      onPlace={placePin} onMoveMarker={moveMarker} onSelect={setSelectedId}
      onToggleFullscreen={() => setFullscreen((v) => !v)}
    />
  );

  return (
    <div>
      <SectionTitle>Maps</SectionTitle>
      <div style={{ fontSize: "0.8rem", color: PALETTE.inkSoft, marginBottom: 12, lineHeight: 1.45 }}>
        Upload a region or battle map, then drop a pin for the party and one for each character. Drag a pin to move it as you travel. Pinch or scroll to zoom, drag to pan, and tap ⤢ for fullscreen.
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button style={{ ...styles.btn, flex: 1 }} onClick={() => uploadRef.current?.click()} disabled={busy}>🗺 Upload Map</button>
        <input ref={uploadRef} type="file" accept="image/*" multiple onChange={onFiles} style={{ display: "none" }} />
      </div>

      {busy ? <div style={{ color: PALETTE.inkSoft, fontSize: "0.82rem", marginBottom: 10 }}>Processing map…</div> : null}
      {error ? <div style={{ color: PALETTE.rust, fontSize: "0.8rem", marginBottom: 10 }}>{error}</div> : null}

      {maps === null ? (
        <div style={{ color: PALETTE.inkSoft, fontSize: "0.82rem" }}>Loading…</div>
      ) : maps.length === 0 ? (
        <div style={{ ...styles.card, textAlign: "center", color: PALETTE.inkSoft, fontSize: "0.85rem", padding: "26px 12px" }}>
          No maps yet. Tap <b>Upload Map</b> to add your PNGs.
        </div>
      ) : (
        <>
          {/* Map picker */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 10, scrollbarWidth: "none" }}>
            {maps.map((m) => (
              <button key={m.id} onClick={() => { setActiveId(m.id); setSelectedId(null); setPlacing(null); }}
                style={{
                  flex: "0 0 auto", fontFamily: "Cinzel,serif", fontSize: "0.58rem", letterSpacing: 1,
                  textTransform: "uppercase", borderRadius: 8, cursor: "pointer", padding: "6px 11px",
                  border: `1px solid ${PALETTE.gold}`,
                  background: m.id === activeId ? `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})` : "rgba(61,26,5,0.08)",
                  color: m.id === activeId ? PALETTE.goldLt : PALETTE.darkB,
                }}>
                {m.name}{(m.markers || []).length ? ` · ${(m.markers || []).length}` : ""}
              </button>
            ))}
          </div>

          {map ? (
            <>
              {canvas(320, false)}

              {/* Drop-a-pin row */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                {KIND_ORDER.map((k) => (
                  <button key={k} onClick={() => setPlacing((p) => (p === k ? null : k))}
                    style={{
                      ...styles.smallBtn, flex: "1 1 auto",
                      background: placing === k ? `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})` : "rgba(61,26,5,0.08)",
                      color: placing === k ? PALETTE.goldLt : PALETTE.darkB,
                      borderColor: KINDS[k].color,
                    }}>
                    <span style={{ color: placing === k ? PALETTE.goldLt : KINDS[k].color }}>{KINDS[k].icon}</span> {KINDS[k].label}
                  </button>
                ))}
              </div>

              {/* Selected pin editor */}
              {selected ? (
                <div style={{ ...styles.card, marginTop: 10 }}>
                  <div style={{ fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 2, textTransform: "uppercase", color: PALETTE.rust, marginBottom: 7 }}>Pin</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                    <input
                      value={selected.label}
                      placeholder="Label (e.g. Arc-Elf Tanner)"
                      onChange={(e) => patchMarker(selected.id, { label: e.target.value })}
                      style={{ ...styles.input, fontSize: "0.85rem" }}
                    />
                    <button style={styles.removeBtn} title="Delete pin" onClick={() => removeMarker(selected.id)}>✕</button>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {KIND_ORDER.map((k) => (
                      <button key={k} onClick={() => patchMarker(selected.id, { kind: k, color: KINDS[k].color })}
                        style={{
                          ...styles.smallBtn, borderColor: KINDS[k].color,
                          background: selected.kind === k ? `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})` : "rgba(61,26,5,0.08)",
                          color: selected.kind === k ? PALETTE.goldLt : PALETTE.darkB,
                        }}>
                        {KINDS[k].icon} {KINDS[k].label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Pin list */}
              {markers.length ? (
                <>
                  <SectionTitle>Pins on {map.name}</SectionTitle>
                  {markers.map((mk) => {
                    const k = kindOf(mk);
                    return (
                      <div key={mk.id} onClick={() => { setSelectedId(mk.id); setFocus({ id: mk.id, n: Date.now() }); }}
                        style={{
                          ...styles.card, display: "flex", alignItems: "center", gap: 9, cursor: "pointer",
                          marginBottom: 7, padding: "8px 11px",
                          borderColor: mk.id === selectedId ? PALETTE.gold : "rgba(201,136,42,0.3)",
                        }}>
                        <span style={{
                          width: 22, height: 22, borderRadius: "50%", background: mk.color || k.color,
                          color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.75rem", flexShrink: 0,
                        }}>{k.icon}</span>
                        <span style={{ flex: 1, fontSize: "0.88rem", color: mk.label ? PALETTE.ink : PALETTE.inkSoft }}>
                          {mk.label || `Unnamed ${k.label.toLowerCase()}`}
                        </span>
                        <button style={styles.removeBtn} title="Delete pin"
                          onClick={(e) => { e.stopPropagation(); removeMarker(mk.id); }}>✕</button>
                      </div>
                    );
                  })}
                </>
              ) : null}

              {/* Map admin */}
              <SectionTitle>This Map</SectionTitle>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  value={map.name}
                  placeholder="Map name"
                  onChange={(e) => renameMap(e.target.value)}
                  onBlur={(e) => patchMap(map.id, { name: e.target.value })}
                  style={{ ...styles.input, fontSize: "0.85rem" }}
                />
                <button style={styles.btnGhost} onClick={removeMap}>Delete</button>
              </div>
              <div style={{ fontSize: "0.72rem", color: PALETTE.inkSoft, marginTop: 8, lineHeight: 1.4 }}>
                {map.w}×{map.h}px · Maps and pins are stored on this device only — like sheet photos, they are not part of the JSON export.
              </div>
            </>
          ) : null}
        </>
      )}

      {fullscreen && map ? (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, background: "#0f0804", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, minHeight: 0 }}>{canvas("100%", true)}</div>
          <div style={{ display: "flex", gap: 6, padding: 8, background: "#1a0a02", borderTop: `1px solid ${PALETTE.gold}`, flexWrap: "wrap" }}>
            {KIND_ORDER.map((k) => (
              <button key={k} onClick={() => setPlacing((p) => (p === k ? null : k))}
                style={{
                  flex: "1 1 auto", fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 1,
                  textTransform: "uppercase", borderRadius: 7, cursor: "pointer", padding: "7px 8px",
                  border: `1px solid ${KINDS[k].color}`,
                  background: placing === k ? `linear-gradient(135deg,${PALETTE.darkB},${PALETTE.darkC})` : "transparent",
                  color: placing === k ? PALETTE.goldLt : KINDS[k].color,
                }}>
                {KINDS[k].icon} {KINDS[k].label}
              </button>
            ))}
            <button onClick={() => setFullscreen(false)}
              style={{
                flex: "1 1 auto", fontFamily: "Cinzel,serif", fontSize: "0.55rem", letterSpacing: 1,
                textTransform: "uppercase", borderRadius: 7, cursor: "pointer", padding: "7px 8px",
                border: `1px solid ${PALETTE.gold}`, background: "transparent", color: PALETTE.goldLt,
              }}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
