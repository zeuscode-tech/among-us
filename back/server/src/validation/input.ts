import type { Ack, Vector } from '../../../shared/types/contracts.js';
export class GameError extends Error { constructor(public readonly code:string){super(code)} }
export const fail = (code:string):never=>{throw new GameError(code)};
export const success = <T>(data:T):Ack<T>=>({ok:true,data});
export const check = (v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
export function nameValue(v:unknown):string {
 if(typeof v!=='string')return fail('INVALID_NAME');
 const s=v.trim();if(s.length<2||s.length>20||! /^[\p{L}\p{N}_ -]+$/u.test(s))return fail('INVALID_NAME');return s;
}
export function roomCode(v:unknown):string {if(typeof v!=='string'||! /^[A-Z0-9]{6}$/.test(v.toUpperCase()))return fail('INVALID_CODE');return v.toUpperCase()}
export function identifier(v:unknown):string {if(typeof v!=='string'||v.length<1||v.length>80||! /^[\w-]+$/.test(v))return fail('INVALID_ID');return v}
export function boolValue(v:unknown):boolean {if(typeof v!=='boolean')return fail('INVALID_READY');return v}
export function direction(v:unknown):Vector {if(!check(v)||typeof v.dx!=='number'||typeof v.dy!=='number'||!Number.isFinite(v.dx)||!Number.isFinite(v.dy)||Math.abs(v.dx)>1||Math.abs(v.dy)>1)return fail('INVALID_MOVE'); return {x:v.dx,y:v.dy}}
export function near(a:Vector,b:Vector,r:number):boolean {return Math.hypot(a.x-b.x,a.y-b.y)<=r}
