import type {Server,Socket} from 'socket.io';
import type {Ack,ClientEvents,ServerEvents} from '../../../shared/types/contracts.js';
import {RoomManager} from '../rooms/manager.js';
import {GameError,check,nameValue,roomCode,identifier,boolValue,direction} from '../validation/input.js';

type IO=Server<ClientEvents,ServerEvents>;
type Client=Socket<ClientEvents,ServerEvents>;
export function registerSockets(io:IO):RoomManager {
 const manager=new RoomManager((code,effects)=>{
  for(const {event,payload,to} of effects){
   if(to)io.to(to).emit(event as keyof ServerEvents,payload as never);
   else io.to(code).emit(event as keyof ServerEvents,payload as never);
  }
 });
 io.on('connection',(socket:Client)=>{
  console.info('connected',socket.id);
  const on=(event:string,handler:(data:unknown)=>unknown)=>{
   socket.on(event as keyof ClientEvents,((data:unknown,callback:unknown)=>{
    const ack:((reply:Ack<unknown>)=>void)|null=typeof callback==='function'?callback as (reply:Ack<unknown>)=>void:null;
    try {const result=handler(data);ack?.({ok:true,data:(result??{}) as Record<string,never>});}
    catch(err){const code=err instanceof GameError?err.code:'INTERNAL_ERROR';if(!(err instanceof GameError))console.error('socket error',err);
     ack?.({ok:false,errorCode:code});socket.emit('action:rejected',{errorCode:code});}
   }) as never);
  };
  on('room:create',(data)=>{if(!check(data))throw new GameError('INVALID_PAYLOAD');const name=nameValue(data.name);const result=manager.create(socket.id,name);socket.join(result.code);socket.emit('room:state',manager.state(manager.rooms.get(result.code)!));return result});
  on('room:join',(data)=>{if(!check(data))throw new GameError('INVALID_PAYLOAD');const code=roomCode(data.code),name=nameValue(data.name);const result=manager.join(socket.id,code,name);socket.join(code);socket.emit('room:state',manager.state(manager.rooms.get(code)!));return result});
  on('room:leave',()=>{const code=manager.getCode(socket.id);manager.leave(socket.id);if(code)socket.leave(code)});
  on('player:ready',(data)=>{if(!check(data))throw new GameError('INVALID_PAYLOAD');manager.ready(socket.id,boolValue(data.ready))});
  on('game:start',()=>manager.start(socket.id));
  on('game:reset',()=>manager.reset(socket.id));
  on('player:move',(data)=>manager.move(socket.id,direction(data)));
  on('task:interact',(data)=>{if(!check(data))throw new GameError('INVALID_PAYLOAD');manager.interact(socket.id,identifier(data.taskId))});
  on('task:complete',(data)=>{if(!check(data))throw new GameError('INVALID_PAYLOAD');manager.complete(socket.id,identifier(data.taskId))});
  on('player:kill',(data)=>{if(!check(data))throw new GameError('INVALID_PAYLOAD');manager.kill(socket.id,identifier(data.targetId))});
  on('body:report',(data)=>{if(!check(data))throw new GameError('INVALID_PAYLOAD');manager.report(socket.id,identifier(data.bodyId))});
  on('vote:cast',(data)=>{if(!check(data))throw new GameError('INVALID_PAYLOAD');manager.vote(socket.id,data.targetId===null?null:identifier(data.targetId))});
  socket.on('disconnect',()=>{manager.leave(socket.id);console.info('disconnected',socket.id)});
 });return manager;
}
