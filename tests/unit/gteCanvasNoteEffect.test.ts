import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {expect,it,vi} from 'vitest';
import Effect from '../../components/GteCanvasNoteEffect';

it.each(['b','h','p','/'])('keeps %s visible and selectable when its connector is narrower than a fret label',async label=>{
  const dom=new JSDOM('<!doctype html><div id="root"></div>');
  vi.stubGlobal('window',dom.window); vi.stubGlobal('document',dom.window.document);
  vi.stubGlobal('React',React); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const host=document.getElementById('root')!,root=createRoot(host),onSelect=vi.fn();
  const props={left:100,top:29,width:8,height:17,labelLeft:100.5,label,title:'Effect',selected:false,showLabel:true,onSelect};
  try {
    await act(async()=>root.render(React.createElement(Effect,props)));
    const connector=host.querySelector<HTMLButtonElement>('[data-canvas-effect-connector]')!;
    const badge=host.querySelector<HTMLButtonElement>('[data-canvas-effect-label]')!;
    expect(badge.parentElement).toBe(connector.parentElement); // Not trapped under notes in the connector's stacking context.
    expect(badge.textContent).toBe(label);
    expect(badge.className).toContain('z-20');
    expect(Number.parseFloat(badge.style.top)).toBe(props.top + props.height / 2);
    expect(badge.className).toContain('-translate-y-1/2');
    expect(badge.className).not.toContain('-translate-y-full');
    // The enlarged connector hit area must not push the label into the next fret.
    expect(badge.style.left).toBe('100.5px');
    await act(async()=>badge.dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true})));
    expect(onSelect).toHaveBeenCalledOnce();
    await act(async()=>root.render(React.createElement(Effect,{...props,selected:true})));
    expect(badge.getAttribute('aria-pressed')).toBe('true');
    await act(async()=>root.render(React.createElement(Effect,{...props,showLabel:false})));
    expect(host.querySelector('[data-canvas-effect-label]')).toBeNull();
  } finally {await act(async()=>root.unmount());dom.window.close();vi.unstubAllGlobals();}
});
