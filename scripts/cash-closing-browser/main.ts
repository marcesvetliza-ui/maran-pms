import { printClosingSummary } from '@/pages/cash-register';
(window as any).previewClosing = (data: any) => {
  let html = '';
  window.open = (() => ({document: {write: (value: string) => {html=value;},close:()=>{}}})) as any;
  printClosingSummary(data.shift,data.movements,data.systemCash,data.countedCash,data.snapshot);
  return html;
};
