import test from 'node:test';
import assert from 'node:assert/strict';
import {RoomManager} from '../src/rooms/manager.js';
import {inside,winnerOf} from '../src/game/rules.js';
import {nameValue,direction,GameError} from '../src/validation/input.js';

test('validation rejects invalid input',()=>{
 assert.throws(()=>nameValue('<script>'),GameError);
 assert.throws(()=>direction({dx:Infinity,dy:0}),GameError);
 assert.equal(nameValue('  Player  '),'Player');
});
test('walls and boundaries are solid',()=>{
 assert.equal(inside({x:1,y:1}),false);
 assert.equal(inside({x:320,y:200}),false);
 assert.equal(inside({x:140,y:140}),true);
});
test('win conditions',()=>{
 assert.equal(winnerOf([{role:'impostor',alive:true},{role:'crewmate',alive:true}],0,2),'impostors');
 assert.equal(winnerOf([{role:'impostor',alive:false},{role:'crewmate',alive:true}],0,2),'crewmates');
 assert.equal(winnerOf([{role:'impostor',alive:true},{role:'crewmate',alive:true},{role:'crewmate',alive:true}],2,2),'crewmates');
});
test('room lifecycle, host handoff, role privacy, reset',()=>{
 const emitted:{event:string;to?:string;payload:unknown}[]=[];
 const m=new RoomManager((_code,effects)=>emitted.push(...effects));
 const {code}=m.create('a','Alice');assert.match(code,/^[A-Z0-9]{6}$/);
 for(const [id,name] of [['b','Bob'],['c','Carol'],['d','David']])m.join(id,code,name);
 assert.throws(()=>m.start('b'),/NOT_HOST/);
 assert.throws(()=>m.start('a'),/PLAYERS_NOT_READY/);
 for(const id of ['b','c','d'])m.ready(id,true);
 m.start('a');const state=m.state(m.rooms.get(code)!);
 assert.equal(state.phase,'playing');assert.equal(state.players.length,4);
 assert.equal(state.progress.total,6);
 assert.equal(JSON.stringify(state).includes('impostor'),false);
 assert.equal(emitted.filter(e=>e.event==='player:private-state').length,4);
 assert.equal(emitted.filter(e=>e.event==='player:private-state').every(e=>!!e.to),true);
 assert.throws(()=>m.join('e',code,'Ellen'),/WRONG_PHASE/);
 m.leave('a');assert.equal(m.state(m.rooms.get(code)!).hostId,'b');
});
test('single player cannot be in multiple rooms',()=>{
 const m=new RoomManager();m.create('a','Alice');assert.throws(()=>m.create('a','Alice'),/ALREADY_IN_ROOM/);
});
