import Phaser from "phaser";
import { MAP, roomAt, type Box, type Prop, type Room, type TaskSpot } from "@among-us/shared";

/**
 * Отрисовка карты «Орбитальная станция» целиком из кода — без внешних ассетов.
 *
 * Использование в сцене:  `createStationMap(this)` в `create()`.
 * Статичная часть (пол, стены, мебель) запекается в одну RenderTexture, поэтому
 * не нагружает кадр. Поверх — живые слои: звёзды с параллаксом, свет, мигающие
 * экраны, ядро реактора, голограммы и подпись комнаты при входе.
 */

const WALL = 24;
const DEPTH = { space: -100, nebula: -95, base: -40, light: -30, fx: -20, hud: 90 } as const;

export interface StationMapHandle {
  /** Подсветить точки заданий текущего игрока (Sprint 2). */
  highlightTasks(spots: readonly TaskSpot[]): void;
  destroy(): void;
}

export function createStationMap(scene: Phaser.Scene): StationMapHandle {
  makeTextures(scene);
  const objects: Phaser.GameObjects.GameObject[] = [];
  const keep = <T extends Phaser.GameObjects.GameObject>(o: T) => (objects.push(o), o);

  // ── Космос ───────────────────────────────────────────────
  const cam = scene.cameras.main;
  const farStars = keep(scene.add.tileSprite(0, 0, cam.width, cam.height, "st-stars-far").setOrigin(0).setScrollFactor(0).setDepth(DEPTH.space));
  const nearStars = keep(scene.add.tileSprite(0, 0, cam.width, cam.height, "st-stars-near").setOrigin(0).setScrollFactor(0).setDepth(DEPTH.space + 1));
  for (const [x, y, s, tint] of [[300, 1500, 9, 0x6d28d9], [2300, 200, 8, 0x0ea5e9], [1900, 1650, 7, 0xdb2777], [500, 250, 6, 0x2563eb]] as const) {
    keep(scene.add.image(x, y, "st-glow").setScale(s).setTint(tint).setAlpha(0.22).setBlendMode(Phaser.BlendModes.ADD).setScrollFactor(0.55).setDepth(DEPTH.nebula));
  }

  // ── Статичная база ─────────────────────────────────────
  const rt = keep(scene.add.renderTexture(0, 0, MAP.width, MAP.height).setOrigin(0).setDepth(DEPTH.base));
  const g = scene.make.graphics({}, false);
  drawHull(g);
  for (const room of MAP.rooms) drawRoomFloor(g, room);
  for (const c of MAP.corridors) drawCorridorFloor(g, c);
  for (const w of MAP.walls) { g.fillStyle(0x000000, 0.35); g.fillRect(w.x + 4, w.y + 10, w.width, w.height); }
  for (const p of MAP.props) drawPropShadow(g, p);
  for (const w of MAP.walls) drawWall(g, w);
  for (const room of MAP.rooms) drawRoomNeon(g, room);
  drawDoors(g);
  for (const p of MAP.props) drawProp(g, p);
  for (const t of MAP.taskSpots) drawTaskPanel(g, t);
  rt.draw(g);
  g.destroy();

  // ── Свет ───────────────────────────────────────────────
  for (const room of MAP.rooms) {
    const light = keep(scene.add.image(room.x + room.width / 2, room.y + room.height / 2, "st-glow")
      .setScale(Math.max(room.width, room.height) / 150).setTint(room.accent).setAlpha(0.13)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.light));
    scene.tweens.add({ targets: light, alpha: 0.19, duration: 2600 + Math.random() * 1800, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }
  for (const c of MAP.corridors) {
    const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
    keep(scene.add.image(cx, cy, "st-glow").setScale(1.4).setTint(0x93c5fd).setAlpha(0.08).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.light));
  }

  for (const p of MAP.props) addLiveProp(scene, p, keep);
  addElectricalSparks(scene, keep);
  addDust(scene, keep);

  // ── Подпись «ты в комнате» ─────────────────────────────
  const banner = keep(scene.add.text(cam.width / 2, 64, "", {
    fontFamily: "Inter, system-ui, sans-serif", fontSize: "22px", fontStyle: "900", color: "#ffffff",
    stroke: "#030712", strokeThickness: 6,
  }).setOrigin(0.5).setScrollFactor(0).setLetterSpacing(6).setDepth(DEPTH.hud).setAlpha(0));
  let currentRoom: string | undefined;

  // ── Пост-эффект ────────────────────────────────────────
  if (scene.renderer.type === Phaser.WEBGL && cam.postFX) cam.postFX.addVignette(0.5, 0.5, 0.92, 0.32);

  const onUpdate = () => {
    farStars.tilePositionX = cam.scrollX * 0.08;
    farStars.tilePositionY = cam.scrollY * 0.08;
    nearStars.tilePositionX = cam.scrollX * 0.22;
    nearStars.tilePositionY = cam.scrollY * 0.22;
    const room = roomAt(cam.midPoint);
    if (room?.id !== currentRoom) {
      currentRoom = room?.id;
      if (room) {
        banner.setText(room.label).setColor(hex(room.accent));
        scene.tweens.killTweensOf(banner);
        banner.setAlpha(0).y = 80;
        scene.tweens.chain({ targets: banner, tweens: [
          { alpha: 1, y: 64, duration: 260, ease: "Cubic.easeOut" },
          { alpha: 0, duration: 600, delay: 1300 },
        ] });
      }
    }
  };
  const onResize = (size: Phaser.Structs.Size) => {
    farStars.setSize(size.width, size.height);
    nearStars.setSize(size.width, size.height);
    banner.x = size.width / 2;
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
  scene.scale.on(Phaser.Scale.Events.RESIZE, onResize);

  let taskMarkers: Phaser.GameObjects.GameObject[] = [];

  return {
    highlightTasks(spots) {
      for (const m of taskMarkers) m.destroy();
      taskMarkers = spots.flatMap((s) => {
        const ring = scene.add.image(s.x, s.y, "st-ring").setTint(0xfde047).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
        scene.tweens.add({ targets: ring, scale: { from: 0.6, to: 1.25 }, alpha: { from: 1, to: 0 }, duration: 1300, repeat: -1 });
        const arrow = scene.add.triangle(s.x, s.y - 46, 0, 0, 20, 0, 10, 14, 0xfde047).setDepth(DEPTH.hud - 1);
        scene.tweens.add({ targets: arrow, y: s.y - 38, duration: 500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        return [ring, arrow];
      });
    },
    destroy() {
      scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate);
      scene.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      for (const o of [...objects, ...taskMarkers]) o.destroy();
    },
  };
}

// ───────────────────────── текстуры ─────────────────────────

function makeTextures(scene: Phaser.Scene) {
  const tex = scene.textures;
  if (!tex.exists("st-glow")) {
    const c = tex.createCanvas("st-glow", 128, 128)!;
    const ctx = c.getContext();
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    c.refresh();
  }
  if (!tex.exists("st-ring")) {
    const c = tex.createCanvas("st-ring", 96, 96)!;
    const ctx = c.getContext();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(48, 48, 40, 0, Math.PI * 2);
    ctx.stroke();
    c.refresh();
  }
  const stars = (key: string, count: number, maxR: number, seed: number) => {
    if (tex.exists(key)) return;
    const c = tex.createCanvas(key, 512, 512)!;
    const ctx = c.getContext();
    const rnd = mulberry32(seed);
    for (let i = 0; i < count; i++) {
      const r = rnd() * maxR + 0.3;
      const hue = [210, 190, 260, 40][Math.floor(rnd() * 4)];
      ctx.fillStyle = `hsla(${hue}, 80%, ${80 + rnd() * 20}%, ${0.35 + rnd() * 0.65})`;
      ctx.beginPath();
      ctx.arc(rnd() * 512, rnd() * 512, r, 0, Math.PI * 2);
      ctx.fill();
    }
    c.refresh();
  };
  stars("st-stars-far", 260, 0.9, 7);
  stars("st-stars-near", 60, 1.7, 42);
  if (!tex.exists("st-dust")) {
    const c = tex.createCanvas("st-dust", 8, 8)!;
    const ctx = c.getContext();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(4, 4, 2, 0, Math.PI * 2);
    ctx.fill();
    c.refresh();
  }
}

// ───────────────────────── статичные слои ─────────────────────────

function drawHull(g: Phaser.GameObjects.Graphics) {
  const areas: Box[] = [...MAP.rooms, ...MAP.corridors];
  g.fillStyle(0x2a3550, 1);
  for (const a of areas) g.fillRoundedRect(a.x - 14, a.y - 14, a.width + 28, a.height + 28, 18);
  g.fillStyle(0x0c1220, 1);
  for (const a of areas) g.fillRoundedRect(a.x - 10, a.y - 10, a.width + 20, a.height + 20, 14);
  // Иллюминаторы по внешнему корпусу
  g.fillStyle(0x7dd3fc, 0.55);
  for (const r of MAP.rooms) {
    for (let x = r.x + 40; x < r.x + r.width - 30; x += 70) {
      g.fillCircle(x, r.y - 6, 2.5);
      g.fillCircle(x, r.y + r.height + 6, 2.5);
    }
  }
}

function drawRoomFloor(g: Phaser.GameObjects.Graphics, r: Room) {
  g.fillStyle(r.floor, 1);
  g.fillRect(r.x, r.y, r.width, r.height);
  // Плиты 64×64 со скосом
  const tile = 64;
  for (let x = r.x; x < r.x + r.width; x += tile) {
    for (let y = r.y; y < r.y + r.height; y += tile) {
      const w = Math.min(tile, r.x + r.width - x), h = Math.min(tile, r.y + r.height - y);
      g.fillStyle(0xffffff, ((x + y) / tile) % 2 === 0 ? 0.025 : 0.045);
      g.fillRect(x + 2, y + 2, w - 4, h - 4);
      g.fillStyle(0xffffff, 0.06);
      g.fillRect(x + 2, y + 2, w - 4, 2);
      g.fillStyle(0x000000, 0.22);
      g.fillRect(x + 2, y + h - 3, w - 4, 2);
      g.fillStyle(0xffffff, 0.08);
      g.fillCircle(x + 7, y + 7, 1.4);
      g.fillCircle(x + w - 7, y + h - 7, 1.4);
    }
  }
  // Центральный круглый знак комнаты
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  g.lineStyle(3, r.accent, 0.12);
  g.strokeCircle(cx, cy, Math.min(r.width, r.height) * 0.28);
  g.lineStyle(1, r.accent, 0.1);
  g.strokeCircle(cx, cy, Math.min(r.width, r.height) * 0.33);
}

function drawCorridorFloor(g: Phaser.GameObjects.Graphics, c: Box & { axis: "h" | "v" }) {
  g.fillStyle(0x141a28, 1);
  g.fillRect(c.x, c.y, c.width, c.height);
  // Решётка пола
  g.lineStyle(1, 0xffffff, 0.04);
  for (let x = c.x; x <= c.x + c.width; x += 16) g.lineBetween(x, c.y, x, c.y + c.height);
  for (let y = c.y; y <= c.y + c.height; y += 16) g.lineBetween(c.x, y, c.x + c.width, y);
  // Направляющие огни по центру
  const cx = c.x + c.width / 2, cy = c.y + c.height / 2;
  g.fillStyle(0x7dd3fc, 0.55);
  if (c.axis === "h") for (let x = c.x + 20; x < c.x + c.width - 10; x += 40) g.fillRoundedRect(x, cy - 2, 18, 4, 2);
  else for (let y = c.y + 20; y < c.y + c.height - 10; y += 40) g.fillRoundedRect(cx - 2, y, 4, 18, 2);
}

function drawWall(g: Phaser.GameObjects.Graphics, w: Box) {
  g.fillStyle(0x283044, 1);
  g.fillRect(w.x, w.y, w.width, w.height);
  g.fillStyle(0x3d4863, 1);
  g.fillRect(w.x, w.y, w.width, Math.min(8, w.height));
  g.fillStyle(0x111726, 1);
  g.fillRect(w.x, w.y + w.height - 3, w.width, 3);
  // Болты
  g.fillStyle(0x6b7a99, 0.6);
  const along = w.width > w.height;
  const len = along ? w.width : w.height;
  for (let t = 18; t < len - 10; t += 48) {
    if (along) g.fillCircle(w.x + t, w.y + w.height / 2 + 2, 1.6);
    else g.fillCircle(w.x + w.width / 2, w.y + t, 1.6);
  }
}

/** Неоновая полоса по внутреннему краю стен комнаты, с разрывами у дверей. */
function drawRoomNeon(g: Phaser.GameObjects.Graphics, r: Room) {
  const ix = r.x + WALL, iy = r.y + WALL, ix2 = r.x + r.width - WALL, iy2 = r.y + r.height - WALL;
  const holes = (side: string) => MAP.doors.filter((d) => d.roomId === r.id && d.side === side).map((d) => [d.from, d.to] as const);
  const segs = (a: number, b: number, hs: ReadonlyArray<readonly [number, number]>) => {
    const out: Array<[number, number]> = [];
    let cur = a;
    for (const [f, t] of [...hs].sort((p, q) => p[0] - q[0])) { if (f > cur) out.push([cur, f]); cur = Math.max(cur, t); }
    if (cur < b) out.push([cur, b]);
    return out;
  };
  for (const [width, alpha] of [[8, 0.12], [2, 0.85]] as const) {
    g.lineStyle(width, r.accent, alpha);
    for (const [a, b] of segs(ix, ix2, holes("top"))) g.lineBetween(a, iy, b, iy);
    for (const [a, b] of segs(ix, ix2, holes("bottom"))) g.lineBetween(a, iy2, b, iy2);
    for (const [a, b] of segs(iy, iy2, holes("left"))) g.lineBetween(ix, a, ix, b);
    for (const [a, b] of segs(iy, iy2, holes("right"))) g.lineBetween(ix2, a, ix2, b);
  }
}

function drawDoors(g: Phaser.GameObjects.Graphics) {
  for (const d of MAP.doors) {
    const r = MAP.rooms.find((room) => room.id === d.roomId)!;
    const horizontal = d.side === "top" || d.side === "bottom";
    const edge = d.side === "top" ? r.y : d.side === "bottom" ? r.y + r.height - WALL : d.side === "left" ? r.x : r.x + r.width - WALL;
    // Порог с жёлто-чёрной разметкой
    for (let t = d.from, i = 0; t < d.to; t += 14, i++) {
      g.fillStyle(i % 2 ? 0x111111 : 0xfacc15, 0.75);
      const len = Math.min(14, d.to - t);
      if (horizontal) g.fillRect(t, edge + 6, len, WALL - 12);
      else g.fillRect(edge + 6, t, WALL - 12, len);
    }
    // Створки, сложенные в косяки
    g.fillStyle(0x8fa3c7, 1);
    if (horizontal) { g.fillRect(d.from - 6, edge, 6, WALL); g.fillRect(d.to, edge, 6, WALL); }
    else { g.fillRect(edge, d.from - 6, WALL, 6); g.fillRect(edge, d.to, WALL, 6); }
    g.fillStyle(r.accent, 1);
    if (horizontal) { g.fillRect(d.from - 4, edge + 4, 2, WALL - 8); g.fillRect(d.to + 2, edge + 4, 2, WALL - 8); }
    else { g.fillRect(edge + 4, d.from - 4, WALL - 8, 2); g.fillRect(edge + 4, d.to + 2, WALL - 8, 2); }
  }
}

function drawPropShadow(g: Phaser.GameObjects.Graphics, p: Prop) {
  g.fillStyle(0x000000, 0.35);
  if (p.kind === "tank" || p.kind === "reactorCore") g.fillEllipse(p.x + p.width / 2 + 6, p.y + p.height / 2 + 10, p.width, p.height * 0.9);
  else g.fillRoundedRect(p.x + 6, p.y + 10, p.width, p.height, 8);
}

function drawProp(g: Phaser.GameObjects.Graphics, p: Prop) {
  const { x, y, width: w, height: h } = p;
  const cx = x + w / 2, cy = y + h / 2;
  switch (p.kind) {
    case "table": {
      g.fillStyle(0x3a4560, 1);
      for (const sx of [x + 18, x + w / 2, x + w - 18]) { g.fillCircle(sx, y - 12, 9); g.fillCircle(sx, y + h + 12, 9); }
      g.fillStyle(0x5b6a8f, 1); g.fillRoundedRect(x, y, w, h, 12);
      g.fillStyle(0x7586b0, 1); g.fillRoundedRect(x + 4, y + 4, w - 8, h - 14, 9);
      g.fillStyle(0xffffff, 0.12); g.fillRoundedRect(x + 10, y + 8, w - 40, 6, 3);
      g.fillStyle(0xf97316, 0.9); g.fillCircle(cx - 22, cy - 2, 6);
      g.fillStyle(0x22d3ee, 0.9); g.fillRect(cx + 14, cy - 8, 10, 12);
      break;
    }
    case "crate": {
      g.fillStyle(0x7a5a2c, 1); g.fillRoundedRect(x, y, w, h, 4);
      g.fillStyle(0x9c7438, 1); g.fillRect(x + 5, y + 5, w - 10, h - 10);
      g.lineStyle(5, 0x5e431f, 1); g.lineBetween(x + 8, y + 8, x + w - 8, y + h - 8); g.lineBetween(x + w - 8, y + 8, x + 8, y + h - 8);
      g.lineStyle(2, 0x3f2c12, 1); g.strokeRect(x + 5, y + 5, w - 10, h - 10);
      g.fillStyle(0xffffff, 0.15); g.fillRect(x + 5, y + 5, w - 10, 4);
      break;
    }
    case "console": {
      g.fillStyle(0x1f2738, 1); g.fillRoundedRect(x, y, w, h, 6);
      g.fillStyle(0x0b1220, 1); g.fillRoundedRect(x + 5, y + 5, w - 10, h - 10, 4);
      break;
    }
    case "reactorCore": {
      g.fillStyle(0x2a1418, 1); g.fillCircle(cx, cy, w / 2);
      g.lineStyle(6, 0x4b2228, 1); g.strokeCircle(cx, cy, w / 2 - 6);
      g.lineStyle(2, 0xff5a5a, 0.6); g.strokeCircle(cx, cy, w / 2 - 14);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.fillStyle(0x5a2a30, 1); g.fillCircle(cx + Math.cos(a) * (w / 2 - 6), cy + Math.sin(a) * (w / 2 - 6), 6);
      }
      break;
    }
    case "bed": {
      g.fillStyle(0x94a3b8, 1); g.fillRoundedRect(x, y, w, h, 8);
      g.fillStyle(0xe2e8f0, 1); g.fillRoundedRect(x + 5, y + 5, w - 10, h - 10, 6);
      g.fillStyle(0xffffff, 1); g.fillRoundedRect(x + 10, y + 9, w - 20, 18, 6);
      g.fillStyle(0x38bdf8, 0.85); g.fillRoundedRect(x + 6, y + 36, w - 12, h - 42, 5);
      break;
    }
    case "locker": {
      const doors = Math.max(2, Math.round(w / 32));
      for (let i = 0; i < doors; i++) {
        const dw = w / doors;
        g.fillStyle(i % 2 ? 0x56627d : 0x4a5570, 1); g.fillRect(x + i * dw, y, dw - 2, h);
        g.fillStyle(0xcbd5e1, 0.7); g.fillRect(x + i * dw + dw - 9, y + h / 2 - 4, 3, 8);
      }
      break;
    }
    case "navWindow": {
      g.fillStyle(0x020617, 1); g.fillRoundedRect(x, y, w, h, 8);
      g.lineStyle(3, 0x52b4ff, 0.8); g.strokeRoundedRect(x, y, w, h, 8);
      const rnd = mulberry32(5);
      for (let i = 0; i < 30; i++) { g.fillStyle(0xffffff, 0.4 + rnd() * 0.6); g.fillCircle(x + 4 + rnd() * (w - 8), y + 6 + rnd() * (h - 12), rnd() * 1.4 + 0.4); }
      break;
    }
    case "serverRack": {
      g.fillStyle(0x151b29, 1); g.fillRoundedRect(x, y, w, h, 4);
      g.lineStyle(1, 0x334155, 1);
      for (let yy = y + 10; yy < y + h - 4; yy += 12) g.lineBetween(x + 4, yy, x + w - 4, yy);
      break;
    }
    case "tank": {
      g.fillStyle(0x334155, 1); g.fillCircle(cx, cy, w / 2);
      g.fillStyle(0x64748b, 1); g.fillCircle(cx - 3, cy - 3, w / 2 - 6);
      g.fillStyle(0x94a3b8, 1); g.fillCircle(cx - 8, cy - 8, w / 6);
      g.lineStyle(4, 0xfacc15, 0.9); g.strokeCircle(cx, cy, w / 2 - 2);
      g.fillStyle(0x0f172a, 1); g.fillCircle(cx, cy, 6);
      break;
    }
    case "holoTable": {
      g.fillStyle(0x1e293b, 1); g.fillRoundedRect(x, y, w, h, 14);
      g.fillStyle(0x0b1220, 1); g.fillRoundedRect(x + 8, y + 8, w - 16, h - 16, 10);
      g.lineStyle(2, 0x3ee6ff, 0.5); g.strokeRoundedRect(x + 8, y + 8, w - 16, h - 16, 10);
      break;
    }
  }
}

function drawTaskPanel(g: Phaser.GameObjects.Graphics, t: TaskSpot) {
  // Небольшой настенный щиток рядом с точкой задания
  const color = t.kind === "wires" ? 0xfacc15 : 0xf97316;
  g.fillStyle(0x0f172a, 1); g.fillRoundedRect(t.x - 16, t.y - 16, 32, 32, 6);
  g.lineStyle(2, color, 0.9); g.strokeRoundedRect(t.x - 16, t.y - 16, 32, 32, 6);
  g.fillStyle(color, 1);
  if (t.kind === "wires") {
    g.fillTriangle(t.x + 2, t.y - 10, t.x - 7, t.y + 2, t.x, t.y + 2);
    g.fillTriangle(t.x - 2, t.y + 10, t.x + 7, t.y - 2, t.x, t.y - 2);
  } else {
    g.fillRoundedRect(t.x - 6, t.y - 8, 12, 16, 3);
    g.fillStyle(0x0f172a, 1); g.fillRect(t.x - 3, t.y - 4, 6, 4);
  }
}

// ───────────────────────── живые элементы ─────────────────────────

type Keep = <T extends Phaser.GameObjects.GameObject>(o: T) => T;

function addLiveProp(scene: Phaser.Scene, p: Prop, keep: Keep) {
  const { x, y, width: w, height: h } = p;
  const cx = x + w / 2, cy = y + h / 2;
  const room = roomAt({ x: cx, y: cy });
  const accent = room?.accent ?? 0x38bdf8;
  switch (p.kind) {
    case "console": {
      const screen = keep(scene.add.rectangle(cx, cy, w - 14, h - 14, accent, 0.55).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD));
      scene.tweens.add({ targets: screen, alpha: 0.25, duration: 900 + Math.random() * 600, yoyo: true, repeat: -1 });
      keep(scene.add.image(cx, cy, "st-glow").setTint(accent).setScale(0.9).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.light));
      break;
    }
    case "serverRack": {
      for (let yy = y + 6; yy < y + h - 6; yy += 12) {
        for (const dx of [8, 16]) {
          const color = Math.random() > 0.3 ? 0x4ade80 : 0xf87171;
          const led = keep(scene.add.rectangle(x + dx, yy + 2, 4, 3, color).setDepth(DEPTH.fx));
          scene.tweens.add({ targets: led, alpha: 0.15, duration: 200 + Math.random() * 900, yoyo: true, repeat: -1, delay: Math.random() * 1500 });
        }
      }
      break;
    }
    case "reactorCore": {
      const glow = keep(scene.add.image(cx, cy, "st-glow").setTint(0xff3b3b).setScale(2.6).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.light));
      const core = keep(scene.add.circle(cx, cy, 26, 0xff6b6b).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD));
      const inner = keep(scene.add.circle(cx, cy, 12, 0xfff1f1).setDepth(DEPTH.fx));
      scene.tweens.add({ targets: [core, glow], scale: "*=1.12", alpha: "-=0.12", duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      scene.tweens.add({ targets: inner, scale: 1.25, duration: 450, yoyo: true, repeat: -1 });
      const ring = keep(scene.add.graphics({ x: cx, y: cy }).setDepth(DEPTH.fx));
      ring.lineStyle(3, 0xff9a9a, 0.9);
      for (let i = 0; i < 3; i++) { ring.beginPath(); ring.arc(0, 0, 44, (i * 2 * Math.PI) / 3, (i * 2 * Math.PI) / 3 + 1.2); ring.strokePath(); }
      scene.tweens.add({ targets: ring, angle: 360, duration: 5000, repeat: -1 });
      break;
    }
    case "holoTable": {
      const holo = keep(scene.add.graphics({ x: cx, y: cy }).setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD));
      holo.lineStyle(2, accent, 0.9);
      holo.strokeCircle(0, 0, 22);
      holo.strokeCircle(0, 0, 12);
      holo.lineBetween(-28, 0, 28, 0);
      holo.lineBetween(0, -28, 0, 28);
      holo.fillStyle(accent, 0.25); holo.fillCircle(0, 0, 22);
      scene.tweens.add({ targets: holo, angle: 360, duration: 9000, repeat: -1 });
      scene.tweens.add({ targets: holo, alpha: 0.55, duration: 700, yoyo: true, repeat: -1 });
      keep(scene.add.image(cx, cy, "st-glow").setTint(accent).setScale(1.3).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.light));
      break;
    }
    case "navWindow": {
      const glow = keep(scene.add.image(cx - 30, cy, "st-glow").setTint(0x52b4ff).setScale(1.5, 3.4).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.light));
      scene.tweens.add({ targets: glow, alpha: 0.18, duration: 3000, yoyo: true, repeat: -1 });
      break;
    }
    case "bed": {
      const pulse = keep(scene.add.rectangle(cx, y + h - 10, w - 24, 3, 0x4ade80).setDepth(DEPTH.fx));
      scene.tweens.add({ targets: pulse, scaleX: 0.2, duration: 600, yoyo: true, repeat: -1 });
      break;
    }
    default:
      break;
  }
}

function addElectricalSparks(scene: Phaser.Scene, keep: Keep) {
  const elec = MAP.rooms.find((r) => r.id === "electrical");
  if (!elec) return;
  const spark = keep(scene.add.image(elec.x + elec.width / 2, elec.y + 40, "st-glow").setTint(0xfff25a).setScale(2).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.light));
  scene.time.addEvent({
    delay: 2400, loop: true,
    callback: () => scene.tweens.add({ targets: spark, alpha: { from: 0.55, to: 0 }, duration: 90, repeat: 2 }),
  });
}

function addDust(scene: Phaser.Scene, keep: Keep) {
  for (const r of MAP.rooms) {
    keep(scene.add.particles(0, 0, "st-dust", {
      x: { min: r.x + WALL, max: r.x + r.width - WALL },
      y: { min: r.y + WALL, max: r.y + r.height - WALL },
      lifespan: 6000, frequency: 900, quantity: 1,
      speedX: { min: -6, max: 6 }, speedY: { min: -10, max: -2 },
      scale: { min: 0.4, max: 1.1 }, alpha: { start: 0.45, end: 0 },
      tint: r.accent, blendMode: Phaser.BlendModes.ADD,
    }).setDepth(DEPTH.fx));
  }
}

// ───────────────────────── утилиты ─────────────────────────

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
