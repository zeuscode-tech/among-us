import { useEffect, useRef, type RefObject } from "react";
import Phaser from "phaser";
import {
  EVENTS, INPUT_INTERVAL_MS, MAP, collides, movePosition, type BodyState, type GameSnapshot,
  type MoveInput, type MovementDirection, type PositionedPlayer, type Vec,
} from "@among-us/shared";
import { socket } from "../network/socket";
import { createStationMap, type StationMapHandle } from "./map/StationRenderer";

interface CanvasProps {
  snapshots: RefObject<GameSnapshot | null>;
  playerId: string;
  blocked: boolean;
  taskSpots: readonly string[];
}

interface Avatar {
  sprite: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  feet: [Phaser.GameObjects.Ellipse, Phaser.GameObjects.Ellipse];
  target: Vec;
}

export function GameCanvas(props: CanvasProps) {
  const { playerId } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  useEffect(() => { latest.current = props; }, [props]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const parent = document.createElement("div");
    parent.className = "phaser-host";
    container.append(parent);

    let game: Phaser.Game | undefined;
    // React Strict Mode clears the first mount before Phaser can boot it.
    const boot = window.setTimeout(() => {
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        width: 960,
        height: 600,
        backgroundColor: "#07111f",
        scene: new MultiplayerScene(latest),
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      });
    });

    return () => {
      window.clearTimeout(boot);
      game?.destroy(true);
      parent.remove();
    };
  }, [playerId]);

  return <div className="game-canvas" ref={containerRef} aria-label="Игровая карта" />;
}

const IDLE: MovementDirection = { up: false, down: false, left: false, right: false };
const moving = (input: MovementDirection) => Object.values(input).some(Boolean);

class MultiplayerScene extends Phaser.Scene {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private wasd: Record<keyof MovementDirection, Phaser.Input.Keyboard.Key> | undefined;
  private readonly avatars = new Map<string, Avatar>();
  private readonly bodies = new Map<string, Phaser.GameObjects.Container>();
  private snapshot: GameSnapshot | null = null;
  private stationMap: StationMapHandle | undefined;
  private activeSpots = "";
  private sequence = 0;
  private lastSentAt = -Infinity;
  private lastDirection = IDLE;
  private enabled = false;

  constructor(private readonly latest: RefObject<CanvasProps>) {
    super("multiplayer");
  }

  create() {
    this.cameras.main.setBounds(0, 0, MAP.width, MAP.height);
    this.stationMap = createStationMap(this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.stationMap?.destroy());
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.wasd = this.input.keyboard?.addKeys({ up: "W", down: "S", left: "A", right: "D" }) as typeof this.wasd;
    this.applySnapshot();
  }

  update(time: number, delta: number) {
    this.applySnapshot();
    const { playerId, blocked, taskSpots } = this.latest.current;
    const taskKey = taskSpots.join("|");
    if (taskKey !== this.activeSpots) {
      this.activeSpots = taskKey;
      this.stationMap?.highlightTasks(MAP.taskSpots.filter((spot) => taskSpots.includes(spot.id)));
    }

    const local = this.avatars.get(playerId);
    const canMove = this.snapshot?.phase === "playing" && this.snapshot.players.some((p) => p.id === playerId && p.alive);
    const enabled = canMove && !blocked && socket.connected;
    if (this.enabled && !enabled) this.input.keyboard?.resetKeys();
    this.enabled = enabled;
    const direction = enabled ? this.readDirection() : IDLE;
    const hasInput = moving(direction);
    if (canMove && (hasInput || moving(this.lastDirection)) && time - this.lastSentAt >= INPUT_INTERVAL_MS) {
      const input: MoveInput = { ...direction, sequence: this.sequence++ };
      socket.volatile.emit(EVENTS.PLAYER_MOVE, input);
      this.lastDirection = direction;
      this.lastSentAt = time;
    } else if (!canMove) {
      this.lastDirection = IDLE;
    }

    const dt = Math.min(delta, 50);
    for (const avatar of this.avatars.values()) {
      const { sprite, target, feet } = avatar;
      const previous = { x: sprite.x, y: sprite.y };
      const isLocal = avatar === local;
      if (isLocal && hasInput) {
        const predicted = movePosition(sprite, direction, dt / 1000);
        sprite.setPosition(predicted.x, predicted.y);
      } else {
        const blend = 1 - Math.exp(-dt / 47);
        sprite.setPosition(Phaser.Math.Linear(sprite.x, target.x, blend), Phaser.Math.Linear(sprite.y, target.y, blend));
      }
      const stride = Math.hypot(sprite.x - previous.x, sprite.y - previous.y) > 0.2 ? Math.sin(time / 60) * 3 : 0;
      feet[0].y = 14 + stride;
      feet[1].y = 14 - stride;
    }
  }

  private readDirection(): MovementDirection {
    const { cursors, wasd } = this;
    if (!cursors || !wasd) return IDLE;
    return {
      up: cursors.up.isDown || wasd.up.isDown,
      down: cursors.down.isDown || wasd.down.isDown,
      left: cursors.left.isDown || wasd.left.isDown,
      right: cursors.right.isDown || wasd.right.isDown,
    };
  }

  private applySnapshot() {
    const { snapshots, playerId } = this.latest.current;
    const snapshot = snapshots.current;
    if (!snapshot || snapshot === this.snapshot) return;
    const phaseChanged = this.snapshot?.phase !== snapshot.phase;
    this.snapshot = snapshot;

    removeMissing(this.avatars, snapshot.players, (avatar) => avatar.sprite.destroy());
    for (const player of snapshot.players) {
      const isLocal = player.id === playerId;
      const avatar = this.avatars.get(player.id) ?? this.createAvatar(player, isLocal);
      avatar.target = player;
      avatar.sprite.setAlpha(player.alive ? 1 : 0.35);
      const title = `${player.isHost ? "★ " : ""}${player.name}${isLocal ? " · вы" : ""}`;
      if (avatar.label.text !== title) avatar.label.setText(title);

      if (phaseChanged || Phaser.Math.Distance.Between(avatar.sprite.x, avatar.sprite.y, player.x, player.y) > 100) {
        avatar.sprite.setPosition(player.x, player.y);
        if (isLocal) this.cameras.main.centerOn(player.x, player.y);
      } else if (isLocal) {
        this.sequence = Math.max(this.sequence, player.sequence + 1);
        const x = Phaser.Math.Linear(avatar.sprite.x, player.x, 0.25);
        const y = Phaser.Math.Linear(avatar.sprite.y, player.y, 0.25);
        if (!collides(x, y)) avatar.sprite.setPosition(x, y);
      }
    }

    removeMissing(this.bodies, snapshot.bodies, (sprite) => sprite.destroy());
    for (const body of snapshot.bodies) {
      if (!this.bodies.has(body.id)) this.bodies.set(body.id, this.createBody(body));
    }
  }

  private createAvatar(player: PositionedPlayer, isLocal: boolean): Avatar {
    const feet: Avatar["feet"] = [
      this.add.ellipse(-7, 14, 10, 13, player.color).setStrokeStyle(2, 0x091827),
      this.add.ellipse(7, 14, 10, 13, player.color).setStrokeStyle(2, 0x091827),
    ];
    const pack = this.add.rectangle(-14, 0, 13, 22, player.color).setStrokeStyle(2, 0x091827);
    const suit = this.add.ellipse(0, -3, 30, 36, player.color).setStrokeStyle(isLocal ? 2.5 : 2, isLocal ? 0xffffff : 0x091827);
    const visor = this.add.ellipse(5, -8, 22, 13, 0xbef4ff).setStrokeStyle(2, 0x254963);
    const glint = this.add.ellipse(9, -10, 9, 3, 0xffffff, 0.9);
    const label = this.add.text(0, -32, "", {
      fontFamily: "system-ui", fontSize: "14px", fontStyle: "bold",
      color: isLocal ? "#e3fffc" : "#ffffff", stroke: "#07111f", strokeThickness: 4,
    }).setOrigin(0.5, 1);
    const sprite = this.add.container(player.x, player.y, [...feet, pack, suit, visor, glint, label]).setDepth(isLocal ? 22 : 20);
    const avatar = { sprite, label, feet, target: player };
    this.avatars.set(player.id, avatar);
    if (isLocal) {
      this.cameras.main.centerOn(player.x, player.y);
      this.cameras.main.startFollow(sprite, true, 0.2, 0.2);
    }
    return avatar;
  }

  private createBody(body: BodyState) {
    const shadow = this.add.ellipse(0, 5, 47, 25, 0x000000, 0.35);
    const suit = this.add.ellipse(-2, 0, 40, 23, body.color).setAngle(12).setStrokeStyle(2, 0x091827);
    const boot = this.add.ellipse(14, 7, 17, 11, body.color).setStrokeStyle(2, 0x091827);
    const visor = this.add.ellipse(-10, -6, 16, 9, 0x9bcede).setAngle(16).setStrokeStyle(2, 0x254963);
    const marker = this.add.text(0, -26, "!", { fontFamily: "system-ui", fontStyle: "bold", color: "#ffd481",
      stroke: "#07111f", strokeThickness: 4 }).setOrigin(0.5);
    return this.add.container(body.x, body.y, [shadow, suit, boot, visor, marker]).setDepth(10);
  }
}

function removeMissing<T>(existing: Map<string, T>, next: readonly { id: string }[], destroy: (value: T) => void) {
  const ids = new Set(next.map(({ id }) => id));
  for (const [id, value] of existing) {
    if (!ids.has(id)) {
      destroy(value);
      existing.delete(id);
    }
  }
}
