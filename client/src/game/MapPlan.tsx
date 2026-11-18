import { MAP_INFO, TASKS, type GameMap, type Vec } from "@among-us/shared";
import type { ReactNode } from "react";

function tile({ x, y, width, height }: Vec & { width: number; height: number }, map: GameMap) {
  return { left: x / map.width * 100 + "%", top: y / map.height * 100 + "%",
    width: width / map.width * 100 + "%", height: height / map.height * 100 + "%" };
}

export function MapPlan({ map, position, pending, close }: {
  map: GameMap;
  position: Vec | undefined;
  pending: readonly string[];
  close: () => void;
}) {
  return (
    <div className="overlay">
      <section className="match-card plan-card" role="dialog" aria-modal="true" aria-label="Схема карты">
        <h2>{MAP_INFO[map.id].name}</h2>
        <div className={`map-plan ${map.id}`} style={{ aspectRatio: map.width / map.height }}>
          {map.corridors.map((entry) => <div key={entry.id} className="plan-corridor" style={tile(entry, map)} />)}
          {map.rooms.map((entry) => <div key={entry.id} className="plan-room" style={{
            ...tile(entry, map), borderColor: `#${entry.accent.toString(16).padStart(6, "0")}`,
            backgroundColor: `#${entry.floor.toString(16).padStart(6, "0")}`,
          }}>{entry.label}</div>)}
          {map.taskSpots.filter((spot) => pending.includes(spot.id)).map((spot) =>
            <MapMarker key={spot.id} map={map} at={spot} label={TASKS[spot.kind].name}>{TASKS[spot.kind].icon}</MapMarker>)}
          {position && <MapMarker map={map} at={position} label="Вы">●</MapMarker>}
        </div>
        <button className="quiet" onClick={close}>Закрыть <kbd>Esc</kbd></button>
      </section>
    </div>
  );
}

function MapMarker({ map, at, label, children }: { map: GameMap; at: Vec; label: string; children: ReactNode }) {
  return <span className="plan-marker" title={label}
    style={{ left: at.x / map.width * 100 + "%", top: at.y / map.height * 100 + "%" }}>{children}</span>;
}
