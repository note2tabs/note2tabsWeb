// @vitest-environment jsdom
import React from "react";
import {act} from "react-dom/test-utils";
import {createRoot,type Root} from "react-dom/client";
import {beforeEach,afterEach,it,expect,vi} from "vitest";
import ReminderEmailPreference from "../../../components/ReminderEmailPreference";
vi.mock("../../../lib/i18n/react",()=>({useLocale:()=>({locale:"fr"})}));
let root:Root,el:HTMLDivElement,fetchMock:ReturnType<typeof vi.fn>;
beforeEach(()=>{el=document.createElement('div');document.body.append(el);root=createRoot(el);fetchMock=vi.fn();vi.stubGlobal('fetch',fetchMock);});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.unstubAllGlobals();});
it("saves an explicit opt-in then revokes it without treating analytics as permission",async()=>{
 fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({mode:'active',allowed:false})});await act(async()=>root.render(React.createElement(ReminderEmailPreference)));
 expect(el.textContent).toContain('Activer les rappels');fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({mode:'active',allowed:true})});await act(async()=>el.querySelector('button')!.click());
 expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({allowed:true});expect(el.textContent).toContain('Désactiver les rappels');
 fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({mode:'active',allowed:false})});await act(async()=>el.querySelector('button')!.click());expect(JSON.parse(fetchMock.mock.calls[2][1].body)).toEqual({allowed:false});expect(el.textContent).toContain('Activer les rappels');
});
it("does not claim a preference was saved after a failed request",async()=>{
 fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({mode:'active',allowed:false})});await act(async()=>root.render(React.createElement(ReminderEmailPreference)));
 fetchMock.mockRejectedValueOnce(new Error('offline'));await act(async()=>el.querySelector('button')!.click());expect(el.querySelector('[role=alert]')).not.toBeNull();expect(el.textContent).toContain('Activer les rappels');
});
it("remains hidden when the capability is disabled",async()=>{fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({mode:'disabled'})});await act(async()=>root.render(React.createElement(ReminderEmailPreference)));expect(el.textContent).toBe('');});
