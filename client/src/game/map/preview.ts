/**
 * Превью карты для разработки: http://localhost:5173/map-preview.html
 * WASD / стрелки — двигать камеру, колесо — зум, C — показать коллизии,
 * T — подсветить все точки заданий, ?zoom=0.4&x=1300&y=900 — стартовая позиция.
 */
import Phaser from "phaser";
import { MAP } from "@among-us/shared";
import { createStationMap } from "./StationRenderer";

class MapPreviewScene extends Phaser.Scene {
  private keys!: Record<"w" | "a" | "s" | "d" | "up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
  private debug: Phaser.GameObjects.Graphics | undefined;

  constructor() { super("map-preview"); }

  create() {
    const cam = this.cameras.main;
    cam.setBounds(-400, -400, MAP.width + 800, MAP.height + 800);
    const map = createStationMap(this);
    const q = new URLSearchParams(location.search);
    cam.setZoom(Number(q.get("zoom") ?? 0.45));
    cam.centerOn(Number(q.get("x") ?? MAP.width / 2), Number(q.get("y") ?? MAP.height / 2));

    for (const [i, p] of MAP.spawnPoints.entries()) {
      this.add.circle(p.x, p.y, MAP.playerRadius, [0x2dd4bf, 0xf472b6, 0xfacc15, 0x60a5fa, 0xa78bfa][i % 5]).setStrokeStyle(3, 0xffffff, 0.9);
    }

    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT") as never;
    this.keys = Object.fromEntries(Object.entries(this.keys).map(([k, v]) => [k.toLowerCase(), v])) as never;
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.2, 2));
    });
    this.input.keyboard!.on("keydown-C", () => this.toggleDebug());
    let tasks = false;
    this.input.keyboard!.on("keydown-T", () => { tasks = !tasks; map.highlightTasks(tasks ? MAP.taskSpots : []); });
    if (q.has("debug")) this.toggleDebug();
    if (q.has("tasks")) { tasks = true; map.highlightTasks(MAP.taskSpots); }

  }

  update(_: number, delta: number) {
    const cam = this.cameras.main;
    const speed = (900 / cam.zoom) * (delta / 1000);
    const k = this.keys;
    cam.scrollX += ((k.d.isDown || k.right.isDown ? 1 : 0) - (k.a.isDown || k.left.isDown ? 1 : 0)) * speed;
    cam.scrollY += ((k.s.isDown || k.down.isDown ? 1 : 0) - (k.w.isDown || k.up.isDown ? 1 : 0)) * speed;
  }

  private toggleDebug() {
    if (this.debug) { this.debug.destroy(); this.debug = undefined; return; }
    const g = (this.debug = this.add.graphics().setDepth(150));
    g.fillStyle(0xff0055, 0.35).lineStyle(1, 0xff0055, 1);
    for (const o of MAP.obstacles) { g.fillRect(o.x, o.y, o.width, o.height); g.strokeRect(o.x, o.y, o.width, o.height); }
    g.lineStyle(2, 0x22ff88, 1);
    for (const t of MAP.taskSpots) g.strokeCircle(t.x, t.y, 65);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  backgroundColor: "#030712",
  scene: MapPreviewScene,
  scale: { mode: Phaser.Scale.RESIZE },
});
