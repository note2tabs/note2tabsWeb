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
  const props={left:100,top:29,width:8,height:17,label,title:'Effect',selected:false,showLabel:true,onSelect};
  try {
    await act(async()=>root.render(React.createElement(Effect,props)));
    const connector=host.querySelector<HTMLButtonElement>('[data-canvas-effect-connector]')!;
    const badge=host.querySelector<HTMLButtonElement>('[data-canvas-effect-label]')!;
    expect(badge.parentElement).toBe(connector.parentElement); // Not trapped under notes in the connector's stacking context.
    expect(badge.textContent).toBe(label);
    expect(badge.className).toContain('z-20');
    expect(Number.parseFloat(badge.style.top)).toBeLessThan(props.top);
    expect(badge.style.left).toBe('104px');
    await act(async()=>badge.dispatchEvent(new dom.window.MouseEvent('mousedown',{bubbles:true})));
    expect(onSelect).toHaveBeenCalledOnce();
    await act(async()=>root.render(React.createElement(Effect,{...props,selected:true})));
    expect(badge.getAttribute('aria-pressed')).toBe('true');
    await act(async()=>root.render(React.createElement(Effect,{...props,showLabel:false})));
    expect(host.querySelector('[data-canvas-effect-label]')).toBeNull();
  } finally {await act(async()=>root.unmount());dom.window.close();vi.unstubAllGlobals();}
});
