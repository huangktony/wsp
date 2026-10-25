'use client';
import { useRef } from 'react';
import { moveRangeHandle, rangeKey, rangeText, timeText, type TimeRange } from '@/lib/availability';
export function AvailabilityRange({ value, minimum = 0, label, onChange }: { value: TimeRange; minimum?: number; label: string; onChange: (value:TimeRange)=>void }) {
  const track=useRef<HTMLDivElement>(null);
  const drag=useRef<{handle:'start'|'end';id:number}|null>(null);
  const move=(clientX:number,handle:'start'|'end')=>{
    const box=track.current?.getBoundingClientRect();
    if (box?.width) onChange(moveRangeHandle(value,handle,(clientX-box.left)/box.width*1440,minimum));
  };
  return <div>
    <p className="mb-1 text-[15px] font-bold" aria-live="polite">{rangeText(value)}</p>
    <div className="px-[22px]">
      <div ref={track} className="relative h-12">
        <div className="absolute inset-x-0 top-5 h-2 rounded-full bg-[#B4CCCF]" />
        <div className="absolute top-5 h-2 rounded-full bg-[#8FB78F]" style={{left:`${value.start/1440*100}%`,width:`${(value.end-value.start)/1440*100}%`}} />
        {(['start','end'] as const).map(handle=><div key={handle} role="slider" tabIndex={0} aria-label={`${label}, ${handle} time`} aria-orientation="horizontal" aria-valuemin={handle==='start'?minimum:value.start+60} aria-valuemax={handle==='start'?value.end-60:1440} aria-valuenow={value[handle]} aria-valuetext={timeText(value[handle])} className="absolute top-0 flex h-12 w-11 -translate-x-1/2 touch-none select-none items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#28536B]" style={{left:`${value[handle]/1440*100}%`,touchAction:'none'}}
          onKeyDown={e=>{const next=rangeKey(value,handle,e.key,minimum);if(next!==value){e.preventDefault();onChange(next);}}}
          onPointerDown={e=>{e.preventDefault();e.currentTarget.focus();e.currentTarget.setPointerCapture(e.pointerId);drag.current={handle,id:e.pointerId};move(e.clientX,handle);}}
          onPointerMove={e=>{if(drag.current?.id===e.pointerId) {e.preventDefault();move(e.clientX,drag.current.handle);}}}
          onPointerUp={e=>{if(drag.current?.id===e.pointerId){drag.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}}}
          onPointerCancel={()=>{drag.current=null;}}
          onLostPointerCapture={()=>{drag.current=null;}}
        ><span aria-hidden="true" className="h-6 w-6 rounded-full border-2 border-[#28536B] bg-white" /></div>)}
      </div>
      <div className="relative mb-5 h-4 text-[10px] text-[#35607A]">{['12 AM','6 AM','12 PM','6 PM','12 AM'].map((t,i)=><span key={i} className="absolute -translate-x-1/2 whitespace-nowrap" style={{left:`${i*25}%`}}>{t}</span>)}</div>
    </div>
  </div>;
}
