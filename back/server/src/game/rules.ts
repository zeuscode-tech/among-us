import type { Role,Winner,Vector } from '../../../shared/types/contracts.js';
export const MIN_PLAYERS=4, MAX_PLAYERS=10, SPEED=170, KILL_DISTANCE=65, TASK_DISTANCE=65, REPORT_DISTANCE=75, KILL_COOLDOWN=20_000;
export const MAP={width:1000,height:700, spawn:{x:140,y:140},walls:[{x:300,y:100,w:40,h:370},{x:550,y:310,w:270,h:40},{x:100,y:510,w:350,h:35}]};
export function inside(p:Vector):boolean {const r=14;if(p.x<r||p.y<r||p.x>MAP.width-r||p.y>MAP.height-r)return false;return !MAP.walls.some(w=>p.x+r>w.x&&p.x-r<w.x+w.w&&p.y+r>w.y&&p.y-r<w.y+w.h)}
export function winnerOf(players: Array<{role:Role;alive:boolean}>,completed:number,total:number):Winner|null {
 const crew=players.filter(p=>p.alive&&p.role==='crewmate').length, imp=players.filter(p=>p.alive&&p.role==='impostor').length;
 if(imp===0)return 'crewmates';if(imp>=crew)return 'impostors';if(total>0&&completed===total)return 'crewmates';return null;
}
