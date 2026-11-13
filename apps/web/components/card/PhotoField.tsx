'use client';

/*
 * Someone's photo, in their edit form: add one, change it, or take it off.
 *
 * A photo is placed before it is sent. The person drags and zooms it inside a
 * circle, the same circle it is seen through on the tree, and only that part
 * leaves the device: a small square JPEG, drawn afresh, so nothing a camera
 * wrote into the file (where it was taken, on what phone) goes with it.
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { api, messageOf } from '@/lib/api';

const VIEW = 220;        // the circle on screen, in CSS pixels
const SENT = 320;        // the side of the square that is sent
const MAX_ZOOM = 4;

interface Picked {
  address: string;
  width: number;
  height: number;
}

/* Where the picture sits in the circle: how far its middle is from the circle's, and how much it is enlarged beyond just filling it. */
interface Placing {
  x: number;
  y: number;
  zoom: number;
}

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

/* The picture always covers the whole circle, however it is dragged. */
function settle(picked: Picked, { x, y, zoom }: Placing): Placing & { scale: number } {
  const scale = (VIEW / Math.min(picked.width, picked.height)) * zoom;
  return { zoom, scale, x: clamp(x, (picked.width * scale - VIEW) / 2), y: clamp(y, (picked.height * scale - VIEW) / 2) };
}

function Cropper({ picked, onUse, onCancel }: { picked: Picked; onUse(image: string, preview: string): Promise<void>; onCancel(): void }) {
  const [placing, setPlacing] = useState<Placing>({ x: 0, y: 0, zoom: 1 });
  const [busy, setBusy] = useState(false);
  const picture = useRef<HTMLImageElement>(null);
  const grip = useRef<{ id: number; x: number; y: number } | null>(null);
  const at = settle(picked, placing);
  const move = (dx: number, dy: number) => setPlacing((was) => settle(picked, { ...was, x: was.x + dx, y: was.y + dy }));
  const zoomTo = (zoom: number) => setPlacing((was) => settle(picked, { ...was, zoom: Math.max(1, Math.min(MAX_ZOOM, zoom)) }));

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    grip.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const held = grip.current;
    if (!held || held.id !== event.pointerId) return;
    move(event.clientX - held.x, event.clientY - held.y);
    grip.current = { id: held.id, x: event.clientX, y: event.clientY };
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, () => void> = {
      ArrowLeft: () => move(12, 0), ArrowRight: () => move(-12, 0), ArrowUp: () => move(0, 12), ArrowDown: () => move(0, -12),
      '+': () => zoomTo(placing.zoom + 0.2), '=': () => zoomTo(placing.zoom + 0.2), '-': () => zoomTo(placing.zoom - 0.2),
    };
    const action = step[event.key];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  };

  const use = async () => {
    const image = picture.current;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SENT;
    const pen = canvas.getContext('2d');
    if (!image || !pen) return;
    // The part of the picture that shows in the circle, in the picture's own pixels
    const side = VIEW / at.scale;
    pen.drawImage(image, picked.width / 2 - at.x / at.scale - side / 2, picked.height / 2 - at.y / at.scale - side / 2, side, side, 0, 0, SENT, SENT);
    const preview = canvas.toDataURL('image/jpeg', 0.86);
    setBusy(true);
    try {
      await onUse(preview.slice(preview.indexOf(',') + 1), preview);
    } finally {
      setBusy(false);
    }
  };

  const shown: CSSProperties = { width: picked.width * at.scale, height: picked.height * at.scale, transform: `translate(calc(-50% + ${at.x}px), calc(-50% + ${at.y}px))` };
  return (
    <div className="crop">
      <div
        className="crop-view"
        style={{ width: VIEW, height: VIEW }}
        tabIndex={0}
        role="group"
        aria-label="Place the face in the circle. Drag, or use the arrow keys. Plus and minus zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => { grip.current = null; }}
        onPointerCancel={() => { grip.current = null; }}
        onWheel={(event) => zoomTo(placing.zoom - event.deltaY * 0.002)}
        onKeyDown={onKeyDown}
      >
        <img ref={picture} src={picked.address} alt="" draggable={false} style={shown} />
      </div>
      <label className="crop-zoom">
        <span>Zoom</span>
        <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={placing.zoom} onChange={(event) => zoomTo(Number(event.target.value))} />
      </label>
      <p className="hint-line">Drag the photo so the face sits in the circle.</p>
      <div className="form-actions">
        <button type="button" className="primary" disabled={busy} onClick={() => void use()}>Use this photo</button>
        <button type="button" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

/*
 * `current` is the address of the photo they have now. `value` is what the
 * form will save: undefined to leave it as it is, an id for a new photo, or
 * null to take the photo off.
 */
export function PhotoField({ current, value, onChange }: { current: string | null; value: string | null | undefined; onChange(value: string | null): void }) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const chooser = useRef<HTMLInputElement>(null);

  // The picked file is held as an address of its own for as long as it is being placed
  useEffect(() => () => { if (picked) URL.revokeObjectURL(picked.address); }, [picked]);

  const pick = (file: File | undefined) => {
    if (!file) return;
    setProblem('');
    const address = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => setPicked({ address, width: probe.naturalWidth, height: probe.naturalHeight });
    probe.onerror = () => {
      URL.revokeObjectURL(address);
      setProblem('That file could not be opened as a photo. Try a JPEG or a PNG.');
    };
    probe.src = address;
  };
  const send = async (image: string, shown: string) => {
    try {
      const { id } = await api.post<{ id: string }>('/api/media', { image });
      setPreview(shown);
      setPicked(null);
      onChange(id);
    } catch (error) {
      setProblem(messageOf(error));
    }
  };

  const showing = value === undefined ? current : value === null ? null : preview;
  return (
    <div className="photo-field wide">
      <span className="photo-label">Photo</span>
      {picked ? <Cropper picked={picked} onUse={send} onCancel={() => setPicked(null)} /> : (
        <div className="photo-row">
          <div className="photo-now">{showing ? <img src={showing} alt="" /> : <span aria-hidden="true" />}</div>
          <button type="button" onClick={() => chooser.current?.click()}>{showing ? 'Change photo' : 'Add a photo'}</button>
          {showing && <button type="button" className="danger" onClick={() => { setPreview(null); onChange(null); }}>Remove photo</button>}
        </div>
      )}
      {problem && <p className="warning" role="alert">{problem}</p>}
      {/* The same file can be chosen twice in a row, so the chooser is emptied each time */}
      <input ref={chooser} type="file" accept="image/*" hidden onChange={(event) => { pick(event.target.files?.[0]); event.target.value = ''; }} />
    </div>
  );
}
