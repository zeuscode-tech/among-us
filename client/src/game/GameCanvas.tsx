import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { Socket } from "socket.io-client";
import { createStationMap, type StationMapHandle } from "./map/StationRenderer";
import { EVENTS, MAP, type MoveInput, type PlayerState, type RoomState } from "@among-us/shared";

interface GameCanvasProps {
  socket: Socket;
  playerId: string;
  initialRoom: RoomState;
  onRoomUpdate: (room: RoomState) => void;
}

export function GameCanvas({ socket, playerId, initialRoom, onRoomUpdate }: GameCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const scene = new MultiplayerScene(socket, playerId, initialRoom, onRoomUpdate);
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: containerRef.current,
      width: 960,
      height: 600,
      backgroundColor: "#07111f",
      physics: { default: "arcade", arcade: { debug: false } },
      scene,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    });
    return () => {
      scene.dispose();
      game.destroy(true);
    };
  }, [socket, playerId]);

  return <div className="game-canvas" ref={containerRef} aria-label="Игровая карта" />;
}

class MultiplayerScene extends Phaser.Scene {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private wasd: Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key> | undefined;
  private readonly sprites = new Map<string, Phaser.GameObjects.Container>();
  private room: RoomState;
  private sequence = 0;
  private lastSentAt = 0;
  private disposed = false;
  private stationMap: StationMapHandle | undefined;

  constructor(
    private readonly socket: Socket,
    private readonly playerId: string,
    initialRoom: RoomState,
    private readonly onRoomUpdate: (room: RoomState) => void,
  ) {
    super("multiplayer");
    this.room = initialRoom;
  }

  create() {
    if (this.disposed) return;
    this.cameras.main.setBounds(0, 0, MAP.width, MAP.height);
    this.stationMap = createStationMap(this);
    this.add.text(28, 24, "WASD / стрелки — движение", { fontFamily: "system-ui", fontSize: "20px", color: "#bae6fd" }).setScrollFactor(0).setDepth(100);
    this.cursors = this.input.keyboard?.createCursorKeys();
    if (this.input.keyboard) {
      const keys = this.input.keyboard.addKeys({ up: "W", down: "S", left: "A", right: "D" });
      this.wasd = keys as Record<"up" | "down" | "left" | "right", Phaser.Input.Keyboard.Key>;
    }
    this.applySnapshot(this.room);
    this.socket.on(EVENTS.GAME_SNAPSHOT, this.applySnapshot);
    this.socket.on(EVENTS.ROOM_STATE, this.applySnapshot);
  }

  update(time: number) {
    if (!this.cursors || !this.wasd || time - this.lastSentAt < 50) return;
    const input: MoveInput = {
      up: this.cursors.up.isDown || this.wasd.up.isDown,
      down: this.cursors.down.isDown || this.wasd.down.isDown,
      left: this.cursors.left.isDown || this.wasd.left.isDown,
      right: this.cursors.right.isDown || this.wasd.right.isDown,
      sequence: this.sequence++,
    };
    if (input.up || input.down || input.left || input.right) this.socket.emit(EVENTS.PLAYER_MOVE, input);
    this.lastSentAt = time;
  }

  dispose() {
    this.disposed = true;
    this.stationMap?.destroy();
    this.socket.off(EVENTS.GAME_SNAPSHOT, this.applySnapshot);
    this.socket.off(EVENTS.ROOM_STATE, this.applySnapshot);
  }

  private readonly applySnapshot = (room: RoomState) => {
    if (this.disposed || !this.sys?.isActive() || !this.add || !this.cameras?.main) return;
    this.room = room;
    this.onRoomUpdate(room);
    const activeIds = new Set(room.players.map((player) => player.id));
    for (const [id, sprite] of this.sprites) {
      if (!activeIds.has(id)) {
        sprite.destroy(true);
        this.sprites.delete(id);
      }
    }
    for (const player of room.players) this.updatePlayer(player);
    const local = this.sprites.get(this.playerId);
    if (local) this.cameras.main.startFollow(local, true, 0.12, 0.12);
  };

  private updatePlayer(player: PlayerState) {
    let sprite = this.sprites.get(player.id);
    if (!sprite) {
      const body = this.add.circle(0, 0, MAP.playerRadius, player.color).setStrokeStyle(player.id === this.playerId ? 4 : 2, 0xffffff, 0.9);
      const visor = this.add.ellipse(7, -5, 18, 10, 0xcffafe);
      const label = this.add.text(0, 28, `${player.isHost ? "★ " : ""}${player.name}`, { fontFamily: "system-ui", fontSize: "15px", color: "#ffffff", stroke: "#07111f", strokeThickness: 4 }).setOrigin(0.5, 0);
      sprite = this.add.container(player.x, player.y, [body, visor, label]);
      this.sprites.set(player.id, sprite);
    }
    this.tweens.add({ targets: sprite, x: player.x, y: player.y, duration: 70, ease: "Linear" });
  }
}
