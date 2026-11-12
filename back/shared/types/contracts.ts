export type Phase = 'lobby' | 'playing' | 'meeting' | 'voting' | 'ended';
export type Role = 'crewmate' | 'impostor';
export type Winner = 'crewmates' | 'impostors';
export type TaskKind = 'wires' | 'fuel';
export interface Vector { x: number; y: number }
export interface PlayerPublic { id: string; name: string; ready: boolean; alive: boolean; position: Vector; disconnected?: boolean }
export interface Task { id: string; kind: TaskKind; position: Vector; completed: boolean }
export interface Body { id: string; playerId: string; position: Vector; reported: boolean }
export interface PlayerPrivate { role: Role; tasks: Task[]; killAvailableAt: number }
export interface RoomPublic { code: string; hostId: string; phase: Phase; players: PlayerPublic[]; progress: {completed:number;total:number}; bodies: Body[]; meetingEndsAt: number | null; votingEndsAt:number | null; winner: Winner | null; reason: string | null }
export type Ack<T = Record<string,never>> = {ok:true;data:T} | {ok:false;errorCode:string};
export interface ServerEvents {
 'room:state':(state:RoomPublic)=>void;
 'player:joined':(data:{id:string;name:string})=>void;
 'player:left':(data:{id:string})=>void;
 'game:started':(data:{code:string;phase:Phase})=>void;
 'player:private-state':(state:PlayerPrivate)=>void;
 'game:snapshot':(state:RoomPublic)=>void;
 'task:progress':(progress:{completed:number;total:number})=>void;
 'meeting:started':(data:{reporterId:string;bodyId:string;endsAt:number})=>void;
 'voting:started':(data:{endsAt:number})=>void;
 'vote:result':(data:{votes:Record<string,number>;ejectedId:string|null;skipped:boolean})=>void;
 'game:ended':(data:{winner:Winner;reason:string;roles:Record<string,Role>})=>void;
 'action:rejected':(data:{errorCode:string})=>void;
}
export interface ClientEvents {
 'room:create':(data:{name:string},ack:(a:Ack<{code:string;playerId:string}>)=>void)=>void;
 'room:join':(data:{code:string;name:string},ack:(a:Ack<{code:string;playerId:string}>)=>void)=>void;
 'room:leave':(data:unknown,ack:(a:Ack)=>void)=>void;
 'player:ready':(data:{ready:boolean},ack:(a:Ack)=>void)=>void;
 'game:start':(data:unknown,ack:(a:Ack)=>void)=>void;
 'game:reset':(data:unknown,ack:(a:Ack)=>void)=>void;
 'player:move':(data:{dx:number;dy:number},ack:(a:Ack)=>void)=>void;
 'task:interact':(data:{taskId:string},ack:(a:Ack)=>void)=>void;
 'task:complete':(data:{taskId:string},ack:(a:Ack)=>void)=>void;
 'player:kill':(data:{targetId:string},ack:(a:Ack)=>void)=>void;
 'body:report':(data:{bodyId:string},ack:(a:Ack)=>void)=>void;
 'vote:cast':(data:{targetId:string|null},ack:(a:Ack)=>void)=>void;
}
