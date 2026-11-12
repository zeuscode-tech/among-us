import { randomInt } from 'node:crypto';
import type { Body,Phase,PlayerPrivate,PlayerPublic,Role,RoomPublic,Task,Vector,Winner } from '../../../shared/types/contracts.js';
import {fail,near} from '../validation/input.js';
import {inside,MAP,MIN_PLAYERS,MAX_PLAYERS,SPEED,KILL_DISTANCE,KILL_COOLDOWN,TASK_DISTANCE,REPORT_DISTANCE,winnerOf} from '../game/rules.js';

type Player = PlayerPublic & {role:Role;tasks:Task[];killAvailableAt:number;lastMoveAt:number;lastActionAt:number;activeTask:{id:string;since:number}|null};
type Room = {code:string;hostId:string;phase:Phase;players:Map<string,Player>;bodies:Body[];votes:Map<string,string|null>;meetingEndsAt:number|null;votingEndsAt:number|null;winner:Winner|null;reason:string|null;timer:ReturnType<typeof setTimeout>|null};
export type Effect = {event:string;payload:unknown;to?:string};
const codeChars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode():string {return Array.from({length:6},()=>codeChars[randomInt(codeChars.length)]).join('')}
export class RoomManager {
 readonly rooms=new Map<string,Room>();
 readonly memberToRoom=new Map<string,string>();
 constructor(private readonly emit:(code:string,effects:Effect[])=>void=()=>{},private readonly now:()=>number=Date.now){}
 private room(id:string):Room {const code=this.memberToRoom.get(id);const room=code&&this.rooms.get(code);if(!room)return fail('NOT_IN_ROOM');return room}
 private player(room:Room,id:string):Player {return room.players.get(id)??fail('NOT_IN_ROOM')}
 private phase(room:Room,p:Phase):void {if(room.phase!==p)fail('WRONG_PHASE')}
 private publicPlayer(p:Player):PlayerPublic {return {id:p.id,name:p.name,ready:p.ready,alive:p.alive,position:{...p.position}}}
 state(room:Room):RoomPublic {
  const tasks=[...room.players.values()].filter(p=>p.role==='crewmate'&&p.alive).flatMap(p=>p.tasks);
  return {code:room.code,hostId:room.hostId,phase:room.phase,players:[...room.players.values()].map(p=>this.publicPlayer(p)),progress:{completed:tasks.filter(t=>t.completed).length,total:tasks.length},bodies:room.bodies.map(b=>({...b,position:{...b.position}})),meetingEndsAt:room.meetingEndsAt,votingEndsAt:room.votingEndsAt,winner:room.winner,reason:room.reason};
 }
 private broadcast(room:Room,event='room:state'):void {this.emit(room.code,[{event,payload:this.state(room)}])}
 private privateState(p:Player):PlayerPrivate {return {role:p.role,tasks:p.tasks.map(t=>({...t,position:{...t.position}})),killAvailableAt:p.killAvailableAt}}
 private sendPrivate(room:Room,p:Player):void {this.emit(room.code,[{event:'player:private-state',payload:this.privateState(p),to:p.id}])}
 create(id:string,name:string):{code:string;playerId:string} {
  if(this.memberToRoom.has(id))return fail('ALREADY_IN_ROOM');if(this.rooms.size>=1000)return fail('ROOM_LIMIT');
  let code:string;do{code=newCode()}while(this.rooms.has(code));
  const room:Room={code,hostId:id,phase:'lobby',players:new Map(),bodies:[],votes:new Map(),meetingEndsAt:null,votingEndsAt:null,winner:null,reason:null,timer:null};
  this.rooms.set(code,room);this.addPlayer(room,id,name);return {code,playerId:id};
 }
 join(id:string,code:string,name:string):{code:string;playerId:string} {
  if(this.memberToRoom.has(id))return fail('ALREADY_IN_ROOM');const room=this.rooms.get(code);if(!room)return fail('ROOM_NOT_FOUND');this.phase(room,'lobby');
  if(room.players.size>=MAX_PLAYERS)return fail('ROOM_FULL');this.addPlayer(room,id,name);return {code,playerId:id};
 }
 private addPlayer(room:Room,id:string,name:string):void {
  if([...room.players.values()].some(p=>p.name.toLowerCase()===name.toLowerCase()))return fail('NAME_TAKEN');
  room.players.set(id,{id,name,ready:false,alive:true,position:{...MAP.spawn},role:'crewmate',tasks:[],killAvailableAt:0,lastMoveAt:0,lastActionAt:0,activeTask:null});this.memberToRoom.set(id,room.code);
  this.emit(room.code,[{event:'player:joined',payload:{id,name}}]);this.broadcast(room);
 }
 getCode(id:string):string|null{return this.memberToRoom.get(id)??null}
 leave(id:string):void {
  const code=this.memberToRoom.get(id);if(!code)return;
  const room=this.rooms.get(code);this.memberToRoom.delete(id);if(!room)return;
  room.players.delete(id);room.votes.delete(id);
  this.emit(code,[{event:'player:left',payload:{id}}]);
  if(room.players.size===0){if(room.timer)clearTimeout(room.timer);this.rooms.delete(code);return}
  if(room.hostId===id)room.hostId=room.players.keys().next().value!;
  if(room.phase==='playing'||room.phase==='meeting'||room.phase==='voting'){
   if(room.phase==='voting'&&[...room.players.values()].filter(p=>p.alive).every(p=>room.votes.has(p.id)))this.resolveVote(room);
   else this.checkWin(room);
  }
  this.broadcast(room);
 }
 ready(id:string,ready:boolean):void {const room=this.room(id);this.phase(room,'lobby');this.player(room,id).ready=ready;this.broadcast(room)}
 start(id:string):void {
  const room=this.room(id);this.phase(room,'lobby');if(room.hostId!==id)return fail('NOT_HOST');
  if(room.players.size<MIN_PLAYERS||room.players.size>MAX_PLAYERS)return fail('INVALID_PLAYER_COUNT');
  if([...room.players.values()].some(p=>p.id!==id&&!p.ready))return fail('PLAYERS_NOT_READY');
  if(room.timer)clearTimeout(room.timer);room.phase='playing';room.winner=null;room.reason=null;room.bodies=[];room.votes.clear();room.meetingEndsAt=null;room.votingEndsAt=null;
  const ps=[...room.players.values()];const shuffled=[...ps];for(let i=shuffled.length-1;i>0;i--){const j=randomInt(i+1);[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]]}
  const impostors=new Set(shuffled.slice(0,ps.length<=6?1:2).map(p=>p.id));
  for(const [i,p] of ps.entries()){
   p.role=impostors.has(p.id)?'impostor':'crewmate';p.alive=true;p.ready=false;p.position={x:MAP.spawn.x+(i%3)*30,y:MAP.spawn.y+Math.floor(i/3)*30};p.lastMoveAt=0;p.lastActionAt=0;p.killAvailableAt=this.now()+KILL_COOLDOWN;p.activeTask=null;
   p.tasks=p.role==='crewmate'?[{id:`${p.id}-wires`,kind:'wires',position:{x:190,y:420},completed:false},{id:`${p.id}-fuel`,kind:'fuel',position:{x:820,y:550},completed:false}]:[];
   this.sendPrivate(room,p);
  }
  this.emit(room.code,[{event:'game:started',payload:{code:room.code,phase:room.phase}}]);this.broadcast(room,'game:snapshot');
 }
 reset(id:string):void {
  const room=this.room(id);this.phase(room,'ended');if(room.hostId!==id)return fail('NOT_HOST');if(room.timer)clearTimeout(room.timer);
  room.phase='lobby';room.winner=null;room.reason=null;room.bodies=[];room.votes.clear();room.meetingEndsAt=null;room.votingEndsAt=null;
  for(const p of room.players.values()){p.role='crewmate';p.tasks=[];p.alive=true;p.ready=false;p.activeTask=null;p.position={...MAP.spawn}}
  this.broadcast(room);
 }
 move(id:string,d:Vector):void {
  const room=this.room(id);this.phase(room,'playing');const p=this.player(room,id);if(!p.alive)return fail('PLAYER_DEAD');const now=this.now();
  if(p.lastMoveAt&&now-p.lastMoveAt<35)return fail('RATE_LIMIT');
  const elapsed=p.lastMoveAt?Math.min(100,Math.max(0,now-p.lastMoveAt)):50;p.lastMoveAt=now;
  const mag=Math.hypot(d.x,d.y);if(mag>1){d={x:d.x/mag,y:d.y/mag}}
  const delta=SPEED*elapsed/1000;
  const x={x:p.position.x+d.x*delta,y:p.position.y};if(inside(x))p.position=x;
  const y={x:p.position.x,y:p.position.y+d.y*delta};if(inside(y))p.position=y;
  this.broadcast(room,'game:snapshot');
 }
 private interaction(room:Room,id:string):Player {
  this.phase(room,'playing');const p=this.player(room,id);if(!p.alive)return fail('PLAYER_DEAD');
  const now=this.now();if(now-p.lastActionAt<150)return fail('RATE_LIMIT');p.lastActionAt=now;return p;
 }
 interact(id:string,taskId:string):void {
  const room=this.room(id),p=this.interaction(room,id);const t=p.tasks.find(t=>t.id===taskId);if(!t||t.completed)return fail('INVALID_TASK');
  if(!near(p.position,t.position,TASK_DISTANCE))return fail('TOO_FAR');p.activeTask={id:taskId,since:this.now()};
 }
 complete(id:string,taskId:string):void {
  const room=this.room(id),p=this.interaction(room,id);const t=p.tasks.find(t=>t.id===taskId);if(!t||t.completed)return fail('INVALID_TASK');
  if(!p.activeTask||p.activeTask.id!==taskId||this.now()-p.activeTask.since<1200)return fail('TASK_NOT_STARTED');
  if(!near(p.position,t.position,TASK_DISTANCE))return fail('TOO_FAR');t.completed=true;p.activeTask=null;
  const progress=this.state(room).progress;this.emit(room.code,[{event:'task:progress',payload:progress}]);this.sendPrivate(room,p);this.checkWin(room);this.broadcast(room,'game:snapshot');
 }
 kill(id:string,targetId:string):void {
  const room=this.room(id),p=this.interaction(room,id);if(p.role!=='impostor')return fail('NOT_IMPOSTOR');
  if(this.now()<p.killAvailableAt)return fail('KILL_COOLDOWN');const target=room.players.get(targetId);
  if(!target||!target.alive||target.role==='impostor'||target.id===id)return fail('INVALID_TARGET');
  if(!near(p.position,target.position,KILL_DISTANCE))return fail('TOO_FAR');target.alive=false;p.killAvailableAt=this.now()+KILL_COOLDOWN;
  room.bodies.push({id:`body-${target.id}`,playerId:target.id,position:{...target.position},reported:false});this.sendPrivate(room,p);this.checkWin(room);this.broadcast(room,'game:snapshot');
 }
 report(id:string,bodyId:string):void {
  const room=this.room(id),p=this.interaction(room,id);const body=room.bodies.find(b=>b.id===bodyId&&!b.reported);if(!body)return fail('INVALID_BODY');
  if(!near(p.position,body.position,REPORT_DISTANCE))return fail('TOO_FAR');body.reported=true;room.phase='meeting';room.meetingEndsAt=this.now()+45_000;
  this.emit(room.code,[{event:'meeting:started',payload:{reporterId:id,bodyId,endsAt:room.meetingEndsAt}}]);this.broadcast(room,'game:snapshot');
  room.timer=setTimeout(()=>this.beginVoting(room),45_000);
 }
 private beginVoting(room:Room):void {
  if(room.phase!=='meeting')return;room.phase='voting';room.meetingEndsAt=null;room.votingEndsAt=this.now()+30_000;room.votes.clear();
  this.emit(room.code,[{event:'voting:started',payload:{endsAt:room.votingEndsAt}}]);this.broadcast(room,'game:snapshot');room.timer=setTimeout(()=>this.resolveVote(room),30_000);
 }
 vote(id:string,targetId:string|null):void {
  const room=this.room(id);this.phase(room,'voting');const p=this.player(room,id);if(!p.alive)return fail('PLAYER_DEAD');if(room.votes.has(id))return fail('ALREADY_VOTED');
  if(targetId!==null&&(!room.players.get(targetId)?.alive))return fail('INVALID_TARGET');room.votes.set(id,targetId);
  if([...room.players.values()].filter(p=>p.alive).every(p=>room.votes.has(p.id)))this.resolveVote(room);
 }
 private resolveVote(room:Room):void {
  if(room.phase!=='voting')return;if(room.timer)clearTimeout(room.timer);room.timer=null;
  const counts=new Map<string,number>();for(const target of room.votes.values()){const key=target??'skip';counts.set(key,(counts.get(key)??0)+1)}
  const sorted=[...counts.entries()].sort((a,b)=>b[1]-a[1]);const leader=sorted[0];
  const ejectedId=leader&&leader[0]!=='skip'&&(!sorted[1]||leader[1]>sorted[1][1])?leader[0]:null;
  if(ejectedId)room.players.get(ejectedId)!.alive=false;
  room.phase='playing';room.votingEndsAt=null;room.votes.clear();room.bodies=[];
  this.emit(room.code,[{event:'vote:result',payload:{votes:Object.fromEntries(counts),ejectedId,skipped:ejectedId===null}}]);
  this.checkWin(room);this.broadcast(room,'game:snapshot');
 }
 private checkWin(room:Room):void {
  if(room.phase==='ended'||room.phase==='lobby')return;
  const state=this.state(room), winner=winnerOf([...room.players.values()],state.progress.completed,state.progress.total);
  if(!winner)return;if(room.timer)clearTimeout(room.timer);room.timer=null;room.phase='ended';room.meetingEndsAt=null;room.votingEndsAt=null;room.winner=winner;
  room.reason=winner==='impostors'?'IMPOSTOR_PARITY':([...room.players.values()].some(p=>p.alive&&p.role==='impostor')?'TASKS_COMPLETED':'ALL_IMPOSTORS_ELIMINATED');
  this.emit(room.code,[{event:'game:ended',payload:{winner,reason:room.reason,roles:Object.fromEntries([...room.players.values()].map(p=>[p.id,p.role]))}}]);
 }
 // Exposed for deterministic tests; phases still require the same transition logic.
 advanceToVoting(code:string):void {const r=this.rooms.get(code);if(r)this.beginVoting(r)}
}
